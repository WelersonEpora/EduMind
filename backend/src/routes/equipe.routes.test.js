"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste, criarEquipe } = require("../../test/helpers/banco");
const { SENHA, sessaoDeTeste, criarUsuario, entrar } = require("../../test/helpers/acesso");
const { criarApp } = require("../app");

// Membros da equipe, administração da plataforma e troca de senha (etapa 4b-2).

async function subir(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "edumind-equipe-"));
  const sequelize = await abrirBancoDeTeste(t);
  const servidor = criarApp({ sequelize, dataDir, sessao: sessaoDeTeste() }).listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  t.after(() => servidor.close());
  return { sequelize, base: `http://127.0.0.1:${servidor.address().port}` };
}

const json = (metodo, corpo) => ({ method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });

const loginCom = (base, email, senha) =>
  fetch(`${base}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, senha }) });

test("orientador inclui membros: conta nova entra com a senha dada; conta existente só ganha o vínculo", async (t) => {
  const { sequelize, base } = await subir(t);
  const equipe = await criarEquipe(sequelize, "Alfa");
  await criarUsuario(sequelize, { email: "ori@teste.br", nome: "Orientadora", equipes: [{ id: equipe, papel: "orientador" }] });
  await criarUsuario(sequelize, { email: "ja@teste.br", nome: "Já Tinha Conta", equipes: [{ id: await criarEquipe(sequelize, "Outra") }] });
  const api = await entrar(base, "ori@teste.br");
  const url = `${base}/api/v1/equipe/membros`;

  const nova = await api(url, json("POST", { nome: "Paulo", email: " Paulo@Teste.br ", senha: "inicial-123", papel: "professor" }));
  assert.equal(nova.status, 201);
  const corpo = await nova.json();
  assert.equal(corpo.contaJaExistia, false);
  assert.deepEqual([corpo.data.nome, corpo.data.email, corpo.data.papel, corpo.data.ativo], ["Paulo", "paulo@teste.br", "professor", true]);
  assert.equal((await loginCom(base, "paulo@teste.br", "inicial-123")).status, 200);

  const existente = await api(url, json("POST", { nome: "Outro nome", email: "ja@teste.br", senha: "ignorada-123", papel: "aluno" }));
  assert.equal(existente.status, 201);
  const corpoExistente = await existente.json();
  assert.equal(corpoExistente.contaJaExistia, true);
  assert.equal(corpoExistente.data.nome, "Já Tinha Conta");
  assert.equal((await loginCom(base, "ja@teste.br", SENHA)).status, 200);
  assert.equal((await loginCom(base, "ja@teste.br", "ignorada-123")).status, 401);

  assert.equal((await api(url, json("POST", { email: "ja@teste.br", papel: "aluno" }))).status, 409);
  for (const invalido of [
    { nome: "X", email: "sem-arroba", senha: "inicial-123", papel: "aluno" },
    { nome: "X", email: "x@teste.br", senha: "curta", papel: "aluno" },
    { nome: "X", email: "x@teste.br", senha: "inicial-123", papel: "diretor" },
    { email: "x@teste.br", senha: "inicial-123", papel: "aluno" }
  ]) {
    assert.equal((await api(url, json("POST", invalido))).status, 400, JSON.stringify(invalido));
  }

  const { data: alfa } = await (await api(`${base}/api/v1/equipe`)).json();
  assert.equal(alfa.nome, "Alfa");
  assert.deepEqual(alfa.membros.map((m) => m.email).sort(), ["ja@teste.br", "ori@teste.br", "paulo@teste.br"]);
});

test("só o orientador muda a equipe; professor e aluno só veem", async (t) => {
  const { sequelize, base } = await subir(t);
  const equipe = await criarEquipe(sequelize, "Alfa");
  await criarUsuario(sequelize, { email: "ori@teste.br", equipes: [{ id: equipe, papel: "orientador" }] });
  await criarUsuario(sequelize, { email: "prof@teste.br", equipes: [{ id: equipe, papel: "professor" }] });
  const apiProf = await entrar(base, "prof@teste.br");
  const { data } = await (await apiProf(`${base}/api/v1/equipe`)).json();
  assert.equal(data.membros.length, 2);

  const membro = data.membros.find((m) => m.email === "ori@teste.br");
  assert.equal((await apiProf(`${base}/api/v1/equipe`, json("PATCH", { nome: "Nova" }))).status, 403);
  assert.equal((await apiProf(`${base}/api/v1/equipe/membros`, json("POST", { nome: "X", email: "x@teste.br", senha: "inicial-123", papel: "aluno" }))).status, 403);
  assert.equal((await apiProf(`${base}/api/v1/equipe/membros/${membro.id}`, json("PATCH", { ativo: false }))).status, 403);
});

test("papel e desativação: o desativado perde o acesso; a equipe não fica sem orientador; membro de outra equipe dá 404", async (t) => {
  const { sequelize, base } = await subir(t);
  const [alfa, beta] = [await criarEquipe(sequelize, "Alfa"), await criarEquipe(sequelize, "Beta")];
  await criarUsuario(sequelize, { email: "ori@teste.br", equipes: [{ id: alfa, papel: "orientador" }] });
  await criarUsuario(sequelize, { email: "aluno@teste.br", equipes: [{ id: alfa, papel: "aluno" }] });
  await criarUsuario(sequelize, { email: "beta@teste.br", equipes: [{ id: beta, papel: "orientador" }] });
  const api = await entrar(base, "ori@teste.br");
  const apiAluno = await entrar(base, "aluno@teste.br");
  const { data } = await (await api(`${base}/api/v1/equipe`)).json();
  const [eu, aluno] = ["ori@teste.br", "aluno@teste.br"].map((email) => data.membros.find((m) => m.email === email));
  const patch = (membroId, corpo) => api(`${base}/api/v1/equipe/membros/${membroId}`, json("PATCH", corpo));

  // A única orientadora não pode sair nem deixar de ser orientadora.
  assert.equal((await patch(eu.id, { ativo: false })).status, 409);
  assert.equal((await patch(eu.id, { papel: "professor" })).status, 409);

  // Com o aluno promovido a orientador, ela pode deixar o papel.
  assert.equal((await (await patch(aluno.id, { papel: "orientador" })).json()).data.papel, "orientador");
  assert.equal((await (await patch(eu.id, { papel: "professor" })).json()).data.papel, "professor");
  assert.equal((await patch(aluno.id, { papel: "aluno" })).status, 403);

  // O antigo aluno, agora orientador, desativa a antiga orientadora; ela perde o acesso à equipe.
  const apiNovo = apiAluno;
  assert.equal((await (await apiNovo(`${base}/api/v1/equipe/membros/${eu.id}`, json("PATCH", { ativo: false }))).json()).data.ativo, false);
  assert.equal((await api(`${base}/api/v1/editais`)).status, 403);

  const { data: dadosBeta } = await (await (await entrar(base, "beta@teste.br"))(`${base}/api/v1/equipe`)).json();
  assert.equal((await apiNovo(`${base}/api/v1/equipe/membros/${dadosBeta.membros[0].id}`, json("PATCH", { ativo: false }))).status, 404);
  assert.equal((await apiNovo(`${base}/api/v1/equipe/membros/${aluno.id}`, json("PATCH", {}))).status, 400);
});

test("o orientador renomeia a equipe", async (t) => {
  const { sequelize, base } = await subir(t);
  await criarUsuario(sequelize, { email: "ori@teste.br", equipes: [{ id: await criarEquipe(sequelize, "Alfa"), papel: "orientador" }] });
  const api = await entrar(base, "ori@teste.br");
  assert.equal((await api(`${base}/api/v1/equipe`, json("PATCH", { nome: "  " }))).status, 400);
  assert.equal((await (await api(`${base}/api/v1/equipe`, json("PATCH", { nome: "Cursinho Alfa" }))).json()).data.nome, "Cursinho Alfa");
});

test("administrador: cria equipe com orientador, sem precisar de equipe; quem não é administrador recebe 403", async (t) => {
  const { sequelize, base } = await subir(t);
  await criarUsuario(sequelize, { email: "admin@teste.br", admin: true });
  await criarUsuario(sequelize, { email: "ori@teste.br", equipes: [{ id: await criarEquipe(sequelize, "Alfa"), papel: "orientador" }] });
  const admin = await entrar(base, "admin@teste.br");

  assert.equal((await (await entrar(base, "ori@teste.br"))(`${base}/api/v1/admin/equipes`)).status, 403);
  assert.equal((await admin(`${base}/api/v1/editais`)).status, 403);

  const criada = await admin(`${base}/api/v1/admin/equipes`, json("POST", { nome: "Beta", orientador: { nome: "Bia", email: "bia@teste.br", senha: "inicial-123" } }));
  assert.equal(criada.status, 201);
  assert.deepEqual((await criada.json()).data.membros.map((m) => [m.nome, m.papel]), [["Bia", "orientador"]]);
  assert.equal((await admin(`${base}/api/v1/admin/equipes`, json("POST", { nome: "Gama", orientador: { email: "x" } }))).status, 400);
  assert.equal((await admin(`${base}/api/v1/admin/equipes`, json("POST", { nome: "Gama", orientador: { nome: "X", email: "x@teste.br", senha: "inicial-123" } }))).status, 201);

  const lista = (await (await admin(`${base}/api/v1/admin/equipes`)).json()).data;
  assert.deepEqual(lista.map((e) => [e.nome, e.orientadores.map((o) => o.email), e.membros_ativos]), [
    ["Alfa", ["ori@teste.br"], 1],
    ["Beta", ["bia@teste.br"], 1],
    ["Gama", ["x@teste.br"], 1]
  ]);

  // A orientadora nova entra com a senha que o administrador deu e já está na equipe dela.
  const login = await loginCom(base, "bia@teste.br", "inicial-123");
  assert.deepEqual((await login.json()).data.equipes.map((e) => [e.nome, e.papel]), [["Beta", "orientador"]]);
});

test("trocar a própria senha: exige a atual e o tamanho mínimo", async (t) => {
  const { sequelize, base } = await subir(t);
  await criarUsuario(sequelize, { email: "ana@teste.br", equipes: [{ id: await criarEquipe(sequelize) }] });
  const api = await entrar(base, "ana@teste.br");
  const url = `${base}/api/v1/auth/senha`;

  assert.equal((await fetch(url, json("PUT", { atual: SENHA, nova: "nova-senha-1" }))).status, 401);
  assert.equal((await api(url, json("PUT", { atual: "errada", nova: "nova-senha-1" }))).status, 400);
  assert.equal((await api(url, json("PUT", { atual: SENHA, nova: "curta" }))).status, 400);
  assert.equal((await api(url, json("PUT", { atual: SENHA, nova: "nova-senha-1" }))).status, 204);
  assert.equal((await loginCom(base, "ana@teste.br", SENHA)).status, 401);
  assert.equal((await loginCom(base, "ana@teste.br", "nova-senha-1")).status, 200);
});

test("editar a conta: só de quem é só desta equipe e não é administrador; a própria, em Minha conta", async (t) => {
  const { sequelize, base } = await subir(t);
  const [alfa, beta] = [await criarEquipe(sequelize, "Alfa"), await criarEquipe(sequelize, "Beta")];
  await criarUsuario(sequelize, { email: "ori@teste.br", equipes: [{ id: alfa, papel: "orientador" }] });
  await criarUsuario(sequelize, { email: "so-alfa@teste.br", nome: "Só Alfa", equipes: [{ id: alfa, papel: "aluno" }] });
  await criarUsuario(sequelize, { email: "duas@teste.br", equipes: [{ id: alfa, papel: "professor" }, { id: beta, papel: "orientador", ativo: false }] });
  await criarUsuario(sequelize, { email: "admin@teste.br", admin: true, equipes: [{ id: alfa, papel: "aluno" }] });
  const api = await entrar(base, "ori@teste.br");
  const { data } = await (await api(`${base}/api/v1/equipe`)).json();
  const membro = Object.fromEntries(data.membros.map((m) => [m.email, m]));
  assert.deepEqual(
    Object.fromEntries(data.membros.map((m) => [m.email, m.conta_editavel])),
    { "ori@teste.br": true, "so-alfa@teste.br": true, "duas@teste.br": false, "admin@teste.br": false }
  );
  const patch = (email, corpo) => api(`${base}/api/v1/equipe/membros/${membro[email].id}`, json("PATCH", corpo));

  // Quem é só desta equipe: o orientador corrige o nome e o e-mail e redefine a senha, junto com o papel.
  const editado = await patch("so-alfa@teste.br", { nome: "Aluno Alfa", email: "Novo@Teste.br", senha: "redefinida-1", papel: "professor" });
  assert.equal(editado.status, 200);
  const corpo = (await editado.json()).data;
  assert.deepEqual([corpo.nome, corpo.email, corpo.papel], ["Aluno Alfa", "novo@teste.br", "professor"]);
  assert.equal((await loginCom(base, "novo@teste.br", "redefinida-1")).status, 200);
  assert.equal((await loginCom(base, "so-alfa@teste.br", SENHA)).status, 401);

  assert.equal((await patch("so-alfa@teste.br", { email: "duas@teste.br" })).status, 409);
  assert.equal((await patch("so-alfa@teste.br", { senha: "curta" })).status, 400);
  assert.equal((await patch("so-alfa@teste.br", { nome: " " })).status, 400);

  // Conta em outra equipe (mesmo desativada lá), de administrador ou a própria: e-mail e senha não mudam; o nome e o
  // vínculo, sim.
  for (const email of ["duas@teste.br", "admin@teste.br", "ori@teste.br"]) {
    assert.equal((await patch(email, { senha: "tomada-123" })).status, 403, email);
    assert.equal((await patch(email, { email: "tomado@teste.br" })).status, 403, email);
    assert.equal((await loginCom(base, email, "tomada-123")).status, 401, email);
    const renomeado = await patch(email, { nome: `Nome de ${email}` });
    assert.equal(renomeado.status, 200, email);
    assert.equal((await renomeado.json()).data.nome, `Nome de ${email}`);
  }
  assert.equal((await (await patch("duas@teste.br", { papel: "aluno", ativo: false })).json()).data.ativo, false);
});

test("Minha conta: o nome muda direto; o e-mail exige a senha atual e não pode ser de outra conta", async (t) => {
  const { sequelize, base } = await subir(t);
  await criarUsuario(sequelize, { email: "ana@teste.br", nome: "Anna", equipes: [{ id: await criarEquipe(sequelize) }] });
  await criarUsuario(sequelize, { email: "outra@teste.br" });
  const api = await entrar(base, "ana@teste.br");
  const url = `${base}/api/v1/auth/conta`;

  // Rota com o limite do login (10 por minuto): o teste fica abaixo dele.
  assert.equal((await api(url, json("PUT", { nome: "  " }))).status, 400);
  const renomeada = await api(url, json("PUT", { nome: "Ana" }));
  assert.equal(renomeada.status, 200);
  assert.equal((await renomeada.json()).data.nome, "Ana");

  assert.equal((await api(url, json("PUT", { email: "ana2@teste.br" }))).status, 400);
  assert.equal((await api(url, json("PUT", { email: "ana2@teste.br", atual: "errada" }))).status, 400);
  assert.equal((await api(url, json("PUT", { email: "outra@teste.br", atual: SENHA }))).status, 409);
  // O mesmo e-mail (com outra caixa) não conta como mudança: não pede a senha.
  assert.equal((await api(url, json("PUT", { nome: "Ana", email: "ANA@teste.br" }))).status, 200);
  const novoEmail = await api(url, json("PUT", { email: "Ana2@Teste.br", atual: SENHA }));
  assert.equal((await novoEmail.json()).data.email, "ana2@teste.br");
  assert.equal((await loginCom(base, "ana2@teste.br", SENHA)).status, 200);
});

test("administrador corrige nome, e-mail e senha de quem não é administrador", async (t) => {
  const { sequelize, base } = await subir(t);
  const [alfa, beta] = [await criarEquipe(sequelize, "Alfa"), await criarEquipe(sequelize, "Beta")];
  await criarUsuario(sequelize, { email: "admin@teste.br", admin: true });
  const outroAdmin = await criarUsuario(sequelize, { email: "outro-admin@teste.br", admin: true });
  await criarUsuario(sequelize, { email: "ori@teste.br", nome: "Orientdora", equipes: [{ id: alfa, papel: "orientador" }, { id: beta, papel: "aluno" }] });
  const admin = await entrar(base, "admin@teste.br");
  const apiOri = await entrar(base, "ori@teste.br");
  const lista = (await (await admin(`${base}/api/v1/admin/equipes`)).json()).data;
  const ori = lista.find((e) => e.nome === "Alfa").orientadores[0];
  assert.equal(ori.admin, false);
  const url = (id) => `${base}/api/v1/admin/usuarios/${id}`;

  // Mesmo em duas equipes, o administrador corrige a conta.
  const corrigida = await admin(url(ori.usuario_id), json("PATCH", { nome: "Orientadora", senha: "redefinida-1" }));
  assert.equal(corrigida.status, 200);
  assert.equal((await corrigida.json()).data.nome, "Orientadora");
  assert.equal((await loginCom(base, "ori@teste.br", "redefinida-1")).status, 200);

  assert.equal((await admin(url(ori.usuario_id), json("PATCH", { email: "outro-admin@teste.br" }))).status, 409);
  assert.equal((await admin(url(ori.usuario_id), json("PATCH", {}))).status, 400);
  assert.equal((await admin(url("nao-e-uuid"), json("PATCH", { nome: "X" }))).status, 404);
  assert.equal((await admin(url(outroAdmin), json("PATCH", { senha: "tomada-123" }))).status, 403);
  assert.equal((await apiOri(url(ori.usuario_id), json("PATCH", { nome: "X" }))).status, 403);
});
