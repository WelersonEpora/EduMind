"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { lerEstrutura, descreverCaminho, artigoNoCaminho } = require("./estrutura.parser");

const resumo = ({ caminhos }) => caminhos.map(descreverCaminho);

test("Constituição no edital do TJSP: títulos, capítulos e seções; o artigo pelo número fica de fora", () => {
  const lido = lerEstrutura("Título II - Capítulos I, II e III; e Título III - Capítulo VII com Seções I e II; e também o artigo 92");
  assert.deepEqual(resumo(lido), ["Título II › Capítulos I, II e III", "Título III › Capítulo VII › Seções I e II"]);
  assert.deepEqual(lido.avisos, []);
});

test("Normas da Corregedoria: tomo, intervalo de seções e subseções", () => {
  const lido = lerEstrutura(
    "Tomo I – Capítulo II: Seção I – subseções I e II; Tomo I - Capítulo III: Seções I, II, V, VI, VII; Tomo I – Capítulo III: Seções IX a XIX; Tomo I – Capítulo XI: Seção I a VII."
  );
  assert.deepEqual(resumo(lido), [
    "Tomo I › Capítulo II › Seção I › Subseções I e II",
    "Tomo I › Capítulo III › Seções I, II, V, VI e VII",
    "Tomo I › Capítulo III › Seções IX, X, XI, XII, XIII, XIV, XV, XVI, XVII, XVIII e XIX",
    "Tomo I › Capítulo XI › Seções I, II, III, IV, V, VI e VII"
  ]);
  assert.deepEqual(lido.avisos, []);
});

test("parte que começa mais abaixo herda os níveis de cima; nível repetido abre outro caminho", () => {
  assert.deepEqual(resumo(lerEstrutura("Título II - Capítulo I; Capítulo IV")), ["Título II › Capítulo I", "Título II › Capítulo IV"]);
  assert.deepEqual(resumo(lerEstrutura("Título I, Capítulo II e Capítulo V")), ["Título I › Capítulo II", "Título I › Capítulo V"]);
  assert.deepEqual(resumo(lerEstrutura("Livro I - Título 3, Capítulo Único")), ["Livro I › Título III › Capítulo UNICO"]);
});

test("o que não é reconhecido vira aviso; nível sem número também", () => {
  const lido = lerEstrutura("Título II exceto o Capítulo; Capítulos");
  assert.deepEqual(lido.avisos, ["Trecho não reconhecido: “exceto”.", "Capítulo sem número.", "Capítulo sem número."]);
});

test("artigo no caminho: compara pelo número do rótulo guardado na divisão", () => {
  const [caminho] = lerEstrutura("Título III - Capítulo VII - Seções I e II").caminhos;
  assert.equal(artigoNoCaminho({ titulo: "Título III", capitulo: "Capítulo VII", secao: "Seção II" }, caminho), true);
  assert.equal(artigoNoCaminho({ titulo: "Título III", capitulo: "Capítulo VII", secao: "Seção III" }, caminho), false);
  assert.equal(artigoNoCaminho({ titulo: "Título III", capitulo: "Capítulo VII" }, caminho), false);
  const [unico] = lerEstrutura("Capítulo Único").caminhos;
  assert.equal(artigoNoCaminho({ capitulo: "Capítulo ÚNICO" }, unico), true);
});
