"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { lerPaginas, textoDaPagina } = require("./pdf-texto");
const { pdfMinimo } = require("../../test/helpers/pdf-minimo");

const FIXTURE_TJSP = path.resolve(__dirname, "..", "..", "..", "tests", "fixtures", "edital_tjsp_escrevente_2025.pdf");

test("textoDaPagina junta os itens e quebra linha onde o PDF marca fim de linha", () => {
  const itens = [
    { str: "CAPÍTULO VII", hasEOL: true },
    { str: "7.1 A prova ", hasEOL: false },
    { str: "objetiva   ", hasEOL: true }
  ];
  assert.equal(textoDaPagina(itens), "CAPÍTULO VII\n7.1 A prova objetiva");
});

test("lerPaginas devolve o texto de cada página com o número da página", async () => {
  const pdf = pdfMinimo([["Pagina um do edital"], ["Conteudo programatico", "Lingua Portuguesa"]]);
  const paginas = await lerPaginas(pdf);
  assert.equal(paginas.length, 2);
  assert.equal(paginas[0].numero, 1);
  assert.match(paginas[0].texto, /Pagina um do edital/);
  assert.equal(paginas[1].numero, 2);
  assert.match(paginas[1].texto, /Conteudo programatico/);
  assert.match(paginas[1].texto, /Lingua Portuguesa/);
});

// Um edital pode ter uma ou outra página em branco; mais que 10% vazias indica PDF escaneado.
test("edital do TJSP: páginas lidas e com texto", { skip: !fs.existsSync(FIXTURE_TJSP) && "fixture ausente em tests/fixtures" }, async () => {
  const paginas = await lerPaginas(fs.readFileSync(FIXTURE_TJSP));
  assert.ok(paginas.length > 10);
  const comTexto = paginas.filter((p) => p.texto.length > 0).length;
  assert.ok(comTexto >= paginas.length * 0.9, `${comTexto} de ${paginas.length} páginas com texto`);
  assert.match(paginas.map((p) => p.texto).join("\n"), /Escrevente/i);
});
