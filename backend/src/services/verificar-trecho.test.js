"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { verificarTrecho } = require("./verificar-trecho");

const PAGINAS = [
  { numero: 1, texto: "TRIBUNAL DE JUSTIÇA DO ESTADO DE SÃO PAULO\nEDITAL DE ABERTURA" },
  { numero: 2, texto: "A Fundação VUNESP será responsável\npela organização do concurso." },
  { numero: 3, texto: "O conteú-\ndo programático está no Anexo II. O bem-\nestar do candidato." }
];

test("trecho exato na página citada é verificado", () => {
  assert.deepEqual(verificarTrecho(PAGINAS, { pagina: 1, source_excerpt: "EDITAL DE ABERTURA" }), {
    verificado: true,
    pagina_encontrada: null
  });
});

test("quebra de linha e espaços extras não impedem a verificação", () => {
  const trecho = "Fundação VUNESP será   responsável pela organização";
  assert.equal(verificarTrecho(PAGINAS, { pagina: 2, source_excerpt: trecho }).verificado, true);
});

test("palavra hifenizada no fim da linha casa junta ou com o hífen", () => {
  assert.equal(verificarTrecho(PAGINAS, { pagina: 3, source_excerpt: "O conteúdo programático" }).verificado, true);
  assert.equal(verificarTrecho(PAGINAS, { pagina: 3, source_excerpt: "O bem-estar do candidato" }).verificado, true);
  assert.equal(verificarTrecho(PAGINAS, { pagina: 3, source_excerpt: "conteú-\ndo programático" }).verificado, true);
});

test("maiúsculas, acentos e pontuação precisam bater", () => {
  assert.equal(verificarTrecho(PAGINAS, { pagina: 1, source_excerpt: "Edital de Abertura" }).verificado, false);
  assert.equal(verificarTrecho(PAGINAS, { pagina: 1, source_excerpt: "JUSTICA DO ESTADO" }).verificado, false);
  assert.equal(verificarTrecho(PAGINAS, { pagina: 3, source_excerpt: "Anexo II, O bem" }).verificado, false);
});

test("trecho em outra página não é verificado, mas indica onde está", () => {
  assert.deepEqual(verificarTrecho(PAGINAS, { pagina: 1, source_excerpt: "Fundação VUNESP" }), {
    verificado: false,
    pagina_encontrada: 2
  });
});

test("trecho que não existe, vazio ou página inexistente não é verificado", () => {
  const nada = { verificado: false, pagina_encontrada: null };
  assert.deepEqual(verificarTrecho(PAGINAS, { pagina: 2, source_excerpt: "Fundação Carlos Chagas" }), nada);
  assert.deepEqual(verificarTrecho(PAGINAS, { pagina: 2, source_excerpt: "  \n " }), nada);
  assert.deepEqual(verificarTrecho(PAGINAS, { pagina: 2, source_excerpt: null }), nada);
  assert.deepEqual(verificarTrecho(PAGINAS, { pagina: 9, source_excerpt: "EDITAL DE ABERTURA" }), {
    verificado: false,
    pagina_encontrada: 1
  });
});
