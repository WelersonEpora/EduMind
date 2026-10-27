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

  const { Edital, EditalPagina, Prova, Norma, EditalAluno } = sequelize.models;
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

  const sessao = (email) => entrar(base, email, { equipeId: equipe });
  const chamar = (fetchComSessao, metodo, url, corpo) =>
    fetchComSessao(`${base}/api/v1${url}`, {
      method: metodo,
      headers: { "content-type": "application/json" },
      ...(corpo !== undefined && { body: JSON.stringify(corpo) })
    });
  return { sequelize, sessao, chamar, atribuido, naoAtribuido, daOutraEquipe, prova, norma, alunoId };
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
  // A prova completa (etapa 5b) também é dele: sem prova escolhida é 400; prova que não existe, 404.
  assert.equal((await chamar(aluno, "POST", `/editais/${atribuido}/simulador/provas`, {})).status, 400);
  assert.equal((await chamar(aluno, "GET", `/editais/${atribuido}/simulador/provas/${atribuido}`)).status, 404);
  assert.equal((await chamar(aluno, "GET", `/editais/${naoAtribuido}/simulador`)).status, 404);
  // O próprio desempenho e o caderno de erros (etapa 5c).
  assert.equal((await chamar(aluno, "GET", `/editais/${atribuido}/simulador/desempenho`)).status, 200);
  assert.equal((await chamar(aluno, "POST", `/editais/${atribuido}/simulador/caderno`)).status, 200);
  assert.equal((await chamar(aluno, "GET", `/editais/${naoAtribuido}`)).status, 404);
  assert.equal((await chamar(aluno, "GET", `/editais/${naoAtribuido}/conteudo`)).status, 404);

  for (const [metodo, url, corpo] of [
    ["GET", `/editais/${atribuido}/fontes`],
    ["GET", `/editais/${atribuido}/provas`],
    ["GET", `/editais/${atribuido}/alunos`],
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
  const { sessao, chamar, atribuido, naoAtribuido, prova, norma, alunoId } = await subir(t);
  const professor = await sessao("prof@teste.br");

  // Vê os alunos do edital e o desempenho de cada um (etapa 5c).
  const alunos = (await (await chamar(professor, "GET", `/editais/${atribuido}/alunos`)).json()).data;
  assert.deepEqual(alunos.map((a) => a.id), [alunoId]);
  assert.equal((await chamar(professor, "GET", `/editais/${atribuido}/alunos/${alunoId}`)).status, 200);
  assert.equal((await chamar(professor, "GET", `/editais/${naoAtribuido}/alunos/${alunoId}`)).status, 404);

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

test("atribuição, na aba Alunos do edital: só o orientador, só alunos ativos da equipe, só editais da equipe", async (t) => {
  const { sessao, chamar, atribuido, naoAtribuido, daOutraEquipe, alunoId, sequelize } = await subir(t);
  const orientador = await sessao("ori@teste.br");
  const professor = await sessao("prof@teste.br");
  const url = `/editais/${naoAtribuido}/alunos`;

  assert.equal((await chamar(professor, "POST", url, { alunos: [alunoId] })).status, 403);
  assert.equal((await chamar(orientador, "POST", `/editais/${daOutraEquipe}/alunos`, { alunos: [alunoId] })).status, 404);
  assert.equal((await chamar(orientador, "POST", url, { alunos: "x" })).status, 400);
  assert.equal((await chamar(orientador, "POST", url, { alunos: [] })).status, 400);
  // Quem não é aluno da equipe: 404.
  const { usuario_id: professorId } = await sequelize.models.Membro.findOne({ where: { papel: "professor" }, raw: true });
  assert.equal((await chamar(orientador, "POST", url, { alunos: [professorId] })).status, 404);

  const resposta = await chamar(orientador, "POST", url, { alunos: [alunoId, alunoId] });
  assert.equal(resposta.status, 200);
  assert.deepEqual((await resposta.json()).data.map((a) => a.id), [alunoId]);
  // De novo: não duplica.
  assert.deepEqual((await (await chamar(orientador, "POST", url, { alunos: [alunoId] })).json()).data.map((a) => a.id), [alunoId]);

  // O aluno passa a ver os dois; a lista da equipe traz os editais dele, para consulta.
  const aluno = await sessao("aluno@teste.br");
  assert.deepEqual((await (await chamar(aluno, "GET", "/editais")).json()).data.map((e) => e.id).sort(), [atribuido, naoAtribuido].sort());
  const equipe = (await (await chamar(orientador, "GET", "/equipe")).json()).data;
  assert.deepEqual(equipe.membros.find((m) => m.papel === "aluno").editais.sort(), [atribuido, naoAtribuido].sort());
  assert.equal("editais" in equipe.membros.find((m) => m.papel === "professor"), false);

  // Retirar: só o orientador; o aluno deixa de ver na hora.
  assert.equal((await chamar(professor, "DELETE", `/editais/${atribuido}/alunos/${alunoId}`)).status, 403);
  const retirada = await chamar(orientador, "DELETE", `/editais/${atribuido}/alunos/${alunoId}`);
  assert.equal(retirada.status, 200);
  assert.deepEqual((await retirada.json()).data, []);
  assert.equal((await chamar(aluno, "GET", `/editais/${atribuido}`)).status, 404);
  assert.equal((await chamar(orientador, "DELETE", `/editais/${atribuido}/alunos/${alunoId}`)).status, 404);

  // Aluno desativado não recebe edital.
  await sequelize.models.Membro.update({ ativo: false }, { where: { usuario_id: alunoId } });
  assert.equal((await chamar(orientador, "POST", `/editais/${atribuido}/alunos`, { alunos: [alunoId] })).status, 404);
});
