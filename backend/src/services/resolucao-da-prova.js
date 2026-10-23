"use strict";

const { AppError } = require("../shared/errors");

// Indicação da versão do caderno quando o gabarito tem várias e o caderno não diz qual é a dele: a IA resolve as
// questões (sem ver o gabarito) e o código conta, em cada versão, quantas respostas batem. Na versão certa batem tanto
// quanto a IA acerta; nas outras, como as alternativas estão em outra ordem, só por acaso (perto de 1 em 5). O
// sistema só escolhe quando a diferença é grande; senão, quem escolhe é o orientador.

const LETRAS = ["A", "B", "C", "D", "E"];

const ESQUEMA_RESOLUCAO = {
  type: "OBJECT",
  properties: {
    respostas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { numero: { type: "INTEGER" }, resposta: { type: "STRING", nullable: true } },
        required: ["numero", "resposta"]
      }
    }
  },
  required: ["respostas"]
};

// Só as questões que a IA consegue resolver pelo texto: fora as que dependem de figura e as sem alternativas.
const resolvivel = (q) => !q.depende_de_imagem && Array.isArray(q.alternativas) && q.alternativas.length >= 2;

// O texto das questões para a IA. O texto de apoio vai uma vez só, numerado; as questões dizem qual usam.
function textoParaResolver(questoes) {
  const apoios = new Map();
  const partes = [];
  for (const q of questoes.filter(resolvivel)) {
    let referencia = "";
    if (q.texto_apoio) {
      if (!apoios.has(q.texto_apoio)) {
        apoios.set(q.texto_apoio, apoios.size + 1);
        partes.push(`<<<TEXTO DE APOIO ${apoios.size}>>>\n${q.texto_apoio}\n<<<FIM DO TEXTO DE APOIO ${apoios.size}>>>`);
      }
      referencia = ` (usa o texto de apoio ${apoios.get(q.texto_apoio)})`;
    }
    const alternativas = q.alternativas.map((a) => `(${a.letra}) ${a.texto}`).join("\n");
    partes.push(`<<<QUESTÃO ${q.numero}>>>${referencia}\n${q.enunciado}\n${alternativas}`);
  }
  return partes.join("\n\n");
}

// { numero: letra } com as respostas válidas da IA.
function lerResolucao(texto) {
  let lido;
  try {
    lido = JSON.parse(texto);
  } catch {
    throw new AppError(502, "A IA devolveu a resolução fora do formato JSON esperado.");
  }
  const respostas = {};
  for (const item of Array.isArray(lido.respostas) ? lido.respostas : []) {
    const letra = String(item?.resposta ?? "").trim().toUpperCase();
    if (Number.isInteger(item?.numero) && LETRAS.includes(letra)) respostas[item.numero] = letra;
  }
  return respostas;
}

// Conta, em cada versão, quantas respostas da IA batem com a letra do gabarito (só questões resolvíveis, que a IA
// respondeu e que têm letra na versão). Escolhe a melhor só se ela bate em pelo menos metade das consideradas e no
// mínimo o dobro da segunda.
// -> { consideradas, batem: [n por versão], indice: a versão indicada ou null }
function indicarVersao(versoes, respostasDaIa, questoes) {
  const numeros = questoes.filter(resolvivel).map((q) => q.numero).filter((n) => respostasDaIa[n]);
  const batem = versoes.map((v) => numeros.filter((n) => v.respostas[n]?.resposta === respostasDaIa[n]).length);
  const ordem = batem.map((n, i) => [n, i]).sort((a, b) => b[0] - a[0]);
  const [melhor, segunda] = ordem;
  const decisiva = melhor && melhor[0] > 0 && melhor[0] >= numeros.length / 2 && (!segunda || melhor[0] >= 2 * segunda[0]);
  return { consideradas: numeros.length, batem, indice: decisiva ? melhor[1] : null };
}

module.exports = { ESQUEMA_RESOLUCAO, textoParaResolver, lerResolucao, indicarVersao };
