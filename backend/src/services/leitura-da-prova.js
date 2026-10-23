"use strict";

const crypto = require("node:crypto");
const { AppError } = require("../shared/errors");
const { textoCorrido, contem, recortar, normalizar } = require("./texto-da-prova");

// Leitura das questões (etapa 3b): os esquemas das respostas da IA e a montagem das linhas de prova_questao, com a
// conferência de cada trecho no texto da prova e de cada resposta no texto do gabarito.

const TEXTO_NULO = { type: "STRING", nullable: true };
const ESQUEMA_QUESTOES = {
  type: "OBJECT",
  properties: {
    versao: TEXTO_NULO,
    questoes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          numero: { type: "INTEGER" },
          disciplina: TEXTO_NULO,
          pagina: { type: "INTEGER" },
          apoio: {
            type: "OBJECT",
            nullable: true,
            properties: { inicio: { type: "STRING" }, fim: { type: "STRING" } },
            required: ["inicio", "fim"]
          },
          enunciado: { type: "STRING" },
          alternativas: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { letra: { type: "STRING" }, texto: { type: "STRING" } }, required: ["letra", "texto"] }
          },
          depende_de_imagem: { type: "BOOLEAN" }
        },
        required: ["numero", "disciplina", "pagina", "apoio", "enunciado", "alternativas", "depende_de_imagem"]
      }
    }
  },
  required: ["versao", "questoes"]
};

const ESQUEMA_GABARITO = {
  type: "OBJECT",
  properties: {
    versao: TEXTO_NULO,
    respostas: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { numero: { type: "INTEGER" }, resposta: { type: "STRING" } }, required: ["numero", "resposta"] }
    }
  },
  required: ["versao", "respostas"]
};

const LETRAS = ["A", "B", "C", "D", "E"];

function lerJson(texto, oQue) {
  try {
    return JSON.parse(texto);
  } catch {
    throw new AppError(502, `A IA devolveu ${oQue} fora do formato JSON esperado.`);
  }
}

const lista = (valor) => (Array.isArray(valor) ? valor : []);
const textoOuNulo = (valor) => (typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null);

// O par número-resposta está no texto do gabarito? "43 - C", "43. C", "43) C", "043 C"; anulada: "43 - *", "43 -
// ANULADA", "43 X". A IA leu; o código só confirma que o par existe.
function respostaNoGabarito(textoDoGabarito, numero, resposta) {
  const texto = normalizar(textoDoGabarito, false);
  const marca = resposta === "ANULADA" ? "(?:\\*|anulad[ao]|x(?![a-z]))" : `${resposta}(?![A-Za-zÀ-ú])`;
  return new RegExp(`(?<![\\d])0*${numero}\\s*[-–—.:)]?\\s*${marca}`, "i").test(texto);
}

// A versão do caderno e a do gabarito batem? "Versão 1" e "versao 1" batem; sem uma das duas, não dá para dizer.
const mesmaVersao = (a, b) =>
  normalizar(a, false)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") ===
  normalizar(b, false)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// -> { questoes: linhas de prova_questao (sem prova_id), avisos, versoes }
