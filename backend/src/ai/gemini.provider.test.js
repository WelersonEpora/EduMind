"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { gerarJson } = require("./gemini.provider");

const CONFIG = { apiKeyFree: "chave-gratuita", apiKey: "chave-paga", model: "gemini-teste", timeoutMs: 60000 };
const PEDIDO = { systemInstruction: "sistema", prompt: "prompt", responseSchema: { type: "OBJECT" } };

function respostaOk(texto) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: "pensando...", thought: true }, { text: texto }] }, finishReason: "STOP" }],
      modelVersion: "gemini-teste-001",
      usageMetadata: { totalTokenCount: 42 }
    }),
    { status: 200 }
  );
}

// fetch falso que devolve as respostas na ordem e registra a chave usada em cada chamada.
function fetchFalso(...respostas) {
  const chaves = [];
  const fetch = async (url, opcoes) => {
    chaves.push(opcoes.headers["x-goog-api-key"]);
    const proxima = respostas.shift();
    return typeof proxima === "function" ? proxima() : proxima;
  };
  return { fetch, chaves };
}

const deps = (fetch, config = CONFIG) => ({ gemini: config, fetch, esperar: async () => {} });

test("devolve o texto da resposta, sem as partes de raciocínio, e pede JSON no formato do esquema", async () => {
  let corpo;
  const fetch = async (url, opcoes) => {
    corpo = JSON.parse(opcoes.body);
    return respostaOk('{"a":1}');
  };
  const resposta = await gerarJson(PEDIDO, deps(fetch));
  assert.deepEqual(
    { texto: resposta.texto, modelo: resposta.modelo, tokens: resposta.tokens, chave: resposta.chave },
    { texto: '{"a":1}', modelo: "gemini-teste-001", tokens: 42, chave: "gratuita" }
  );
  assert.equal(corpo.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(corpo.generationConfig.responseSchema, { type: "OBJECT" });
  assert.equal(corpo.systemInstruction.parts[0].text, "sistema");
  assert.equal(corpo.generationConfig.thinkingConfig, undefined);
});

test("raciocinio vira o thinkingLevel da chamada", async () => {
  let corpo;
  const fetch = async (url, opcoes) => {
    corpo = JSON.parse(opcoes.body);
    return respostaOk("{}");
  };
  await gerarJson({ ...PEDIDO, raciocinio: "low" }, deps(fetch));
  assert.deepEqual(corpo.generationConfig.thinkingConfig, { thinkingLevel: "low" });
});

test("cota esgotada (429) na gratuita passa para a paga", async () => {
  const { fetch, chaves } = fetchFalso(new Response("quota", { status: 429 }), respostaOk("{}"));
  const resposta = await gerarJson(PEDIDO, deps(fetch));
  assert.equal(resposta.chave, "paga");
  assert.deepEqual(chaves, ["chave-gratuita", "chave-paga"]);
});

test("5xx repete com a mesma chave antes de passar para a paga", async () => {
  const { fetch, chaves } = fetchFalso(
    new Response("", { status: 503 }),
    new Response("", { status: 503 }),
    new Response("", { status: 503 }),
    respostaOk("{}")
  );
  const resposta = await gerarJson(PEDIDO, deps(fetch));
  assert.equal(resposta.chave, "paga");
  assert.deepEqual(chaves, ["chave-gratuita", "chave-gratuita", "chave-gratuita", "chave-paga"]);
});

test("erro que não é de cota nem transitório (400) não gasta a chave paga", async () => {
  const { fetch, chaves } = fetchFalso(new Response("API key not valid", { status: 400 }));
  await assert.rejects(gerarJson(PEDIDO, deps(fetch)), /status 400: API key not valid/);
  assert.deepEqual(chaves, ["chave-gratuita"]);
});

test("as duas chaves falhando dizem o que cada uma respondeu", async () => {
  const { fetch } = fetchFalso(new Response("", { status: 429 }), new Response("", { status: 429 }));
  await assert.rejects(gerarJson(PEDIDO, deps(fetch)), /As duas chaves falharam.*gratuita: status 429.*paga: status 429/);
});

test("sem nenhuma chave no .env, avisa que a extração está desligada", async () => {
  const config = { ...CONFIG, apiKeyFree: "", apiKey: "" };
  await assert.rejects(gerarJson(PEDIDO, deps(async () => respostaOk("{}"), config)), /não estão no \.env/);
});

test("somentePaga dispensa a gratuita; sem a paga no .env, usa a gratuita", async () => {
  const { fetch, chaves } = fetchFalso(respostaOk("{}"), respostaOk("{}"));
  assert.equal((await gerarJson({ ...PEDIDO, somentePaga: true }, deps(fetch))).chave, "paga");
  assert.equal((await gerarJson({ ...PEDIDO, somentePaga: true }, deps(fetch, { ...CONFIG, apiKey: "" }))).chave, "gratuita");
  assert.deepEqual(chaves, ["chave-paga", "chave-gratuita"]);
});

test("resposta vazia é erro", async () => {
  const { fetch } = fetchFalso(respostaOk(""));
  await assert.rejects(gerarJson(PEDIDO, deps(fetch, { ...CONFIG, apiKey: "" })), /resposta vazia/);
});
