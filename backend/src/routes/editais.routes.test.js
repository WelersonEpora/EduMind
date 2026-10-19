"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBanco } = require("../db");
const { criarApp } = require("../app");
const { pdfMinimo } = require("../../test/helpers/pdf-minimo");

// Sobe o app numa porta livre, com banco em memória, e devolve a URL base.
async function subir(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "edumind-api-"));
  const servidor = criarApp({ db: abrirBanco(":memory:"), dataDir }).listen(0);
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
