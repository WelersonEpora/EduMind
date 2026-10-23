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

// Todas as versões do caderno que o gabarito traz: qual vale é o caderno que diz (ou o orientador escolhe).
const ESQUEMA_GABARITO = {
  type: "OBJECT",
  properties: {
    versoes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          versao: TEXTO_NULO,
          respostas: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { numero: { type: "INTEGER" }, resposta: { type: "STRING" } }, required: ["numero", "resposta"] }
          }
        },
        required: ["versao", "respostas"]
      }
    }
  },
  required: ["versoes"]
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

// Os problemas que vêm do gabarito: refeitos quando o orientador escolhe a versão ou confere o gabarito.
const PROBLEMAS_DE_GABARITO = [
  "Sem resposta no gabarito.",
  "Resposta do gabarito não reconhecida",
  "Anulada no gabarito.",
  "O gabarito (",
  "Resposta não encontrada no PDF do gabarito.",
  "A prova ainda não tem gabarito.",
  "O gabarito é de outra versão do caderno.",
  "Escolha a versão do gabarito."
];
const eProblemaDeGabarito = (problema) => PROBLEMAS_DE_GABARITO.some((p) => problema.startsWith(p));

// As versões do gabarito lido: [{ versao, respostas: { numero: { resposta, valida, conferida } } }]. conferida: o par
// número-resposta existe no texto do PDF; null quando o gabarito é imagem (não há texto para conferir).
function versoesDoGabarito(respostaGabarito, textoDoGabarito, gabaritoDaImagem) {
  const lido = lerJson(respostaGabarito, "o gabarito");
  return lista(lido.versoes).map((v) => {
    const respostas = {};
    for (const item of lista(v?.respostas)) {
      if (!Number.isInteger(item?.numero)) continue;
      const resposta = String(item.resposta ?? "").trim().toUpperCase();
      const valida = resposta === "ANULADA" || LETRAS.includes(resposta);
      respostas[item.numero] = { resposta, valida, conferida: gabaritoDaImagem ? null : valida && respostaNoGabarito(textoDoGabarito, item.numero, resposta) };
    }
    return { versao: textoOuNulo(v?.versao), respostas };
  });
}

// Qual versão do gabarito vale: a única, ou a de mesmo nome que a do caderno. null: o orientador escolhe.
function versaoQueVale(versoes, versaoDoCaderno) {
  if (versoes.length === 1) return 0;
  if (!versaoDoCaderno) return null;
  const indice = versoes.findIndex((v) => v.versao && mesmaVersao(v.versao, versaoDoCaderno));
  return indice >= 0 ? indice : null;
}

// A resposta de uma questão a partir da linha do gabarito ({ resposta, valida, conferida } ou nada).
function respostaDaQuestao(entrada, alternativas) {
  const problemas = [];
  if (!entrada) return { gabarito: null, anulada: false, problemas: ["Sem resposta no gabarito."] };
  if (!entrada.valida) return { gabarito: null, anulada: false, problemas: [`Resposta do gabarito não reconhecida: "${entrada.resposta}".`] };
  let gabarito = null;
  let anulada = false;
  if (entrada.resposta === "ANULADA") {
    anulada = true;
    problemas.push("Anulada no gabarito.");
  } else {
    gabarito = entrada.resposta;
    if (!alternativas.some((a) => a.letra === gabarito)) problemas.push(`O gabarito (${gabarito}) não é uma das alternativas.`);
  }
  if (entrada.conferida === false) problemas.push("Resposta não encontrada no PDF do gabarito.");
  return { gabarito, anulada, problemas };
}

// -> { questoes: linhas de prova_questao (sem prova_id), avisos, versoes, gabarito }
// gabaritoDaImagem: o gabarito não tem texto e a IA leu o PDF como imagem. Sem texto não há o que conferir por código:
// a resposta não é marcada como problema em cada questão, e o orientador confere o gabarito inteiro de uma vez.
function montarQuestoes({ respostaQuestoes, respostaGabarito, paginasDaProva, paginasDoGabarito, gabaritoDaImagem = false }, { novoId = () => crypto.randomUUID() } = {}) {
  const lidas = lerJson(respostaQuestoes, "as questões");
  const textoDaProva = textoCorrido(paginasDaProva);
  const avisos = [];

  const versoes = respostaGabarito === null ? [] : versoesDoGabarito(respostaGabarito, textoCorrido(paginasDoGabarito), gabaritoDaImagem);

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

  // A versão do gabarito que vale. Gabarito de uma versão só com nome diferente do caderno: vale, mas tudo vai para
  // revisão. Várias versões sem uma que bata com o caderno: nenhuma vale até o orientador escolher.
  const versaoDoCaderno = textoOuNulo(lidas.versao);
  const indiceDaVersao = versaoQueVale(versoes, versaoDoCaderno);
  const escolhida = indiceDaVersao === null ? null : versoes[indiceDaVersao];
  const versaoDoGabarito = escolhida?.versao ?? null;
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
    if (respostaGabarito === null) problemas.push("A prova ainda não tem gabarito.");
    else if (!escolhida) problemas.push("Escolha a versão do gabarito.");
    else {
      const daQuestao = respostaDaQuestao(escolhida.respostas[q.numero], alternativas);
      resposta = daQuestao.gabarito;
      anulada = daQuestao.anulada;
      problemas.push(...daQuestao.problemas);
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
  const soNoGabarito = Object.keys(escolhida?.respostas || {}).map(Number).filter((n) => !numeros.has(n)).sort((a, b) => a - b);
  if (soNoGabarito.length > 0) avisos.push(`O gabarito tem ${soNoGabarito.length === 1 ? "a questão" : "as questões"} ${soNoGabarito.join(", ")}, que não ${soNoGabarito.length === 1 ? "veio" : "vieram"} na leitura da prova.`);

  if (versoesDiferentes) {
    avisos.push(`O caderno é "${versaoDoCaderno}" e o gabarito é de "${versaoDoGabarito}": as respostas podem estar trocadas. Envie o gabarito da mesma versão.`);
  }

  if (versoes.length > 1 && !escolhida) {
    const nomes = versoes.map((v, i) => v.versao || `versão ${i + 1}`).join(", ");
    avisos.push(`O gabarito tem ${versoes.length} versões (${nomes}) e ${versaoDoCaderno ? `nenhuma é a do caderno ("${versaoDoCaderno}")` : "o caderno não diz qual é a dele"}: escolha a versão na tela das questões.`);
  }
  if (respostaGabarito !== null && versoes.length === 0) avisos.push("A leitura do gabarito não trouxe nenhuma resposta.");
  if (gabaritoDaImagem) {
    avisos.push("O gabarito é uma imagem: a IA leu as respostas, mas não há texto para conferi-las. Confira o gabarito na tela das questões.");
  }
  const origemDoGabarito =
    respostaGabarito === null ? null : { lido_de: gabaritoDaImagem ? "imagem" : "texto", versoes, versao_escolhida: indiceDaVersao, conferido_em: null };
  return { questoes, avisos, versoes: { caderno: versaoDoCaderno, gabarito: versaoDoGabarito }, gabarito: origemDoGabarito };
}

module.exports = { ESQUEMA_QUESTOES, ESQUEMA_GABARITO, montarQuestoes, respostaNoGabarito, respostaDaQuestao, eProblemaDeGabarito };
