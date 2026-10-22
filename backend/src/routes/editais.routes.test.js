"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste } = require("../../test/helpers/banco");
const { criarApp } = require("../app");
const { criarExtracaoService } = require("../services/extracao.service");
const { pdfMinimo } = require("../../test/helpers/pdf-minimo");

// Sobe o app numa porta livre, com o banco de teste vazio, e devolve a URL base.
// O Gemini é falso: devolve um JSON mínimo depois de `atrasoMs`.
async function subir(t, { atrasoMs = 0 } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "edumind-api-"));
  const sequelize = await abrirBancoDeTeste(t);
  const gerarJson = async () => {
    await new Promise((resolve) => setTimeout(resolve, atrasoMs));
    return { texto: JSON.stringify({ banca: { valor: "VUNESP", pagina: 1, source_excerpt: "Edital" } }), modelo: "m", chave: "gratuita", tokens: 1 };
  };
  const extracaoService = criarExtracaoService({ sequelize, gerarJson });
  const servidor = criarApp({ sequelize, dataDir, extracaoService }).listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  t.after(() => servidor.close());
  return `http://127.0.0.1:${servidor.address().port}`;
}

function formularioComPdf(buffer, nome) {
  const form = new FormData();
  form.append("arquivo", new Blob([buffer], { type: "application/pdf" }), nome);
  return form;
}

test("upload do PDF, listagem, detalhe, página e arquivo original", async (t) => {
  const base = await subir(t);
  const pdf = pdfMinimo([["Edital de abertura"], ["ANEXO II Conteudo programatico"]]);

  const criado = await fetch(`${base}/api/v1/editais`, { method: "POST", body: formularioComPdf(pdf, "edital_tjsp.pdf") });
  assert.equal(criado.status, 201);
  const { data: edital } = await criado.json();
  assert.equal(edital.arquivo_nome, "edital_tjsp.pdf");
  assert.equal(edital.total_paginas, 2);

  const repetido = await fetch(`${base}/api/v1/editais`, { method: "POST", body: formularioComPdf(pdf, "de-novo.pdf") });
  assert.equal(repetido.status, 200);
  assert.equal((await repetido.json()).jaExistia, true);

  const lista = await (await fetch(`${base}/api/v1/editais`)).json();
  assert.equal(lista.data.length, 1);

  const pagina = await (await fetch(`${base}/api/v1/editais/${edital.id}/paginas/2`)).json();
  assert.match(pagina.data.texto, /ANEXO II/);

  const arquivo = await fetch(`${base}/api/v1/editais/${edital.id}/arquivo`);
  assert.equal(arquivo.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await arquivo.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
});

test("erros voltam com mensagem em português", async (t) => {
  const base = await subir(t);
  const semArquivo = await fetch(`${base}/api/v1/editais`, { method: "POST", body: new FormData() });
  assert.equal(semArquivo.status, 400);
  assert.match((await semArquivo.json()).error.message, /Envie o PDF/);

  const naoPdf = await fetch(`${base}/api/v1/editais`, { method: "POST", body: formularioComPdf(Buffer.from("texto"), "x.pdf") });
  assert.equal(naoPdf.status, 400);

  const inexistente = await fetch(`${base}/api/v1/editais/nao-existe`);
  assert.equal(inexistente.status, 404);
});

test("extração com IA: 202 com status 'extraindo', 409 se já em andamento, depois 'extraido'", async (t) => {
  const base = await subir(t, { atrasoMs: 300 });
  const criado = await fetch(`${base}/api/v1/editais`, { method: "POST", body: formularioComPdf(pdfMinimo([["Edital"]]), "e.pdf") });
  const { data: edital } = await criado.json();

  const iniciada = await fetch(`${base}/api/v1/editais/${edital.id}/extracao`, { method: "POST" });
  assert.equal(iniciada.status, 202);
  assert.equal((await iniciada.json()).data.status, "extraindo");

  const repetida = await fetch(`${base}/api/v1/editais/${edital.id}/extracao`, { method: "POST" });
  assert.equal(repetida.status, 409);

  let status = "extraindo";
  for (let i = 0; i < 40 && status === "extraindo"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    status = (await (await fetch(`${base}/api/v1/editais/${edital.id}`)).json()).data.status;
  }
  assert.equal(status, "extraido");

  const inexistente = await fetch(`${base}/api/v1/editais/nao-existe/extracao`, { method: "POST" });
  assert.equal(inexistente.status, 404);
});
