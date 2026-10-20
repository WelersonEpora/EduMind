"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste } = require("../../test/helpers/banco");
const { criarEditalService } = require("./edital.service");

const PDF_FALSO = Buffer.from("%PDF-1.4 conteúdo qualquer");

async function montar(t, { paginas = [{ numero: 1, texto: "Edital" }, { numero: 2, texto: "Anexo II" }] } = {}) {
  const dirUploads = fs.mkdtempSync(path.join(os.tmpdir(), "edumind-"));
  const sequelize = await abrirBancoDeTeste(t);
  const service = criarEditalService({ sequelize, dirUploads, lerPaginas: async () => paginas });
  return { sequelize, dirUploads, service };
}

test("guarda o PDF original e o texto de cada página", async (t) => {
  const { sequelize, dirUploads, service } = await montar(t);
  const { edital, jaExistia } = await service.criarAPartirDoPdf({ buffer: PDF_FALSO, nomeArquivo: "edital.pdf" });
  assert.equal(jaExistia, false);
  assert.equal(edital.total_paginas, 2);
  assert.equal(edital.status, "texto_extraido");
  assert.ok(fs.existsSync(path.join(dirUploads, `${edital.id}.pdf`)));
  assert.deepEqual(await service.pagina(edital.id, 2), { numero: 2, texto: "Anexo II" });
  assert.equal(await sequelize.models.EditalPagina.count(), 2);
});

test("o mesmo PDF enviado de novo devolve o edital existente", async (t) => {
  const { service } = await montar(t);
  const primeiro = await service.criarAPartirDoPdf({ buffer: PDF_FALSO, nomeArquivo: "a.pdf" });
  const segundo = await service.criarAPartirDoPdf({ buffer: PDF_FALSO, nomeArquivo: "b.pdf" });
  assert.equal(segundo.jaExistia, true);
  assert.equal(segundo.edital.id, primeiro.edital.id);
  assert.equal((await service.listar()).length, 1);
});

test("recusa arquivo que não é PDF", async (t) => {
  const { service } = await montar(t);
  await assert.rejects(service.criarAPartirDoPdf({ buffer: Buffer.from("olá"), nomeArquivo: "x.txt" }), { status: 400 });
});

test("recusa PDF sem texto selecionável e não grava nada", async (t) => {
  const { service, dirUploads } = await montar(t, { paginas: [{ numero: 1, texto: "" }] });
  await assert.rejects(service.criarAPartirDoPdf({ buffer: PDF_FALSO, nomeArquivo: "scan.pdf" }), { status: 422 });
  assert.equal((await service.listar()).length, 0);
  assert.deepEqual(fs.readdirSync(dirUploads), []);
});

test("página inexistente e edital inexistente dão 404", async (t) => {
  const { service } = await montar(t);
  const { edital } = await service.criarAPartirDoPdf({ buffer: PDF_FALSO, nomeArquivo: "e.pdf" });
  await assert.rejects(service.pagina(edital.id, 9), { status: 404 });
  await assert.rejects(service.pagina(edital.id, NaN), { status: 404 });
  await assert.rejects(service.buscar("nao-existe"), { status: 404 });
  await assert.rejects(service.buscar(crypto.randomUUID()), { status: 404 });
});
