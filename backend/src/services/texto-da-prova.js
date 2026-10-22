"use strict";

// O texto corrido de uma prova (ou gabarito) e a conferência dos trechos que a IA devolve.
//
// - Cabeçalho e rodapé que se repetem nas páginas ("www.pciconcursos.com.br14tjsp2503 / 001-escrevente...", marca
//   d'água) saem do texto: uma questão que continua na página seguinte precisa casar sem eles no meio. Linha repetida
//   é a que aparece (ignorando os números, como o da página) em pelo menos metade das páginas.
// - A tolerância da conferência é a do edital (verificar-trecho.js): só espaços e hifenização de fim de linha.

const MINIMO_DE_PAGINAS_PARA_REPETICAO = 3;

const chaveDaLinha = (linha) => linha.replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

function textoCorrido(paginas) {
  const ordenadas = [...paginas].sort((a, b) => a.numero - b.numero);
  const repetidas = new Set();
  if (ordenadas.length >= MINIMO_DE_PAGINAS_PARA_REPETICAO) {
    const contagem = new Map();
    for (const pagina of ordenadas) {
      for (const chave of new Set(pagina.texto.split("\n").map(chaveDaLinha).filter(Boolean))) {
        contagem.set(chave, (contagem.get(chave) || 0) + 1);
      }
    }
    for (const [chave, vezes] of contagem) if (vezes >= ordenadas.length / 2) repetidas.add(chave);
  }
  return ordenadas
    .map((pagina) =>
      pagina.texto
        .split("\n")
        .filter((linha) => !repetidas.has(chaveDaLinha(linha)))
        .join("\n")
    )
    .join("\n");
}

// Texto normalizado (espaços juntos; com ou sem o hífen de fim de linha) e, para cada caractere dele, a posição no
// texto original: permite achar um trecho no normalizado e recortar o original.
function normalizarComMapa(texto, manterHifen) {
  let saida = "";
  const mapa = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === "-") {
      let j = i + 1;
      while (j < texto.length && (texto[j] === " " || texto[j] === "\t")) j += 1;
      if (texto[j] === "\n" || (texto[j] === "\r" && texto[j + 1] === "\n")) {
        while (j < texto.length && /\s/.test(texto[j])) j += 1;
        if (manterHifen) {
          saida += "-";
          mapa.push(i);
        }
        i = j;
        continue;
      }
    }
    if (/\s/.test(c)) {
      let j = i;
      while (j < texto.length && /\s/.test(texto[j])) j += 1;
      if (saida !== "" && j < texto.length) {
        saida += " ";
        mapa.push(i);
      }
      i = j;
      continue;
    }
    saida += c;
    mapa.push(i);
    i += 1;
  }
  return { texto: saida, mapa };
}

const normalizar = (texto, manterHifen) => normalizarComMapa(texto, manterHifen).texto;

// Onde o trecho está no texto: { inicio, fim } no texto original (fim exclusivo), ou null.
function localizar(texto, trecho, aPartirDe = 0) {
  if (typeof trecho !== "string" || trecho.trim() === "") return null;
  for (const manterNoTexto of [false, true]) {
    const { texto: normalizado, mapa } = normalizarComMapa(texto, manterNoTexto);
    const inicioNormalizado = mapa.findIndex((posicao) => posicao >= aPartirDe);
    if (inicioNormalizado < 0) continue;
    for (const manterNoTrecho of [false, true]) {
      const alvo = normalizar(trecho, manterNoTrecho);
      if (!alvo) continue;
      const achado = normalizado.indexOf(alvo, inicioNormalizado);
      if (achado >= 0) return { inicio: mapa[achado], fim: mapa[achado + alvo.length - 1] + 1 };
    }
  }
  return null;
}

const contem = (texto, trecho) => localizar(texto, trecho) !== null;

// O texto de apoio, do PDF: do começo ao fim que a IA indicou, sem os hífens de fim de linha. null se não achar.
function recortar(texto, comeco, final) {
  const inicio = localizar(texto, comeco);
  if (!inicio) return null;
  const fim = localizar(texto, final, inicio.inicio);
  if (!fim) return null;
  return texto
    .slice(inicio.inicio, fim.fim)
    .replace(/-[ \t]*\r?\n[ \t]*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

module.exports = { textoCorrido, localizar, contem, recortar, normalizar };
