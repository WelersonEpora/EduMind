"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste, criarEquipe } = require("../../test/helpers/banco");
const { SENHA, sessaoDeTeste, criarUsuario, entrar } = require("../../test/helpers/acesso");
const { pdfMinimo } = require("../../test/helpers/pdf-minimo");
const { criarApp } = require("../app");

// Login, equipe e isolamento entre equipes (etapa 4a).

async function subir(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "edumind-acesso-"));
  const sequelize = await abrirBancoDeTeste(t);
  const servidor = criarApp({ sequelize, dataDir, sessao: sessaoDeTeste() }).listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  t.after(() => servidor.close());
  return { sequelize, base: `http://127.0.0.1:${servidor.address().port}` };
}

const login = (base, corpo) =>
  fetch(`${base}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });

function formulario(buffer, nome, campos = {}) {
  const form = new FormData();
  form.append("arquivo", new Blob([buffer], { type: "application/pdf" }), nome);
  for (const [chave, valor] of Object.entries(campos)) form.append(chave, valor);
  return form;
}

test("login: senha errada, e-mail desconhecido e usuário desativado dão 401 com a mesma mensagem", async (t) => {
  const { sequelize, base } = await subir(t);
  const equipe = await criarEquipe(sequelize);
  await criarUsuario(sequelize, { email: "ana@teste.br", equipes: [{ id: equipe }] });
  await criarUsuario(sequelize, { email: "inativo@teste.br", ativo: false, equipes: [{ id: equipe }] });

  for (const corpo of [
    { email: "ana@teste.br", senha: "errada" },
    { email: "ninguem@teste.br", senha: SENHA },
    { email: "inativo@teste.br", senha: SENHA }
  ]) {
    const resposta = await login(base, corpo);
    assert.equal(resposta.status, 401);
    assert.equal((await resposta.json()).error.message, "E-mail ou senha inválidos.");
  }
  assert.equal((await login(base, { email: "ana@teste.br" })).status, 400);
});

test("login: cookie httpOnly, /me com as equipes, e-mail sem distinção de maiúsculas; logout encerra", async (t) => {
  const { sequelize, base } = await subir(t);
  const equipe = await criarEquipe(sequelize, "Equipe da Ana");
  await criarUsuario(sequelize, { email: "ana@teste.br", nome: "Ana", equipes: [{ id: equipe, papel: "orientador" }] });

  const resposta = await login(base, { email: "  ANA@teste.br ", senha: SENHA });
  assert.equal(resposta.status, 200);
  const cookie = resposta.headers.get("set-cookie");
  assert.match(cookie, /^edumind_sessao=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  const usuario = (await resposta.json()).data;
  assert.equal(usuario.senha_hash, undefined);

  const comCookie = { headers: { cookie: cookie.split(";")[0] } };
  const eu = (await (await fetch(`${base}/api/v1/auth/me`, comCookie)).json()).data;
  assert.equal(eu.nome, "Ana");
  assert.deepEqual(eu.equipes, [{ id: equipe, nome: "Equipe da Ana", papel: "orientador" }]);

  const saida = await fetch(`${base}/api/v1/auth/logout`, { method: "POST" });
  assert.equal(saida.status, 204);
  assert.match(saida.headers.get("set-cookie"), /edumind_sessao=;/);
});

test("sem sessão, com token inválido ou com usuário desativado depois do login: 401; /health continua aberto", async (t) => {
  const { sequelize, base } = await subir(t);
  const usuario = await criarUsuario(sequelize, { email: "ana@teste.br", equipes: [{ id: await criarEquipe(sequelize) }] });
  const api = await entrar(base, "ana@teste.br");

  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/v1/editais`)).status, 401);
  assert.equal((await fetch(`${base}/api/v1/auth/me`)).status, 401);
  assert.equal((await fetch(`${base}/api/v1/editais`, { headers: { cookie: "edumind_sessao=falso" } })).status, 401);
  assert.equal((await api(`${base}/api/v1/editais`)).status, 200);

  await sequelize.models.Usuario.update({ ativo: false }, { where: { id: usuario } });
  assert.equal((await api(`${base}/api/v1/editais`)).status, 401);
});

