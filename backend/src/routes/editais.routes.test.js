"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste, criarEquipe } = require("../../test/helpers/banco");
const { sessaoDeTeste, criarUsuario, entrar } = require("../../test/helpers/acesso");
const { criarApp } = require("../app");
const { criarExtracaoService } = require("../services/extracao.service");
const { pdfMinimo } = require("../../test/helpers/pdf-minimo");

// Sobe o app numa porta livre, com o banco de teste vazio, e devolve a URL base e um fetch já logado (um orientador
// com uma equipe).
// O Gemini é falso: devolve um JSON mínimo (metadados ou árvore, conforme o esquema pedido) depois de `atrasoMs`.
async function subir(t, { atrasoMs = 0 } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "edumind-api-"));
  const sequelize = await abrirBancoDeTeste(t);
  const gerarJson = async ({ responseSchema }) => {
    await new Promise((resolve) => setTimeout(resolve, atrasoMs));
    const resposta = responseSchema.properties.banca
      ? { banca: { valor: "VUNESP", pagina: 1, source_excerpt: "Edital" } }
      : { blocos: [{ texto: "Bloco", pagina: 1, source_excerpt: "Edital", disciplinas: [] }] };
    return { texto: JSON.stringify(resposta), modelo: "m", chave: "gratuita", tokens: 1 };
  };
  const extracaoService = criarExtracaoService({ sequelize, gerarJson });
  const servidor = criarApp({ sequelize, dataDir, sessao: sessaoDeTeste(), extracaoService }).listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  t.after(() => servidor.close());
  const base = `http://127.0.0.1:${servidor.address().port}`;
  await criarUsuario(sequelize, { email: "orientador@teste.br", equipes: [{ id: await criarEquipe(sequelize), papel: "orientador" }] });
  return { base, api: await entrar(base, "orientador@teste.br") };
}

function formularioComPdf(buffer, nome) {
  const form = new FormData();
  form.append("arquivo", new Blob([buffer], { type: "application/pdf" }), nome);
  return form;
}

test("upload do PDF, listagem, detalhe, página e arquivo original", async (t) => {
  const { base, api } = await subir(t);
  const pdf = pdfMinimo([["Edital de abertura"], ["ANEXO II Conteudo programatico"]]);

  const criado = await api(`${base}/api/v1/editais`, { method: "POST", body: formularioComPdf(pdf, "edital_tjsp.pdf") });
  assert.equal(criado.status, 201);
  const { data: edital } = await criado.json();
  assert.equal(edital.arquivo_nome, "edital_tjsp.pdf");
  assert.equal(edital.total_paginas, 2);

  const repetido = await api(`${base}/api/v1/editais`, { method: "POST", body: formularioComPdf(pdf, "de-novo.pdf") });
  assert.equal(repetido.status, 200);
  assert.equal((await repetido.json()).jaExistia, true);

  const lista = await (await api(`${base}/api/v1/editais`)).json();
  assert.equal(lista.data.length, 1);

  const pagina = await (await api(`${base}/api/v1/editais/${edital.id}/paginas/2`)).json();
  assert.match(pagina.data.texto, /ANEXO II/);

  const arquivo = await api(`${base}/api/v1/editais/${edital.id}/arquivo`);
  assert.equal(arquivo.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await arquivo.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
});

test("erros voltam com mensagem em português", async (t) => {
  const { base, api } = await subir(t);
  const semArquivo = await api(`${base}/api/v1/editais`, { method: "POST", body: new FormData() });
  assert.equal(semArquivo.status, 400);
  assert.match((await semArquivo.json()).error.message, /Envie o PDF/);

  const naoPdf = await api(`${base}/api/v1/editais`, { method: "POST", body: formularioComPdf(Buffer.from("texto"), "x.pdf") });
  assert.equal(naoPdf.status, 400);

  const inexistente = await api(`${base}/api/v1/editais/nao-existe`);
  assert.equal(inexistente.status, 404);
});

test("extração com IA: 202 com status 'extraindo', 409 se já em andamento, depois 'extraido'", async (t) => {
  const { base, api } = await subir(t, { atrasoMs: 300 });
  const criado = await api(`${base}/api/v1/editais`, { method: "POST", body: formularioComPdf(pdfMinimo([["Edital"]]), "e.pdf") });
  const { data: edital } = await criado.json();

  const iniciada = await api(`${base}/api/v1/editais/${edital.id}/extracao`, { method: "POST" });
  assert.equal(iniciada.status, 202);
  assert.equal((await iniciada.json()).data.status, "extraindo");

  const repetida = await api(`${base}/api/v1/editais/${edital.id}/extracao`, { method: "POST" });
  assert.equal(repetida.status, 409);

  let status = "extraindo";
  for (let i = 0; i < 40 && status === "extraindo"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    status = (await (await api(`${base}/api/v1/editais/${edital.id}`)).json()).data.status;
  }
  assert.equal(status, "extraido");

  const conteudo = await (await api(`${base}/api/v1/editais/${edital.id}/conteudo`)).json();
  assert.deepEqual(conteudo.data.map((i) => [i.nivel, i.texto]), [["bloco", "Bloco"]]);

  const inexistente = await api(`${base}/api/v1/editais/nao-existe/extracao`, { method: "POST" });
  assert.equal(inexistente.status, 404);
});

test("revisão pela API: aprovar item e a reextração devolver 409 com o código para a tela", async (t) => {
  const { base, api } = await subir(t);
  const criado = await api(`${base}/api/v1/editais`, { method: "POST", body: formularioComPdf(pdfMinimo([["Edital"]]), "e.pdf") });
  const { data: edital } = await criado.json();
  await api(`${base}/api/v1/editais/${edital.id}/extracao`, { method: "POST" });
  let status = "extraindo";
  for (let i = 0; i < 40 && status === "extraindo"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    status = (await (await api(`${base}/api/v1/editais/${edital.id}`)).json()).data.status;
  }
  const [bloco] = (await (await api(`${base}/api/v1/editais/${edital.id}/conteudo`)).json()).data;

  const patch = (url, corpo) =>
    api(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
  const aprovado = await patch(`${base}/api/v1/editais/${edital.id}/itens/${bloco.id}`, { status: "aprovado" });
  assert.equal(aprovado.status, 200);
  assert.equal((await aprovado.json()).data.status, "aprovado");

  const reextrair = await api(`${base}/api/v1/editais/${edital.id}/extracao`, { method: "POST" });
  assert.equal(reextrair.status, 409);
  const { error } = await reextrair.json();
  assert.deepEqual([error.codigo, error.revisados], ["revisao_sera_perdida", 1]);

  const confirmada = await api(`${base}/api/v1/editais/${edital.id}/extracao`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmarPerdaDaRevisao: true })
  });
  assert.equal(confirmada.status, 202);
});
