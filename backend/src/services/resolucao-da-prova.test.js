"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { textoParaResolver, lerResolucao, indicarVersao } = require("./resolucao-da-prova");

const alternativas = (n = 5) => "ABCDE".slice(0, n).split("").map((letra) => ({ letra, texto: `opção ${letra}` }));
const questao = (numero, extras = {}) => ({ numero, enunciado: `Enunciado ${numero}`, alternativas: alternativas(), depende_de_imagem: false, texto_apoio: null, ...extras });
const versao = (letras) => ({ versao: null, respostas: Object.fromEntries([...letras].map((l, i) => [i + 1, { resposta: l, valida: true, conferida: null }])) });

test("texto para resolver: apoio uma vez só; questão de figura fica de fora", () => {
  const texto = textoParaResolver([
    questao(1, { texto_apoio: "Era uma vez." }),
    questao(2, { texto_apoio: "Era uma vez." }),
    questao(3, { depende_de_imagem: true })
  ]);
  assert.equal(texto.match(/Era uma vez\./g).length, 1);
  assert.match(texto, /<<<QUESTÃO 2>>> \(usa o texto de apoio 1\)\nEnunciado 2\n\(A\) opção A/);
  assert.doesNotMatch(texto, /QUESTÃO 3/);
});

test("lê a resolução: só letras válidas", () => {
  assert.deepEqual(lerResolucao(JSON.stringify({ respostas: [{ numero: 1, resposta: "b" }, { numero: 2, resposta: null }, { numero: 3, resposta: "F" }] })), { 1: "B" });
  assert.throws(() => lerResolucao("{"), { status: 502 });
});

test("indica a versão quando a diferença é grande; apertado, deixa para o orientador", () => {
  const versoes = [versao("ABCDEABCDE"), versao("BCDEABCDEA"), versao("CDEABCDEAB")];
  const questoes = Array.from({ length: 10 }, (_, i) => questao(i + 1));
  // A IA acerta 8 de 10 da versão 2.
  const ia = { 1: "B", 2: "C", 3: "D", 4: "E", 5: "A", 6: "B", 7: "C", 8: "D", 9: "A", 10: "B" };
  assert.deepEqual(indicarVersao(versoes, ia, questoes), { consideradas: 10, batem: [0, 8, 2], indice: 1 });

  // Metade numa, metade noutra: não escolhe.
  const dividida = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E", 6: "B", 7: "C", 8: "D", 9: "E", 10: "A" };
  assert.equal(indicarVersao(versoes, dividida, questoes).indice, null);

  // Questão de figura e questão sem resposta da IA não contam.
  const comFigura = questoes.map((q) => (q.numero === 1 ? { ...q, depende_de_imagem: true } : q));
  assert.equal(indicarVersao(versoes, { ...ia, 10: undefined }, comFigura).consideradas, 8);
});
