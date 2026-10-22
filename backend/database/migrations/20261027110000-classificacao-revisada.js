"use strict";

// Quando o orientador corrigiu a classificação da questão (etapa 3c). Classificar de novo mantém essas questões.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("prova_questao", "classificacao_revisada_em", { type: Sequelize.DATE });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("prova_questao", "classificacao_revisada_em");
  }
};
