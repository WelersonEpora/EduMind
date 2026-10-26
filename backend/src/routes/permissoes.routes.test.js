"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste, criarEquipe } = require("../../test/helpers/banco");
const { sessaoDeTeste, criarUsuario, entrar } = require("../../test/helpers/acesso");
const { criarApp } = require("../app");

// Permissões por papel (etapa 4c): o aluno só lê os editais atribuídos a ele e a biblioteca; o professor faz tudo no
// conteúdo, menos excluir prova e extrair de novo por cima de uma revisão; só o orientador atribui editais.

async function subir(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "edumind-permissoes-"));
  const sequelize = await abrirBancoDeTeste(t);
  const servidor = criarApp({ sequelize, dataDir, sessao: sessaoDeTeste() }).listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  t.after(() => servidor.close());
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const equipe = await criarEquipe(sequelize);
  const outra = await criarEquipe(sequelize, "Outra equipe");
  await criarUsuario(sequelize, { email: "ori@teste.br", equipes: [{ id: equipe, papel: "orientador" }] });
  await criarUsuario(sequelize, { email: "prof@teste.br", equipes: [{ id: equipe, papel: "professor" }] });
  const alunoId = await criarUsuario(sequelize, { email: "aluno@teste.br", equipes: [{ id: equipe, papel: "aluno" }] });

  const { Edital, EditalPagina, Prova, Norma, EditalAluno, Membro } = sequelize.models;
  const criarEdital = async (equipeId, nome) => {
    const id = randomUUID();
    await Edital.create({ id, equipe_id: equipeId, arquivo_nome: nome, arquivo_sha256: id.replace(/-/g, "").padEnd(64, "0"), arquivo_bytes: 1, total_paginas: 1 });
    await EditalPagina.create({ edital_id: id, numero: 1, texto: "Edital" });
    return id;
  };
  const atribuido = await criarEdital(equipe, "atribuido.pdf");
  const naoAtribuido = await criarEdital(equipe, "outro.pdf");
  const daOutraEquipe = await criarEdital(outra, "da-outra.pdf");
  await EditalAluno.create({ edital_id: atribuido, usuario_id: alunoId });
  const prova = randomUUID();
  await Prova.create({ id: prova, equipe_id: equipe });
  const norma = randomUUID();
  await Norma.create({ id: norma, chave: "br:lei:9099:1995", tipo: "Lei", numero: "9.099", ano: "1995", nome: "Juizados" });
  const { id: membroAluno } = await Membro.findOne({ where: { usuario_id: alunoId }, raw: true });

  const sessao = (email) => entrar(base, email, { equipeId: equipe });
  const chamar = (fetchComSessao, metodo, url, corpo) =>
    fetchComSessao(`${base}/api/v1${url}`, {
      method: metodo,
      headers: { "content-type": "application/json" },
      ...(corpo !== undefined && { body: JSON.stringify(corpo) })
    });
  return { sequelize, sessao, chamar, atribuido, naoAtribuido, daOutraEquipe, prova, norma, membroAluno, alunoId };
}

test("aluno: lê só os editais atribuídos e a biblioteca; o resto é 403", async (t) => {
  const { sessao, chamar, atribuido, naoAtribuido, prova, norma } = await subir(t);
  const aluno = await sessao("aluno@teste.br");

  const lista = await (await chamar(aluno, "GET", "/editais")).json();
  assert.deepEqual(lista.data.map((e) => e.id), [atribuido]);
  for (const url of [`/editais/${atribuido}`, `/editais/${atribuido}/conteudo`, `/editais/${atribuido}/cobertura`, `/editais/${atribuido}/paginas/1`]) {
    assert.equal((await chamar(aluno, "GET", url)).status, 200, url);
  }
  // O simulador do edital atribuído (etapa 5a): o treino sem disciplina é 400, não 403.
  assert.equal((await chamar(aluno, "GET", `/editais/${atribuido}/simulador`)).status, 200);
  assert.equal((await chamar(aluno, "POST", `/editais/${atribuido}/simulador/treino`, {})).status, 400);
  assert.equal((await chamar(aluno, "GET", `/editais/${naoAtribuido}/simulador`)).status, 404);
  assert.equal((await chamar(aluno, "GET", `/editais/${naoAtribuido}`)).status, 404);
  assert.equal((await chamar(aluno, "GET", `/editais/${naoAtribuido}/conteudo`)).status, 404);

  for (const [metodo, url, corpo] of [
    ["GET", `/editais/${atribuido}/fontes`],
    ["GET", `/editais/${atribuido}/provas`],
    ["PATCH", `/editais/${atribuido}/metadados`, { caminho: "campos.banca", status: "aprovado" }],
    ["POST", `/editais/${atribuido}/extracao`, {}],
    ["PUT", `/editais/${atribuido}/cobertura/citacoes/${randomUUID()}/estrutura`, { conferida: true }],
    ["GET", "/provas"],
    ["GET", `/provas/${prova}/questoes`],
    ["POST", "/normas", { jurisdicao: "BR", tipo: "Lei", numero: "1", ano: "2000", nome: "x" }],
    ["POST", `/normas/${norma}/buscar-url`],
    ["PATCH", `/normas/${norma}`, { url: null }],
    ["GET", "/equipe"]
  ]) {
    assert.equal((await chamar(aluno, metodo, url, corpo)).status, 403, `${metodo} ${url}`);
  }

  assert.equal((await chamar(aluno, "GET", "/normas")).status, 200);
  assert.equal((await chamar(aluno, "GET", `/normas/${norma}`)).status, 200);
});

