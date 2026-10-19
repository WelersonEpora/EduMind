"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBanco } = require("../db");
const { criarEditalService } = require("./edital.service");

const PDF_FALSO = Buffer.from("%PDF-1.4 conteúdo qualquer");

function montar({ paginas = [{ numero: 1, texto: "Edital" }, { numero: 2, texto: "Anexo II" }] } = {}) {
  const dirUploads = fs.mkdtempSync(path.join(os.tmpdir(), "edumind-"));
  const db = abrirBanco(":memory:");
  const service = criarEditalService({ db, dirUploads, lerPaginas: async () => paginas });
  return { db, dirUploads, service };
}

test("guarda o PDF original e o texto de cada página", async () => {
  const { db, dirUploads, service } = montar();
  const { edital, jaExistia } = await service.criarAPartirDoPdf({ buffer: PDF_FALSO, nomeArquivo: "edital.pdf" });
  assert.equal(jaExistia, false);
  assert.equal(edital.total_paginas, 2);
  assert.equal(edital.status, "texto_extraido");
  assert.ok(fs.existsSync(path.join(dirUploads, `${edital.id}.pdf`)));
  assert.deepEqual(service.pagina(edital.id, 2), { numero: 2, texto: "Anexo II" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM edital_pagina").get().n, 2);
});

test("o mesmo PDF enviado de novo devolve o edital existente", async () => {
  const { service } = montar();
  const primeiro = await service.criarAPartirDoPdf({ buffer: PDF_FALSO, nomeArquivo: "a.pdf" });
  const segundo = await service.criarAPartirDoPdf({ buffer: PDF_FALSO, nomeArquivo: "b.pdf" });
  assert.equal(segundo.jaExistia, true);
  assert.equal(segundo.edital.id, primeiro.edital.id);
  assert.equal(service.listar().length, 1);
});

test("recusa arquivo que não é PDF", async () => {
  const { service } = montar();
  await assert.rejects(service.criarAPartirDoPdf({ buffer: Buffer.from("olá"), nomeArquivo: "x.txt" }), { status: 400 });
});

test("recusa PDF sem texto selecionável e não grava nada", async () => {
  const { service, dirUploads } = montar({ paginas: [{ numero: 1, texto: "" }] });
  await assert.rejects(service.criarAPartirDoPdf({ buffer: PDF_FALSO, nomeArquivo: "scan.pdf" }), { status: 422 });
  assert.equal(service.listar().length, 0);
  assert.deepEqual(fs.readdirSync(dirUploads), []);
});

test("página inexistente e edital inexistente dão 404", async () => {
  const { service } = montar();
  const { edital } = await service.criarAPartirDoPdf({ buffer: PDF_FALSO, nomeArquivo: "e.pdf" });
  assert.throws(() => service.pagina(edital.id, 9), { status: 404 });
  assert.throws(() => service.buscar("nao-existe"), { status: 404 });
});
