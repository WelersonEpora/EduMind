"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { montarClassificacao, normalizarArtigo, alteradoDepoisDaProva } = require("./classificacao-da-prova");

const artigo = (numero, extras = {}) => [numero, { numero, revogado: false, notas: [], ...extras }];
const RES850 = { id: "n850", chave: "tjsp:resolucao:850:2021", nome: "Resolução nº 850/2021", artigos: new Map([artigo("7"), artigo("8"), artigo("9", { revogado: true })]) };
const CPC = {
  id: "ncpc",
  chave: "br:lei:13105:2015",
  nome: "Código de Processo Civil",
  artigos: new Map([artigo("998", { notas: [{ alteracao: true, data: { valor: "2026-03-01", precisao: "dia" } }] }), artigo("1072")])
};
const SEM_TEXTO = { id: "ncp", chave: "br:decreto-lei:2848:1940", nome: "Código Penal", artigos: null };
const contexto = {
  normas: new Map([RES850, CPC, SEM_TEXTO].map((n) => [n.chave, n])),
  normasPorId: new Map([RES850, CPC, SEM_TEXTO].map((n) => [n.id, n])),
  anoDaProva: 2025
};

const ref = (norma, artigo, papel = "principal", norma_citada = "x") => ({ norma, norma_citada, artigo, papel });

test("normaliza o número do artigo", () => {
  assert.equal(normalizarArtigo("art. 7º"), "7");
  assert.equal(normalizarArtigo("1.072"), "1072");
  assert.equal(normalizarArtigo("313-a"), "313-A");
  assert.equal(normalizarArtigo("359 - M - A"), "359-M-A");
  assert.equal(normalizarArtigo("ADCT 8º"), "ADCT 8");
  assert.equal(normalizarArtigo("caput"), null);
});

test("alterado depois da prova", () => {
  const notas = (ano) => ({ notas: [{ alteracao: true, data: { valor: `${ano}-01-01`, precisao: "ano" } }] });
  assert.equal(alteradoDepoisDaProva(notas(2026), 2025), "depois");
  assert.equal(alteradoDepoisDaProva(notas(2025), 2025), "talvez");
  assert.equal(alteradoDepoisDaProva(notas(2020), 2025), null);
  assert.equal(alteradoDepoisDaProva(notas(2026), null), null);
});

test("classificação: conferida vale; norma fora, artigo inexistente, revogado e alterado vão para revisão", () => {
  const resposta = JSON.stringify({
    questoes: [
      { numero: 43, juridica: true, referencias: [ref("tjsp:resolucao:850:2021", "7º"), ref("tjsp:resolucao:850:2021", "8", "relacionado")] },
      { numero: 1, juridica: false, referencias: [] },
      { numero: 44, juridica: true, referencias: [ref(null, "37-B", "principal", "Lei Complementar nº 1.111/2010")] },
      { numero: 45, juridica: true, referencias: [ref("tjsp:resolucao:850:2021", "99"), ref("tjsp:resolucao:850:2021", "9", "relacionado")] },
      { numero: 46, juridica: true, referencias: [ref("br:lei:13105:2015", "998", "relacionado")] },
      { numero: 47, juridica: true, referencias: [ref("br:decreto-lei:2848:1940", "312")] },
      { numero: 48, juridica: true, referencias: [] }
    ]
  });
  const r = montarClassificacao(resposta, [1, 43, 44, 45, 46, 47, 48, 49], contexto);
  const ver = (n) => {
    const c = r.get(n);
    return [c.classificacao_status, c.referencias.map((x) => `${x.norma_id}:${x.artigo}:${x.papel}`), c.classificacao_problemas];
  };
  assert.deepEqual(ver(43), ["classificada", ["n850:7:principal", "n850:8:relacionado"], []]);
  assert.deepEqual(ver(1), ["nao_juridica", [], []]);
  assert.deepEqual(ver(44), ["a_revisar", [], ["Norma fora da biblioteca: Lei Complementar nº 1.111/2010."]]);
  assert.equal(r.get(44).norma_citada, "Lei Complementar nº 1.111/2010");
  assert.deepEqual(ver(45), [
    "a_revisar",
    ["n850:99:principal", "n850:9:relacionado"],
    ["Art. 99 (Resolução nº 850/2021) não existe no texto da biblioteca.", "Art. 9 (Resolução nº 850/2021) está revogado no texto atual."]
  ]);
  // Sem principal indicado, o primeiro vira principal.
  assert.deepEqual(ver(46), [
    "a_revisar",
    ["ncpc:998:principal"],
    ["Art. 998 (Código de Processo Civil) foi alterado depois da prova (2025): a resposta oficial pode não valer mais."]
  ]);
  assert.deepEqual(ver(47), ["a_revisar", ["ncp:312:principal"], ["Código Penal: ainda sem texto na biblioteca; o art. 312 não foi conferido."]]);
  assert.deepEqual(ver(48), ["a_revisar", [], ["Questão de Direito sem artigo indicado."]]);
  assert.deepEqual(ver(49), ["a_revisar", [], ["A IA não classificou esta questão."]]);
});