test("professor: trabalha no conteúdo, mas não exclui prova nem extrai de novo por cima da revisão", async (t) => {
  const { sessao, chamar, atribuido, naoAtribuido, prova, norma } = await subir(t);
  const professor = await sessao("prof@teste.br");

  // Vê todos os editais da equipe, sem atribuição.
  assert.deepEqual((await (await chamar(professor, "GET", "/editais")).json()).data.map((e) => e.id).sort(), [atribuido, naoAtribuido].sort());
  assert.equal((await chamar(professor, "GET", "/provas")).status, 200);
  assert.equal((await chamar(professor, "PATCH", `/normas/${norma}`, { url: null })).status, 200);

  assert.equal((await chamar(professor, "DELETE", `/provas/${prova}`)).status, 403);
  assert.equal((await chamar(professor, "POST", `/editais/${atribuido}/extracao`, { confirmarPerdaDaRevisao: true })).status, 403);
});

// A extração pelo orientador não é chamada aqui: ela iria ao Gemini de verdade. Os testes da extração usam a IA falsa.
test("orientador exclui prova", async (t) => {
  const { sessao, chamar, prova } = await subir(t);
  assert.equal((await chamar(await sessao("ori@teste.br"), "DELETE", `/provas/${prova}`)).status, 200);
});

test("atribuição: só o orientador, só para aluno, só editais da equipe; a lista substitui a anterior", async (t) => {
  const { sessao, chamar, atribuido, naoAtribuido, daOutraEquipe, membroAluno, sequelize } = await subir(t);
  const orientador = await sessao("ori@teste.br");
  const professor = await sessao("prof@teste.br");
  const url = `/equipe/membros/${membroAluno}/editais`;

  assert.equal((await chamar(professor, "PUT", url, { editais: [naoAtribuido] })).status, 403);
  assert.equal((await chamar(orientador, "PUT", url, { editais: [daOutraEquipe] })).status, 404);
  assert.equal((await chamar(orientador, "PUT", url, { editais: "x" })).status, 400);

  const resposta = await chamar(orientador, "PUT", url, { editais: [naoAtribuido] });
  assert.equal(resposta.status, 200);
  assert.deepEqual((await resposta.json()).data.editais, [naoAtribuido]);
  // O aluno passa a ver só o novo.
  const aluno = await sessao("aluno@teste.br");
  assert.deepEqual((await (await chamar(aluno, "GET", "/editais")).json()).data.map((e) => e.id), [naoAtribuido]);
  assert.equal((await chamar(aluno, "GET", `/editais/${atribuido}`)).status, 404);

  // A lista da equipe traz os editais do aluno; professor e orientador não têm o campo.
  const equipe = (await (await chamar(orientador, "GET", "/equipe")).json()).data;
  assert.deepEqual(equipe.membros.find((m) => m.papel === "aluno").editais, [naoAtribuido]);
  assert.equal("editais" in equipe.membros.find((m) => m.papel === "professor"), false);

  // Atribuir a quem não é aluno: 400.
  const { id: membroProfessor } = await sequelize.models.Membro.findOne({ where: { papel: "professor" }, raw: true });
  assert.equal((await chamar(orientador, "PUT", `/equipe/membros/${membroProfessor}/editais`, { editais: [] })).status, 400);
});
