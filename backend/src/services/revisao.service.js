"use strict";

const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const { dataValida } = require("../shared/datas");
const { expandirArtigos } = require("../parsers/artigos.parser");
const { artigosNoEdital } = require("./arvore-do-edital");

// Revisão do orientador (etapa 1c): aprovar, rejeitar ou voltar a rascunho cada item extraído pela IA, e corrigir o
// texto. Vale para os itens da árvore (edital_item), para as normas citadas (item_norma) e para os metadados (o JSON
// em edital.metadados, onde cada item revisável ganha status, status_em e editado).
//
// Decisões do orientador (2026-10-22): edita-se texto e citação de artigos, sem criar, apagar ou mover itens; a
// aprovação em lote é por disciplina e só pega os itens verificados e sem pendência na citação de normas.

const STATUS = ["rascunho", "aprovado", "rejeitado"];

// O que dá para editar em cada tipo de item dos metadados.
const EDITAVEIS_NOS_METADADOS = {
  campo: ["valor"],
  bloco: ["nome"],
  disciplina: ["nome", "questoes"],
  descricao: ["descricao"]
};
// Campos dos metadados que também ficam em coluna do edital.
const COLUNAS = ["banca", "orgao", "cargo", "data_publicacao"];

// Os itens revisáveis dos metadados, cada um com o caminho que a tela usa para se referir a ele.
function itensDosMetadados(metadados) {
  if (!metadados) return [];
  const itens = [];
  for (const [chave, campo] of Object.entries(metadados.campos || {})) {
    if (campo) itens.push({ caminho: `campos.${chave}`, tipo: "campo", item: campo });
  }
  (metadados.blocos || []).forEach((bloco, i) => {
    itens.push({ caminho: `blocos.${i}`, tipo: "bloco", item: bloco });
    (bloco.disciplinas || []).forEach((disciplina, j) => {
      itens.push({ caminho: `blocos.${i}.disciplinas.${j}`, tipo: "disciplina", item: disciplina });
    });
  });
  (metadados.regras_de_corte || []).forEach((regra, i) => {
    itens.push({ caminho: `regras_de_corte.${i}`, tipo: "descricao", item: regra });
  });
  if (metadados.discursiva) itens.push({ caminho: "discursiva", tipo: "descricao", item: metadados.discursiva });
  return itens;
}

function foiRevisado(item) {
  return (item.status != null && item.status !== "rascunho") || item.editado === true;
}

function textoObrigatorio(valor, rotulo) {
  if (typeof valor !== "string" || valor.trim() === "") throw new AppError(400, `${rotulo} não pode ficar vazio.`);
  return valor.trim();
}

function textoOpcional(valor, rotulo) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") throw new AppError(400, `${rotulo} precisa ser texto.`);
  return valor.trim() === "" ? null : valor.trim();
}

// Aplica { status, ...edições } a um item (objeto simples ou instância do Sequelize). `editaveis` diz o que pode ser
// editado; um valor diferente do atual marca o item como editado.
function aplicar(item, alteracoes, editaveis, agora) {
  const { status, ...edicoes } = alteracoes || {};
  if (status === undefined && Object.keys(edicoes).length === 0) throw new AppError(400, "Nada para alterar.");
  for (const campo of Object.keys(edicoes)) {
    if (!editaveis.includes(campo)) throw new AppError(400, `O campo "${campo}" não pode ser editado aqui.`);
  }
  if (status !== undefined) {
    if (!STATUS.includes(status)) throw new AppError(400, `Status inválido: ${status}.`);
    item.status = status;
    item.status_em = status === "rascunho" ? null : agora().toISOString();
  }
  for (const [campo, valor] of Object.entries(edicoes)) {
    let novo;
    if (campo === "questoes") {
      if (valor !== null && !(Number.isInteger(valor) && valor >= 0)) {
        throw new AppError(400, "O número de questões precisa ser um inteiro maior ou igual a zero.");
      }
      novo = valor;
    } else {
      novo = textoObrigatorio(valor, "O texto");
    }
    if (novo !== item[campo]) {
      item[campo] = novo;
      item.editado = true;
    }
  }
}

