"use strict";

// Permissões por papel (etapa 4c). Decisão do orientador, 2026-10-26: o aluno vê só os editais que o orientador
// atribuir a ele. edital_aluno guarda essa atribuição: o edital (da equipe) e o usuário do aluno. Sai junto com o
// edital ou com a conta.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("edital_aluno", {
      edital_id: { type: Sequelize.UUID, allowNull: false, primaryKey: true, references: { model: "edital", key: "id" }, onDelete: "CASCADE" },
      usuario_id: { type: Sequelize.UUID, allowNull: false, primaryKey: true, references: { model: "usuario", key: "id" }, onDelete: "CASCADE" },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") }
    });
    await queryInterface.addIndex("edital_aluno", ["usuario_id"], { name: "ix_edital_aluno_usuario" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("edital_aluno");
  }
};
