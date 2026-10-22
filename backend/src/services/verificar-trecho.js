"use strict";

// Confere, por busca de texto, se o trecho literal que a IA devolveu (source_excerpt) existe na página que ela
// citou. A IA não participa: o resultado é só desta busca.
//
// Tolerância (decisão do orientador): só espaços e hifenização.
// - Espaços, tabulações e quebras de linha contam como um espaço só.
// - Palavra hifenizada no fim da linha ("conteú-\ndo") casa tanto com "conteúdo" quanto com "conteú-do", porque a
//   hifenização pode ser do PDF ou da própria palavra ("bem-\nestar"). Por isso a busca tenta as duas leituras.
// - Maiúsculas, acentos e pontuação precisam bater.

function normalizar(texto, manterHifen) {
  return texto
    .replace(/-[ \t]*\r?\n\s*/g, manterHifen ? "-" : "")
    .replace(/\s+/g, " ")
    .trim();
}

function contem(textoDaPagina, trecho) {
  for (const manterHifenNaPagina of [false, true]) {
    const pagina = normalizar(textoDaPagina, manterHifenNaPagina);
    for (const manterHifenNoTrecho of [false, true]) {
      if (pagina.includes(normalizar(trecho, manterHifenNoTrecho))) return true;
    }
  }
  return false;
}

// paginas: [{ numero, texto }]. Devolve { verificado, pagina_encontrada }:
// - verificado: o trecho está na página citada;
// - pagina_encontrada: quando não está na citada, a primeira outra página onde está (senão, null).
function verificarTrecho(paginas, { pagina, source_excerpt: trecho }) {
  if (typeof trecho !== "string" || normalizar(trecho, true) === "") {
    return { verificado: false, pagina_encontrada: null };
  }
  const citada = paginas.find((p) => p.numero === pagina);
  if (citada && contem(citada.texto, trecho)) return { verificado: true, pagina_encontrada: null };
  const outra = paginas.find((p) => p.numero !== pagina && contem(p.texto, trecho));
  return { verificado: false, pagina_encontrada: outra ? outra.numero : null };
}

module.exports = { verificarTrecho };
