"use strict";

// Biblioteca de normas (etapa 2a-1).
// - jurisdicao: quem editou a norma ("BR" federal, "SP" estadual, "TJSP" tribunal). Entra na chave, porque o número
//   sozinho não identifica a norma: a Lei 1.111 federal não é a Lei Complementar 1.111 de SP.
// - url_oficial: a página da norma numa fonte oficial (.gov.br, .leg.br, .jus.br), para o coletor ou para o
//   orientador abrir e salvar; url_fonte diz quem a encontrou (a busca da IA ou o orientador).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn("norma", "jurisdicao", { type: Sequelize.STRING(10) }, { transaction });
      await queryInterface.addColumn("norma", "url_oficial", { type: Sequelize.TEXT }, { transaction });
      await queryInterface.addColumn("norma", "url_fonte", { type: Sequelize.STRING(20) }, { transaction });
      await queryInterface.addConstraint("norma", {
        type: "check",
        name: "ck_norma_url_fonte",
        fields: ["url_fonte"],
        where: { url_fonte: ["busca_ia", "orientador"] },
        transaction
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeConstraint("norma", "ck_norma_url_fonte", { transaction });
      for (const coluna of ["url_fonte", "url_oficial", "jurisdicao"]) {
        await queryInterface.removeColumn("norma", coluna, { transaction });
      }
    });
  }
};
