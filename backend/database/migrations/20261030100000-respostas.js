"use strict";

// Simulador (etapa 5a). Decisões do orientador, 2026-10-26: o aluno treina com as questões das provas escolhidas para
// os editais atribuídos a ele, e cada resposta fica guardada (é a base do caderno de erros e do desempenho, 5c).
// resposta: quem respondeu, qual questão, em qual edital (o contexto do treino), a letra e se acertou. A correção é
// feita no servidor: a tela só recebe o gabarito depois de responder.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "resposta",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          usuario_id: { type: Sequelize.UUID, allowNull: false, references: { model: "usuario", key: "id" }, onDelete: "CASCADE" },
          edital_id: { type: Sequelize.UUID, allowNull: false, references: { model: "edital", key: "id" }, onDelete: "CASCADE" },
          questao_id: { type: Sequelize.UUID, allowNull: false, references: { model: "prova_questao", key: "id" }, onDelete: "CASCADE" },
          resposta: { type: Sequelize.STRING(1), allowNull: false },
          acertou: { type: Sequelize.BOOLEAN, allowNull: false },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") }
        },
        { transaction }
      );
      await queryInterface.addIndex("resposta", ["usuario_id", "edital_id"], { name: "ix_resposta_usuario_edital", transaction });
      await queryInterface.addIndex("resposta", ["questao_id"], { name: "ix_resposta_questao", transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("resposta");
  }
};
