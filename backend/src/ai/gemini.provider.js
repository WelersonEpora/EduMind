"use strict";

const env = require("../config/env");

// O Gemini pela API REST, sem SDK, no padrão do FinMind (src/ai/gemini-search.provider.js de lá), sem a busca na
// web: aqui a IA só lê o texto que recebe e devolve JSON no formato pedido (responseSchema).
//
// DUAS CHAVES: a gratuita é tentada primeiro; a paga só entra quando a gratuita esgota a cota (429), continua com
// 5xx depois das tentativas ou fica sem responder até o fim da janela (GEMINI_TIMEOUT_MS). Outros erros (chave
// inválida, pedido malformado, rede) não gastam a paga. Com uma só chave configurada, usa essa.

const URL_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Tentativas com a MESMA chave num 5xx (sobrecarga momentânea), com estas esperas entre elas.
const ESPERAS_ERRO_TRANSITORIO_MS = [2000, 5000];

class ErroDoGemini extends Error {
  constructor(message, { status = null, semResposta = false } = {}) {
    super(message);
    this.statusGemini = status;
    this.semResposta = semResposta;
  }
}

function esperarPadrao(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function eTransitorio(erro) {
  return erro.statusGemini >= 500 && erro.statusGemini < 600;
}

// Só o texto da resposta: partes marcadas como raciocínio ("thought") ficam de fora.
function extrairTexto(candidato) {
  const partes = candidato?.content?.parts || [];
  return partes
    .filter((parte) => !parte.thought && typeof parte.text === "string")
    .map((parte) => parte.text)
    .join("");
}

async function chamar({ apiKey, corpo, timeoutMs }, { config, fetchFn }) {
  let resposta;
  try {
    resposta = await fetchFn(`${URL_BASE}/models/${encodeURIComponent(config.model)}:generateContent`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: corpo
    });
  } catch (erro) {
    if (erro.name === "TimeoutError") {
      throw new ErroDoGemini(`O Gemini não respondeu em ${Math.round(config.timeoutMs / 1000)} s.`, { semResposta: true });
    }
    throw new ErroDoGemini(`Falha de rede ao chamar o Gemini: ${erro.message}`);
  }
  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => "");
    throw new ErroDoGemini(`O Gemini respondeu com status ${resposta.status}: ${texto.slice(0, 300)}`, {
      status: resposta.status
    });
  }
  return resposta.json();
}

function resultadoDaTentativa(erro) {
  if (!erro) return "ok";
  if (erro.semResposta) return "sem resposta";
  if (erro.statusGemini) return `status ${erro.statusGemini}`;
  return "erro";
}

// As tentativas com UMA chave, dentro de uma janela de `config.timeoutMs` para todas elas: num 5xx, repete com a
// mesma chave enquanto sobrar janela. Cada tentativa entra em `tentativas` ({ chave, resultado, segundos }).
async function chamarComRetry({ chave, apiKey, corpo }, contexto, tentativas) {
  const limite = contexto.agora() + contexto.config.timeoutMs;
  for (let tentativa = 0; ; tentativa += 1) {
    const inicio = contexto.agora();
    try {
      const json = await chamar({ apiKey, corpo, timeoutMs: Math.max(1, limite - inicio) }, contexto);
      tentativas.push({ chave, resultado: "ok", segundos: (contexto.agora() - inicio) / 1000 });
      return json;
    } catch (erro) {
      tentativas.push({ chave, resultado: resultadoDaTentativa(erro), segundos: (contexto.agora() - inicio) / 1000 });
      const espera = ESPERAS_ERRO_TRANSITORIO_MS[tentativa];
      const sobra = limite - contexto.agora() - (espera ?? 0);
      if (!eTransitorio(erro) || espera === undefined || sobra <= 0) throw erro;
      await contexto.esperar(espera);
    }
  }
}

// `somentePaga`: quem chama dispensa a gratuita (a extração do edital, decisão do orientador em 2026-10-22: sob
// "alta demanda" a gratuita segurava a chamada a janela inteira antes de a paga entrar). Sem a paga no .env, usa a
// gratuita mesmo assim.
function chavesEmOrdem(config, somentePaga = false) {
  const chaves = [
    config.apiKeyFree && { chave: "gratuita", apiKey: config.apiKeyFree },
    config.apiKey && { chave: "paga", apiKey: config.apiKey }
  ].filter(Boolean);
  return somentePaga && config.apiKey ? chaves.filter((c) => c.chave === "paga") : chaves;
}

function passaParaAPaga(erro) {
  return erro.statusGemini === 429 || eTransitorio(erro) || erro.semResposta === true;
}

function descreverTentativas(tentativas) {
  return tentativas.map((t) => `${t.chave}: ${t.resultado} em ${t.segundos.toFixed(1)} s`).join("; ");
}

async function chamarComChaves(corpo, deps, somentePaga) {
  const config = deps.gemini || env.gemini;
  const contexto = { config, fetchFn: deps.fetch || fetch, esperar: deps.esperar || esperarPadrao, agora: deps.agora || Date.now };
  const chaves = chavesEmOrdem(config, somentePaga);
  if (chaves.length === 0) {
    throw new ErroDoGemini("GEMINI_API_KEY_FREE e GEMINI_API_KEY não estão no .env: a extração com IA está desligada.");
  }

  const tentativas = [];
  let chaveUsada = chaves[0];
  let json;
  try {
    json = await chamarComRetry({ ...chaveUsada, corpo }, contexto, tentativas);
  } catch (erro) {
    if (chaves.length === 1 || !passaParaAPaga(erro)) {
      erro.message = `${erro.message} Tentativas: ${descreverTentativas(tentativas)}.`;
      throw erro;
    }
    chaveUsada = chaves[1];
    try {
      json = await chamarComRetry({ ...chaveUsada, corpo }, contexto, tentativas);
    } catch (erroPaga) {
      throw new ErroDoGemini(
        `As duas chaves falharam. Tentativas: ${descreverTentativas(tentativas)}. Última: ${erroPaga.message}`,
        { status: erroPaga.statusGemini }
      );
    }
  }

  const candidato = json.candidates?.[0];
  // Resposta cortada no limite de tamanho: o JSON vem incompleto e não serve.
  if (candidato?.finishReason === "MAX_TOKENS") {
    throw new ErroDoGemini("A resposta da IA passou do tamanho máximo e veio cortada (MAX_TOKENS). O edital é grande demais para uma chamada só.");
  }
  const texto = extrairTexto(candidato);
  if (!texto.trim()) {
    throw new ErroDoGemini(`O Gemini devolveu uma resposta vazia (finishReason: ${candidato?.finishReason ?? "?"}).`);
  }
  return {
    texto,
    modelo: json.modelVersion || config.model,
    tokens: json.usageMetadata?.totalTokenCount ?? null,
    chave: chaveUsada.chave,
    tentativas
  };
}

// Resposta em JSON no formato de `responseSchema` (subconjunto OpenAPI da API do Gemini). Devolve o texto como veio:
// quem lê e valida o JSON é quem chamou.
async function gerarJson({ systemInstruction, prompt, responseSchema, somentePaga = false }, deps = {}) {
  const corpo = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0 }
  });
  return chamarComChaves(corpo, deps, somentePaga);
}

module.exports = { gerarJson, ErroDoGemini };
