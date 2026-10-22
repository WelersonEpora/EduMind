"use strict";

// Conferência das citações por estrutura (etapa 2c-2). Decisão do orientador, 2026-10-22: os artigos que o código
// acha para "Título II - Capítulos I, II e III" só valem na cobertura depois que o orientador confere a lista.
// item_norma.estrutura_conferida: { texto, versao_id, artigos, conferida_em } — o trecho do edital, a versão da norma
// e a lista conferidos. Se o trecho for corrigido na revisão ou a lista mudar (outra versão), volta a pedir conferência.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("item_norma", "estrutura_conferida", { type: Sequelize.JSONB });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("item_norma", "estrutura_conferida");
  }
};
