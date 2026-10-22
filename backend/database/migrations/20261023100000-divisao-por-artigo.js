"use strict";

// Divisão das normas por artigo (etapa 2b).
// - norma_artigo.estrutura: onde o artigo está na norma ({ livro, titulo, capitulo, secao, subsecao }), para as
//   citações por estrutura do edital ("Título II - Capítulos I, II e III").
// - norma_artigo.redacao_anterior: o texto tachado que o Planalto mostra junto do vigente (decisão do orientador,
//   2026-10-23: fica à parte, como referência; o texto vigente não o inclui).
// - norma_versao.artigos_total, avisos e processada_em: o resultado da última divisão do arquivo em artigos.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn("norma_artigo", "estrutura", { type: Sequelize.JSONB }, { transaction });
      await queryInterface.addColumn("norma_artigo", "redacao_anterior", { type: Sequelize.TEXT }, { transaction });
      await queryInterface.addColumn("norma_versao", "artigos_total", { type: Sequelize.INTEGER }, { transaction });
      await queryInterface.addColumn("norma_versao", "avisos", { type: Sequelize.JSONB }, { transaction });
      await queryInterface.addColumn("norma_versao", "processada_em", { type: Sequelize.DATE }, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [tabela, coluna] of [
        ["norma_versao", "processada_em"],
        ["norma_versao", "avisos"],
        ["norma_versao", "artigos_total"],
        ["norma_artigo", "redacao_anterior"],
        ["norma_artigo", "estrutura"]
      ]) {
        await queryInterface.removeColumn(tabela, coluna, { transaction });
      }
    });
  }
};
