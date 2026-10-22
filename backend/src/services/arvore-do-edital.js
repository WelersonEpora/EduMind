"use strict";

const crypto = require("node:crypto");
const { AppError } = require("../shared/errors");
const { expandirArtigos } = require("../parsers/artigos.parser");
const { verificarTrecho } = require("./verificar-trecho");

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

module.exports = { ESQUEMA_ARVORE, montarArvore, artigosNoEdital };