function criarRevisaoService({ sequelize, agora = () => new Date() }) {
  const { Edital, EditalPagina, EditalItem, ItemNorma } = sequelize.models;

  async function editalExtraido(id, opcoes = {}) {
    const edital = eUuid(id) ? await Edital.findByPk(id, opcoes) : null;
    if (!edital) throw new AppError(404, "Edital não encontrado.");
    if (edital.status !== "extraido") throw new AppError(409, "A revisão só é possível com a extração concluída.");
    return edital;
  }

  async function itemDoEdital(editalId, itemId, opcoes = {}) {
    const item = eUuid(itemId) ? await EditalItem.findOne({ where: { id: itemId, edital_id: editalId }, ...opcoes }) : null;
    if (!item) throw new AppError(404, "Item não encontrado neste edital.");
    return item;
  }

  async function itemComNormas(itemId) {
    const item = await EditalItem.findByPk(itemId, {
      attributes: { exclude: ["edital_id", "created_at", "updated_at"] },
      include: [{ model: ItemNorma, as: "normas", attributes: { exclude: ["item_id", "created_at", "updated_at"] } }],
      order: [[{ model: ItemNorma, as: "normas" }, "ordem", "ASC"]]
    });
    return item.get({ plain: true });
  }

  // caminho: "campos.banca", "blocos.0", "blocos.0.disciplinas.2", "regras_de_corte.1" ou "discursiva".
  async function revisarMetadado(editalId, { caminho, ...alteracoes }) {
    return sequelize.transaction(async (transaction) => {
      const edital = await editalExtraido(editalId, { transaction, lock: transaction.LOCK.UPDATE });
      const metadados = structuredClone(edital.metadados);
      const alvo = itensDosMetadados(metadados).find((i) => i.caminho === caminho);
      if (!alvo) throw new AppError(404, "Item dos metadados não encontrado.");
      if (caminho === "campos.data_publicacao" && alteracoes.valor !== undefined && !dataValida(alteracoes.valor)) {
        throw new AppError(400, "A data de publicação precisa estar no formato AAAA-MM-DD.");
      }
      aplicar(alvo.item, alteracoes, EDITAVEIS_NOS_METADADOS[alvo.tipo], agora);

      const colunas = {};
      const chave = caminho.slice("campos.".length);
      if (caminho.startsWith("campos.") && COLUNAS.includes(chave)) colunas[chave] = alvo.item.valor;
      await edital.update({ metadados, ...colunas }, { transaction });
      return metadados;
    });
  }

  async function revisarItem(editalId, itemId, alteracoes) {
    await editalExtraido(editalId);
    const item = await itemDoEdital(editalId, itemId);
    aplicar(item, alteracoes, ["texto"], agora);
    await item.save();
    return itemComNormas(item.id);
  }

  // Corrige a identificação da norma e o trecho dos artigos. Um trecho novo é expandido de novo pelo parser e
  // conferido de novo no edital (na página do item ou na seguinte).
  async function revisarNorma(editalId, normaId, alteracoes) {
    await editalExtraido(editalId);
    const norma = eUuid(normaId) ? await ItemNorma.findByPk(normaId) : null;
    if (!norma) throw new AppError(404, "Norma não encontrada neste edital.");
    const item = await itemDoEdital(editalId, norma.item_id).catch(() => {
      throw new AppError(404, "Norma não encontrada neste edital.");
    });

    const permitidos = ["tipo", "numero", "ano", "nome", "artigos_texto"];
    const campos = Object.keys(alteracoes || {});
    if (campos.length === 0) throw new AppError(400, "Nada para alterar.");
    let mudou = false;
    for (const campo of campos) {
      if (!permitidos.includes(campo)) throw new AppError(400, `O campo "${campo}" não pode ser editado aqui.`);
      const novo = textoOpcional(alteracoes[campo], `O campo "${campo}"`);
      if (novo === norma[campo]) continue;
      norma[campo] = novo;
      mudou = true;
      if (campo === "artigos_texto") {
        const paginas = await EditalPagina.findAll({
          where: { edital_id: editalId, numero: [item.pagina, item.pagina + 1] },
          attributes: ["numero", "texto"],
          raw: true
        });
        norma.artigos = novo ? expandirArtigos(novo) : null;
        norma.artigos_texto_verificado = novo ? artigosNoEdital(paginas, item.pagina, novo) : false;
      }
    }
    if (mudou) {
      await sequelize.transaction(async (transaction) => {
        await norma.save({ transaction });
        await item.update({ editado: true }, { transaction });
      });
    }
    return itemComNormas(item.id);
  }

  // Aprova de uma vez a disciplina e os itens dela que estão em rascunho, com o trecho verificado e sem pendência na
  // citação das normas (trecho dos artigos não achado no edital ou partes que não são artigos). O resto fica para
  // conferir um a um.
  async function aprovarVerificados(editalId, disciplinaId) {
    await editalExtraido(editalId);
    const disciplina = await itemDoEdital(editalId, disciplinaId);
    if (disciplina.nivel !== "disciplina") throw new AppError(400, "A aprovação em lote é feita por disciplina.");

    const itens = await EditalItem.findAll({
      where: { edital_id: editalId },
      include: [{ model: ItemNorma, as: "normas" }]
    });
    const filhos = new Map();
    for (const item of itens) {
      if (!filhos.has(item.parent_id)) filhos.set(item.parent_id, []);
      filhos.get(item.parent_id).push(item);
    }
    const daDisciplina = [];
    const juntar = (item) => {
      daDisciplina.push(item);
      (filhos.get(item.id) || []).forEach(juntar);
    };
    juntar(itens.find((i) => i.id === disciplina.id));

    const semPendencia = (item) =>
      item.verificado &&
      item.normas.every((n) => (!n.artigos_texto || n.artigos_texto_verificado) && !(n.artigos?.avisos?.length > 0));
    const emRascunho = daDisciplina.filter((item) => item.status === "rascunho");
    const aprovar = emRascunho.filter(semPendencia).map((item) => item.id);
    if (aprovar.length > 0) {
      await EditalItem.update({ status: "aprovado", status_em: agora() }, { where: { id: aprovar } });
    }
    return { aprovados: aprovar.length, pendentes: emRascunho.length - aprovar.length };
  }

  return { revisarMetadado, revisarItem, revisarNorma, aprovarVerificados };
}

// Quantos itens já passaram pela revisão (aprovados, rejeitados ou editados), na árvore e nos metadados. A extração
// usa para avisar antes de substituir tudo.
async function contarRevisados(sequelize, edital) {
  const { EditalItem } = sequelize.models;
  const itens = await EditalItem.findAll({ where: { edital_id: edital.id }, attributes: ["status", "editado"], raw: true });
  return itens.filter(foiRevisado).length + itensDosMetadados(edital.metadados).filter((i) => foiRevisado(i.item)).length;
}

module.exports = { criarRevisaoService, contarRevisados, itensDosMetadados };
