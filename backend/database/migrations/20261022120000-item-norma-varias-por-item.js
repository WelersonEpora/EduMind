"use strict";

// Um item do edital pode citar mais de uma norma: "Código de Processo Penal - artigos 251 a 258; ... e Lei n.º 9.099
// (artigos 60 a 83; 88 e 89)". Na migration inicial, item_norma tinha item_id como chave primária (uma norma por
// item). Aqui ela é recriada com id próprio e a ordem da citação no item. A tabela estava vazia: nada se perde.
//
// Também guarda se o trecho dos artigos (artigos_texto, entrada do parser) foi achado no texto do edital, porque um
// "293 a 305" alterado pela IA mudaria a lista de artigos.

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("item_norma", { transaction });
      await queryInterface.createTable(
        "item_norma",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          item_id: { type: Sequelize.UUID, allowNull: false, references: { model: "edital_item", key: "id" }, onDelete: "CASCADE" },
          // Ordem da citação dentro do item (0, 1, ...).
          ordem: { type: Sequelize.INTEGER, allowNull: false },
          tipo: { type: Sequelize.TEXT },
          numero: { type: Sequelize.TEXT },
          ano: { type: Sequelize.TEXT },
          nome: { type: Sequelize.TEXT },
          // Trecho dos artigos como está no edital ("artigos 293 a 305; 307; ...").
          artigos_texto: { type: Sequelize.TEXT },
          // O trecho dos artigos está no texto do edital (na página do item ou na seguinte).
          artigos_texto_verificado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          // Saída do parser: { artigos, intervalos, avisos }.
          artigos: { type: Sequelize.JSONB },
          norma_id: { type: Sequelize.UUID, references: { model: "norma", key: "id" } },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await queryInterface.addConstraint("item_norma", {
        type: "unique",
        name: "uq_item_norma_item_ordem",
        fields: ["item_id", "ordem"],
        transaction
      });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("item_norma", { transaction });
      await queryInterface.createTable(
        "item_norma",
        {
          item_id: { type: Sequelize.UUID, allowNull: false, primaryKey: true, references: { model: "edital_item", key: "id" }, onDelete: "CASCADE" },
          tipo: { type: Sequelize.TEXT },
          numero: { type: Sequelize.TEXT },
          ano: { type: Sequelize.TEXT },
          nome: { type: Sequelize.TEXT },
          artigos_texto: { type: Sequelize.TEXT },
          artigos: { type: Sequelize.JSONB },
          norma_id: { type: Sequelize.UUID, references: { model: "norma", key: "id" } },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
    });
  }
};
