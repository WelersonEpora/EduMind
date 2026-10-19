"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { expandirArtigos, incluirArtigosComLetra } = require("./artigos.parser");

const numeros = (resultado) => resultado.artigos.map((a) => a.numero);
const faixa = (inicio, fim) => Array.from({ length: fim - inicio + 1 }, (_, k) => String(inicio + k));

// Critério de aceitação do projeto: a lista do Código Penal do edital do TJSP 2025.
test("expande a lista do Código Penal do edital do TJSP", () => {
  const resultado = expandirArtigos(
    "artigos 293 a 305; 307; 308; 311-A; 312 a 317; 319 a 333; 336 e 337; 339 a 347; 357 e 359"
  );
  const esperado = [
    ...faixa(293, 305),
    "307",
    "308",
    "311-A",
    ...faixa(312, 317),
    ...faixa(319, 333),
    "336",
    "337",
    ...faixa(339, 347),
    "357",
    "359"
  ];
  assert.deepEqual(numeros(resultado), esperado);
  assert.equal(resultado.artigos.length, 50);
  assert.deepEqual(resultado.avisos, []);
  assert.deepEqual(resultado.intervalos, [
    { inicio: "293", fim: "305" },
    { inicio: "312", fim: "317" },
    { inicio: "319", fim: "333" },
    { inicio: "339", fim: "347" }
  ]);
});

test("marca a origem de cada artigo: explícito ou vindo de intervalo", () => {
  const resultado = expandirArtigos("artigos 307; 312 a 313");
  assert.deepEqual(resultado.artigos, [
    { numero: "307", origem: "explicito" },
    { numero: "312", origem: "intervalo" },
    { numero: "313", origem: "intervalo" }
  ]);
});

test("aceita ordinais (1º, 2°, 3o) e o conectivo 'ao'", () => {
  assert.deepEqual(numeros(expandirArtigos("artigos 1º ao 5º")), faixa(1, 5));
  assert.deepEqual(numeros(expandirArtigos("arts. 2° e 3o")), ["2", "3"]);
});

test("lê o ponto de milhar como parte do número", () => {
  assert.deepEqual(numeros(expandirArtigos("arts. 1.071 e 1.072")), ["1071", "1072"]);
});

test("traço entre números é intervalo; traço seguido de letra é sufixo", () => {
  assert.deepEqual(numeros(expandirArtigos("312-315")), faixa(312, 315));
  assert.deepEqual(numeros(expandirArtigos("312–314")), faixa(312, 314));
  assert.deepEqual(numeros(expandirArtigos("311-A; 311-b")), ["311-A", "311-B"]);
});

test("intervalo com letra nas pontas inclui as pontas", () => {
  assert.deepEqual(numeros(expandirArtigos("121-A a 123")), ["121-A", "122", "123"]);
  assert.deepEqual(numeros(expandirArtigos("152 a 154-B")), ["152", "153", "154", "154-B"]);
});

test("não repete artigo citado duas vezes", () => {
  assert.deepEqual(numeros(expandirArtigos("10; 10 a 12; 11")), faixa(10, 12));
});

test("avisa o que não entendeu, sem descartar o resto", () => {
  const resultado = expandirArtigos("artigo 5º, caput e incisos");
  assert.deepEqual(numeros(resultado), ["5"]);
  assert.deepEqual(resultado.avisos, ["Trecho não reconhecido: “caput”.", "Trecho não reconhecido: “incisos”."]);
});

test("avisa intervalo invertido e não expande", () => {
  const resultado = expandirArtigos("artigos 30 a 20");
  assert.deepEqual(numeros(resultado), []);
  assert.equal(resultado.avisos.length, 1);
});

test("texto vazio ou sem números devolve lista vazia", () => {
  assert.deepEqual(numeros(expandirArtigos("")), []);
  assert.deepEqual(numeros(expandirArtigos(null)), []);
});

test("inclui os artigos com letra que a norma tem dentro dos intervalos do edital", () => {
  const resultado = expandirArtigos(
    "artigos 293 a 305; 307; 308; 311-A; 312 a 317; 319 a 333; 336 e 337; 339 a 347; 357 e 359"
  );
  // 337-A existe no Código Penal, mas "336 e 337" não é intervalo: não entra.
  const completo = incluirArtigosComLetra(resultado, ["311-A", "313-A", "313-B", "319-A", "337-A", "359-A"]);
  const extras = completo.artigos.filter((a) => a.origem === "letra_no_intervalo").map((a) => a.numero);
  assert.deepEqual(extras, ["313-A", "313-B", "319-A"]);
  assert.equal(completo.artigos.length, 53);
  // A ordem continua a da norma.
  const ordem = completo.artigos.map((a) => a.numero);
  assert.deepEqual(ordem.slice(ordem.indexOf("313"), ordem.indexOf("313") + 4), ["313", "313-A", "313-B", "314"]);
});

test("segue a ordem da norma: 312-A está dentro de '312 a 317'; 317-A e 311-B ficam fora", () => {
  const completo = incluirArtigosComLetra(expandirArtigos("312 a 317"), ["311-B", "312-A", "317-A"]);
  assert.deepEqual(
    completo.artigos.filter((a) => a.origem === "letra_no_intervalo").map((a) => a.numero),
    ["312-A"]
  );
});
