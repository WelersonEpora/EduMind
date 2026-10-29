"use strict";

const crypto = require("node:crypto");
const { AppError } = require("../shared/errors");
const { expandirArtigos } = require("../parsers/artigos.parser");
const { verificarTrecho, contem } = require("./verificar-trecho");

// Árvore do conteúdo programático (etapa 1b-2): o esquema da resposta da IA e a montagem das linhas de edital_item e
// item_norma a partir dela, com a conferência de cada trecho e a expansão dos artigos pelo parser.

const NIVEIS = ["bloco", "disciplina", "assunto", "subassunto"];
// Onde estão os filhos de cada nível na resposta da IA.
const FILHOS = { bloco: "disciplinas", disciplina: "assuntos", assunto: "subassuntos" };

// Subconjunto OpenAPI aceito pelo Gemini em generationConfig.responseSchema.
const TEXTO_NULO = { type: "STRING", nullable: true };
const NORMA = {
  type: "OBJECT",
  properties: { tipo: TEXTO_NULO, numero: TEXTO_NULO, ano: TEXTO_NULO, nome: TEXTO_NULO, artigos_texto: TEXTO_NULO },
  required: ["tipo", "numero", "ano", "nome", "artigos_texto"]
};
const BASE = { texto: { type: "STRING" }, pagina: { type: "INTEGER" }, source_excerpt: { type: "STRING" } };
const no = (extras) => ({
  type: "OBJECT",
  properties: { ...BASE, ...extras },
  required: ["texto", "pagina", "source_excerpt", ...Object.keys(extras)]
});
const SUBASSUNTO = no({ normas: { type: "ARRAY", items: NORMA } });
const ASSUNTO = no({ normas: { type: "ARRAY", items: NORMA }, subassuntos: { type: "ARRAY", items: SUBASSUNTO } });
const DISCIPLINA = no({ assuntos: { type: "ARRAY", items: ASSUNTO } });
const BLOCO = no({ disciplinas: { type: "ARRAY", items: DISCIPLINA } });
const ESQUEMA_ARVORE = {
  type: "OBJECT",
  properties: { blocos: { type: "ARRAY", items: BLOCO } },
  required: ["blocos"]
};

function lista(valor) {
  return Array.isArray(valor) ? valor : [];
}

function textoOuNulo(valor) {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

// O trecho dos artigos é a entrada do parser: precisa estar no edital, na página do item ou continuando na seguinte
// ("... 319 a 333;" no fim de uma página e "336 e 337; ..." no começo da outra). Por isso a busca é no texto das duas
// páginas juntas.
function artigosNoEdital(paginas, pagina, artigosTexto) {
  const textos = paginas.filter((p) => p.numero === pagina || p.numero === pagina + 1).map((p) => p.texto);
  if (textos.length === 0) return false;
  return verificarTrecho([{ numero: pagina, texto: textos.join("\n") }], { pagina, source_excerpt: artigosTexto }).verificado;
}

// Onde a norma é citada no edital, para o selo da norma na revisão: { pagina, termo } ou null. Calculado na leitura,
// sem gravar. Procura, nesta ordem, o número, o trecho dos artigos, o nome e o tipo, como a IA os copiou, na página
// do item (a partir do começo do trecho do item, para não pegar a mesma norma citada num item anterior) e na
// seguinte (o item pode continuar nela).
function citacaoDaNorma(paginas, item, norma) {
  const pagina = item.verificado ? item.pagina : (item.pagina_encontrada ?? item.pagina);
  const texto = (numero) => paginas.find((p) => p.numero === numero)?.texto ?? "";
  const doItem = aPartirDoTrecho(texto(pagina), item.source_excerpt);
  const seguinte = texto(pagina + 1);
  for (const termo of [norma.numero, norma.artigos_texto, norma.nome, norma.tipo].filter(Boolean)) {
    if (contem(doItem, termo)) return { pagina, termo };
    if (contem(seguinte, termo)) return { pagina: pagina + 1, termo };
  }
  return null;
}

// O texto da página a partir de onde o trecho começa (espaços e quebras de linha contam como um espaço só); sem o
// trecho na página, o texto inteiro.
function aPartirDoTrecho(texto, trecho) {
  const palavras = (trecho || "").trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return texto;
  const achado = new RegExp(palavras.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")).exec(texto);
  return achado ? texto.slice(achado.index) : texto;
}

// Os itens (objetos simples, com as normas) com `citacao` em cada norma. `paginas` precisa ter as páginas dos itens
// e as seguintes.
function comCitacoes(itens, paginas) {
  for (const item of itens) {
    for (const norma of item.normas || []) norma.citacao = citacaoDaNorma(paginas, item, norma);
  }
  return itens;
}

function montarNorma(norma, ordem, item, paginas, novoId) {
  const artigosTexto = textoOuNulo(norma?.artigos_texto);
  return {
    id: novoId(),
    item_id: item.id,
    ordem,
    tipo: textoOuNulo(norma?.tipo),
    numero: textoOuNulo(norma?.numero),
    ano: textoOuNulo(norma?.ano),
    nome: textoOuNulo(norma?.nome),
    artigos_texto: artigosTexto,
    artigos_texto_verificado: artigosTexto ? artigosNoEdital(paginas, item.pagina, artigosTexto) : false,
    artigos: artigosTexto ? expandirArtigos(artigosTexto) : null
  };
}

// textoDaResposta -> { itens, normas }: as linhas de edital_item (pais antes dos filhos) e de item_norma.
function montarArvore(textoDaResposta, paginas, { novoId = () => crypto.randomUUID() } = {}) {
  let resposta;
  try {
    resposta = JSON.parse(textoDaResposta);
  } catch {
    throw new AppError(502, "A IA devolveu a árvore do conteúdo num JSON inválido. Tente extrair de novo.");
  }
  if (!resposta || typeof resposta !== "object" || !Array.isArray(resposta.blocos)) {
    throw new AppError(502, "A IA devolveu a árvore do conteúdo fora do formato esperado. Tente extrair de novo.");
  }

  const itens = [];
  const normas = [];

  function percorrer(nos, nivel, parentId) {
    lista(nos).forEach((no, ordem) => {
      const pagina = Number.isInteger(no?.pagina) ? no.pagina : 0;
      const sourceExcerpt = typeof no?.source_excerpt === "string" ? no.source_excerpt : "";
      const item = {
        id: novoId(),
        parent_id: parentId,
        nivel,
        ordem,
        texto: String(no?.texto ?? "").trim(),
        source_excerpt: sourceExcerpt,
        pagina,
        ...verificarTrecho(paginas, { pagina, source_excerpt: sourceExcerpt })
      };
      itens.push(item);
      lista(no?.normas).forEach((norma, i) => normas.push(montarNorma(norma, i, item, paginas, novoId)));
      const proximoNivel = NIVEIS[NIVEIS.indexOf(nivel) + 1];
      if (FILHOS[nivel]) percorrer(no?.[FILHOS[nivel]], proximoNivel, item.id);
    });
  }

  percorrer(resposta.blocos, "bloco", null);
  return { itens, normas };
}

module.exports = { ESQUEMA_ARVORE, montarArvore, artigosNoEdital, comCitacoes };
