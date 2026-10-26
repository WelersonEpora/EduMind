"use strict";

const { Op } = require("sequelize");
const { itensDosMetadados } = require("./revisao.service");
const { proporIdentidade } = require("./identidade-da-norma");

// Andamento de cada edital extraído, calculado a partir do que já está no banco (sem coluna nova): quantos itens a
// revisão ainda tem em rascunho e quantas normas as Fontes ainda não resolveram. Com as mesmas regras das telas:
// - Revisão: itens da árvore (edital_item) e itens dos dados do concurso (o JSON em edital.metadados) em rascunho;
// - Fontes: normas citadas nos itens aprovados, agrupadas como na tela de Fontes (pela norma ligada ou pela identidade
//   proposta); uma norma está resolvida quando a identidade foi confirmada e ela tem ao menos uma versão do texto.
// A etapa é a primeira que tem pendência: "revisao", "fontes" ou "pronto" (a cobertura pode ser conferida).
// Editais que não estão "extraido" ficam sem andamento (null): a situação deles é a da extração.

async function calcularAndamento(sequelize, editais) {
  const { EditalItem, ItemNorma, NormaVersao } = sequelize.models;
  const ids = editais.filter((e) => e.status === "extraido").map((e) => e.id);
  const resultado = new Map(editais.map((e) => [e.id, null]));
  if (ids.length === 0) return resultado;

  const rascunhosNaArvore = await EditalItem.findAll({
    where: { edital_id: ids, status: "rascunho" },
    attributes: ["edital_id", [sequelize.fn("COUNT", sequelize.col("id")), "total"]],
    group: ["edital_id"],
    raw: true
  });
  const naArvore = new Map(rascunhosNaArvore.map((r) => [r.edital_id, Number(r.total)]));

  const citacoes = await ItemNorma.findAll({
    attributes: ["tipo", "numero", "ano", "nome", "norma_id"],
    include: [{ model: EditalItem, as: "item", where: { edital_id: ids, status: "aprovado" }, attributes: ["edital_id", "texto"] }],
    raw: true,
    nest: true
  });
  const normasLigadas = [...new Set(citacoes.map((c) => c.norma_id).filter(Boolean))];
  const comTexto = new Set(
    normasLigadas.length
      ? (await NormaVersao.findAll({ where: { norma_id: { [Op.in]: normasLigadas } }, attributes: ["norma_id"], raw: true })).map(
          (v) => v.norma_id
        )
      : []
  );

  // edital -> grupos de normas pendentes (a mesma chave de grupo da tela de Fontes)
  const pendentesNasFontes = new Map();
  for (const citacao of citacoes) {
    const editalId = citacao.item.edital_id;
    if (!pendentesNasFontes.has(editalId)) pendentesNasFontes.set(editalId, new Set());
    if (citacao.norma_id) {
      if (!comTexto.has(citacao.norma_id)) pendentesNasFontes.get(editalId).add(`norma:${citacao.norma_id}`);
    } else {
      pendentesNasFontes.get(editalId).add(`proposta:${proporIdentidade(citacao, citacao.item.texto).chave}`);
    }
  }

  for (const edital of editais) {
    if (edital.status !== "extraido") continue;
    const revisao =
      (naArvore.get(edital.id) || 0) +
      itensDosMetadados(edital.metadados).filter((i) => (i.item.status || "rascunho") === "rascunho").length;
    const fontes = pendentesNasFontes.get(edital.id)?.size || 0;
    const etapa = revisao > 0 ? "revisao" : fontes > 0 ? "fontes" : "pronto";
    resultado.set(edital.id, { etapa, revisao_pendentes: revisao, fontes_pendentes: fontes });
  }
  return resultado;
}

module.exports = { calcularAndamento };