// gabaritoDaImagem: o gabarito não tem texto e a IA leu o PDF como imagem. Sem texto não há o que conferir por código:
// a resposta não é marcada como problema em cada questão, e o orientador confere o gabarito inteiro de uma vez.
function montarQuestoes({ respostaQuestoes, respostaGabarito, paginasDaProva, paginasDoGabarito, gabaritoDaImagem = false }, { novoId = () => crypto.randomUUID() } = {}) {
  const lidas = lerJson(respostaQuestoes, "as questões");
  const textoDaProva = textoCorrido(paginasDaProva);
  const avisos = [];

  const gabarito = new Map();
  let versaoDoGabarito = null;
  if (respostaGabarito !== null) {
    const lido = lerJson(respostaGabarito, "o gabarito");
    versaoDoGabarito = textoOuNulo(lido.versao);
    const textoDoGabarito = textoCorrido(paginasDoGabarito);
    for (const item of lista(lido.respostas)) {
      if (!Number.isInteger(item?.numero)) continue;
      const resposta = String(item.resposta ?? "").trim().toUpperCase();
      const valida = resposta === "ANULADA" || LETRAS.includes(resposta);
      gabarito.set(item.numero, { resposta, valida, conferida: valida && respostaNoGabarito(textoDoGabarito, item.numero, resposta) });
    }
  }

  // Questões repetidas na resposta: fica a primeira.
  const vistas = new Set();
  const questoesLidas = lista(lidas.questoes).filter((q) => {
    if (!Number.isInteger(q?.numero) || vistas.has(q.numero)) return false;
    vistas.add(q.numero);
    return true;
  });
  // Quantas alternativas a prova costuma ter (a mais comum): questão fora disso é suspeita.
  const contagens = new Map();
  for (const q of questoesLidas) contagens.set(lista(q.alternativas).length, (contagens.get(lista(q.alternativas).length) || 0) + 1);
  const alternativasDaProva = [...contagens.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 5;

  const versaoDoCaderno = textoOuNulo(lidas.versao);
  const versoesDiferentes = Boolean(versaoDoCaderno && versaoDoGabarito && !mesmaVersao(versaoDoCaderno, versaoDoGabarito));

  const questoes = questoesLidas.map((q) => {
    const problemas = versoesDiferentes ? ["O gabarito é de outra versão do caderno."] : [];
    const enunciado = String(q.enunciado ?? "").trim();
    if (!enunciado || !contem(textoDaProva, enunciado)) problemas.push("Enunciado não encontrado no texto da prova.");

    const alternativas = lista(q.alternativas).map((a) => ({
      letra: String(a?.letra ?? "").replace(/[()\s]/g, "").toUpperCase(),
      texto: String(a?.texto ?? "").trim()
    }));
    for (const alternativa of alternativas) {
      if (!alternativa.texto || !contem(textoDaProva, alternativa.texto)) {
        problemas.push(`Alternativa (${alternativa.letra || "?"}) não encontrada no texto da prova.`);
      }
    }
    if (alternativas.length !== alternativasDaProva) {
      problemas.push(`Tem ${alternativas.length} alternativas; as outras questões têm ${alternativasDaProva}.`);
    }

    let textoApoio = null;
    if (q.apoio && (textoOuNulo(q.apoio.inicio) || textoOuNulo(q.apoio.fim))) {
      textoApoio = recortar(textoDaProva, String(q.apoio.inicio ?? ""), String(q.apoio.fim ?? ""));
      if (!textoApoio) problemas.push("Texto de apoio não encontrado no texto da prova.");
    }

    const dependeDeImagem = q.depende_de_imagem === true;
    if (dependeDeImagem) problemas.push("Depende de figura, gráfico ou tabela que não está no texto.");

    let resposta = null;
    let anulada = false;
    if (respostaGabarito !== null) {
      const g = gabarito.get(q.numero);
      if (!g) problemas.push("Sem resposta no gabarito.");
      else if (!g.valida) problemas.push(`Resposta do gabarito não reconhecida: "${g.resposta}".`);
      else {
        if (g.resposta === "ANULADA") {
          anulada = true;
          problemas.push("Anulada no gabarito.");
        } else {
          resposta = g.resposta;
          if (!alternativas.some((a) => a.letra === resposta)) problemas.push(`O gabarito (${resposta}) não é uma das alternativas.`);
        }
        if (!gabaritoDaImagem && !g.conferida) problemas.push("Resposta não encontrada no PDF do gabarito.");
      }
    } else {
      problemas.push("A prova ainda não tem gabarito.");
    }

    return {
      id: novoId(),
      numero: q.numero,
      disciplina: textoOuNulo(q.disciplina),
      pagina: Number.isInteger(q.pagina) ? q.pagina : null,
      texto_apoio: textoApoio,
      enunciado,
      alternativas,
      gabarito: resposta,
      anulada,
      depende_de_imagem: dependeDeImagem,
      problemas,
      status: problemas.length === 0 ? "valida" : "a_revisar"
    };
  });
  questoes.sort((a, b) => a.numero - b.numero);

  // Numeração: buracos e números do gabarito que não estão na prova.
  const numeros = new Set(questoes.map((q) => q.numero));
  const maior = Math.max(0, ...numeros);
  const faltando = [];
  for (let n = 1; n <= maior; n += 1) if (!numeros.has(n)) faltando.push(n);
  if (faltando.length > 0) avisos.push(`A leitura não trouxe ${faltando.length === 1 ? "a questão" : "as questões"} ${faltando.join(", ")}.`);
  const soNoGabarito = [...gabarito.keys()].filter((n) => !numeros.has(n)).sort((a, b) => a - b);
  if (soNoGabarito.length > 0) avisos.push(`O gabarito tem ${soNoGabarito.length === 1 ? "a questão" : "as questões"} ${soNoGabarito.join(", ")}, que não ${soNoGabarito.length === 1 ? "veio" : "vieram"} na leitura da prova.`);

  if (versoesDiferentes) {
    avisos.push(`O caderno é "${versaoDoCaderno}" e o gabarito é de "${versaoDoGabarito}": as respostas podem estar trocadas. Envie o gabarito da mesma versão.`);
  }

  if (gabaritoDaImagem) {
    avisos.push("O gabarito é uma imagem: a IA leu as respostas, mas não há texto para conferi-las. Confira o gabarito na tela das questões.");
  }
  const origemDoGabarito = respostaGabarito === null ? null : { lido_de: gabaritoDaImagem ? "imagem" : "texto", conferido_em: null };
  return { questoes, avisos, versoes: { caderno: versaoDoCaderno, gabarito: versaoDoGabarito }, gabarito: origemDoGabarito };
}

module.exports = { ESQUEMA_QUESTOES, ESQUEMA_GABARITO, montarQuestoes, respostaNoGabarito };
