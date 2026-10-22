"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { proporIdentidade, chaveDe } = require("./identidade-da-norma");

const citacao = (campos) => ({ tipo: null, numero: null, ano: null, nome: null, ...campos });
const opcoes = { anoAtual: 2026 };

test("os grandes códigos sem número vêm do catálogo", () => {
  const cp = proporIdentidade(citacao({ tipo: "Código", nome: "Código Penal" }), "", opcoes);
  assert.deepEqual(
    { chave: cp.chave, tipo: cp.tipo, numero: cp.numero, ano: cp.ano, nome: cp.nome, doCatalogo: cp.doCatalogo, alertas: cp.alertas },
    { chave: "br:decreto-lei:2848:1940", tipo: "Decreto-Lei", numero: "2.848", ano: "1940", nome: "Código Penal", doCatalogo: true, alertas: [] }
  );
  assert.equal(proporIdentidade(citacao({ tipo: "Constituição Federal", nome: null }), "", opcoes).chave, "br:constituicao:-:1988");
  assert.equal(proporIdentidade(citacao({ nome: "Código de Processo Civil" }), "", opcoes).chave, "br:lei:13105:2015");
});

test("lei com número e ano: identidade direta; 'Lei Federal' é federal sem alerta", () => {
  const lei = proporIdentidade(citacao({ tipo: "Lei", numero: "9.099", ano: "1995" }), "Lei n.º 9.099 de 26.09.1995", opcoes);
  assert.equal(lei.chave, "br:lei:9099:1995");
  assert.equal(lei.nome, "Lei nº 9.099/1995");
  assert.deepEqual(lei.alertas, ["Jurisdição suposta: federal. Confirme."]);

  const improbidade = proporIdentidade(citacao({ tipo: "Lei Federal", numero: "8.429", ano: "92", nome: "Lei de Improbidade Administrativa" }), "", opcoes);
  assert.equal(improbidade.chave, "br:lei:8429:1992");
  assert.deepEqual(improbidade.alertas, ["O edital traz o ano com 2 dígitos (92); confirme 1992."]);
});

test("estadual de SP pelo texto do item; ano de 2 dígitos vira alerta", () => {
  const estatuto = proporIdentidade(
    citacao({ tipo: "Lei", numero: "10.261", ano: "68", nome: "Estatuto dos Funcionários Públicos Civis do Estado de São Paulo" }),
    "Estatuto dos Funcionários Públicos Civis do Estado de São Paulo (Lei n.º 10.261/68) - artigos 1º a 86",
    opcoes
  );
  assert.equal(estatuto.chave, "sp:lei:10261:1968");
  assert.equal(estatuto.jurisdicao, "SP");
  assert.deepEqual(estatuto.alertas, ["O edital traz o ano com 2 dígitos (68); confirme 1968."]);

  // Lei complementar paulista sobre os servidores do TJ: é de SP, não do tribunal.
  const lc = proporIdentidade(
    citacao({ tipo: "Lei Complementar", numero: "1.111", ano: "2010" }),
    "Lei Complementar n° 1.111/ 2010 (Institui o Plano de Cargos e Carreiras dos servidores do Tribunal de Justiça do Estado de São Paulo)",
    opcoes
  );
  assert.equal(lc.chave, "sp:lei-complementar:1111:2010");
});

test("atos do tribunal ficam com a jurisdição do tribunal", () => {
  const resolucao = proporIdentidade(citacao({ tipo: "Resolução TJSP", numero: "850", ano: "2021" }), "", opcoes);
  assert.equal(resolucao.chave, "tjsp:resolucao:850:2021");
  assert.equal(resolucao.tipo, "Resolução");
  assert.deepEqual(resolucao.alertas, []);

  const regimento = proporIdentidade(citacao({ tipo: "Regimento Interno", nome: "Regimento Interno do Tribunal de Justiça" }), "Regimento Interno do Tribunal de Justiça do Estado de São Paulo", opcoes);
  assert.equal(regimento.chave, "tjsp:regimento-interno:-:-");
});

test("norma sem número fora do catálogo pede confirmação", () => {
  const normas = proporIdentidade(citacao({ tipo: "Normas", nome: "Normas da Corregedoria Geral da Justiça" }), "", opcoes);
  assert.ok(normas.alertas.some((a) => /Sem número/.test(a)));
});

test("a chave ignora pontos, acentos e maiúsculas", () => {
  assert.equal(chaveDe({ jurisdicao: "SP", tipo: "Lei Complementar", numero: "1.111", ano: "2010" }), "sp:lei-complementar:1111:2010");
  assert.equal(chaveDe({ jurisdicao: "br", tipo: "Resolução", numero: null, ano: null }), "br:resolucao:-:-");
});