test("equipe: sem equipe 403; com duas, precisa escolher; equipe alheia ou vínculo desativado 403", async (t) => {
  const { sequelize, base } = await subir(t);
  const [a, b, c] = [await criarEquipe(sequelize, "A"), await criarEquipe(sequelize, "B"), await criarEquipe(sequelize, "C")];
  await criarUsuario(sequelize, { email: "sem@teste.br" });
  await criarUsuario(sequelize, {
    email: "prof@teste.br",
    equipes: [{ id: a, papel: "professor" }, { id: b, papel: "aluno" }, { id: c, papel: "aluno", ativo: false }]
  });

  const semEquipe = await (await entrar(base, "sem@teste.br"))(`${base}/api/v1/editais`);
  assert.equal(semEquipe.status, 403);

  const semEscolher = await (await entrar(base, "prof@teste.br"))(`${base}/api/v1/editais`);
  assert.equal(semEscolher.status, 400);
  assert.equal((await semEscolher.json()).error.codigo, "equipe_nao_escolhida");

  assert.equal((await (await entrar(base, "prof@teste.br", { equipeId: b }))(`${base}/api/v1/editais`)).status, 200);
  assert.equal((await (await entrar(base, "prof@teste.br", { equipeId: c }))(`${base}/api/v1/editais`)).status, 403);
  assert.equal((await (await entrar(base, "prof@teste.br", { equipeId: "nao-e-uuid" }))(`${base}/api/v1/editais`)).status, 403);

  const eu = (await (await (await entrar(base, "prof@teste.br"))(`${base}/api/v1/auth/me`)).json()).data;
  assert.deepEqual(eu.equipes.map((e) => [e.nome, e.papel]), [["A", "professor"], ["B", "aluno"]]);
});

test("isolamento: o edital e a prova de uma equipe não aparecem nem se alteram pela outra; o mesmo PDF entra nas duas", async (t) => {
  const { sequelize, base } = await subir(t);
  const [a, b] = [await criarEquipe(sequelize, "A"), await criarEquipe(sequelize, "B")];
  await criarUsuario(sequelize, { email: "a@teste.br", equipes: [{ id: a }] });
  await criarUsuario(sequelize, { email: "b@teste.br", equipes: [{ id: b }] });
  const apiA = await entrar(base, "a@teste.br");
  const apiB = await entrar(base, "b@teste.br");
  const pdfEdital = pdfMinimo([["Edital de abertura"]]);
  const pdfProva = pdfMinimo([["1. Assinale a alternativa correta."]]);

  const { data: edital } = await (await apiA(`${base}/api/v1/editais`, { method: "POST", body: formulario(pdfEdital, "e.pdf") })).json();
  const { data: prova } = await (await apiA(`${base}/api/v1/provas`, { method: "POST", body: formulario(pdfProva, "p.pdf", { banca: "VUNESP" }) })).json();

  // B não vê nem mexe em nada de A.
  assert.deepEqual((await (await apiB(`${base}/api/v1/editais`)).json()).data, []);
  assert.deepEqual((await (await apiB(`${base}/api/v1/provas`)).json()).data, []);
  for (const [metodo, url] of [
    ["GET", `/api/v1/editais/${edital.id}`],
    ["GET", `/api/v1/editais/${edital.id}/arquivo`],
    ["GET", `/api/v1/editais/${edital.id}/paginas/1`],
    ["GET", `/api/v1/editais/${edital.id}/cobertura`],
    ["POST", `/api/v1/editais/${edital.id}/extracao`],
    ["PATCH", `/api/v1/editais/${edital.id}/metadados`],
    ["GET", `/api/v1/provas/${prova.id}/questoes`],
    ["GET", `/api/v1/provas/${prova.id}/arquivos/prova`],
    ["PATCH", `/api/v1/provas/${prova.id}`],
    ["DELETE", `/api/v1/provas/${prova.id}`],
    ["POST", `/api/v1/provas/${prova.id}/leitura`]
  ]) {
    const resposta = await apiB(`${base}${url}`, { method: metodo, headers: { "content-type": "application/json" }, body: metodo === "GET" ? undefined : "{}" });
    assert.equal(resposta.status, 404, `${metodo} ${url}`);
  }

  // O mesmo PDF enviado por B vira um edital e uma prova novos, de B.
  const deB = await apiB(`${base}/api/v1/editais`, { method: "POST", body: formulario(pdfEdital, "e.pdf") });
  assert.equal(deB.status, 201);
  const editalDeB = (await deB.json()).data;
  assert.notEqual(editalDeB.id, edital.id);
  const provaDeB = await apiB(`${base}/api/v1/provas`, { method: "POST", body: formulario(pdfProva, "p.pdf") });
  assert.equal(provaDeB.status, 201);

  // Nem escolher a prova de outra equipe para o próprio edital, nem enviar prova para o edital de outra equipe.
  assert.equal((await apiB(`${base}/api/v1/editais/${editalDeB.id}/provas/${prova.id}`, { method: "PUT" })).status, 404);
  const paraOEditalDeA = await apiB(`${base}/api/v1/provas`, { method: "POST", body: formulario(pdfMinimo([["outra"]]), "o.pdf", { edital_id: edital.id }) });
  assert.equal(paraOEditalDeA.status, 404);

  // A continua vendo só o que é seu.
  assert.deepEqual((await (await apiA(`${base}/api/v1/editais`)).json()).data.map((e) => e.id), [edital.id]);
  assert.deepEqual((await (await apiA(`${base}/api/v1/provas`)).json()).data.map((p) => p.id), [prova.id]);
  assert.equal((await apiA(`${base}/api/v1/editais/${edital.id}/provas/${prova.id}`, { method: "PUT" })).status, 200);
});
