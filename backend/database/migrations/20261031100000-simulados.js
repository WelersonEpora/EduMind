"use strict";

// Simulador, prova completa cronometrada (etapa 5b). Decisões do orientador, 2026-10-26:
// - prova.duracao_minutos: o tempo das questões objetivas da prova real, preenchido pelo orientador. O simulado dura o
//   proporcional às questões disponíveis (as válidas, com gabarito, não anuladas e sem imagem); sem a duração, 3 min
//   por questão.
// - simulado: uma tentativa do aluno, guardada no servidor (fechar a aba não perde a prova e o tempo não reinicia).
//   questoes: os ids, na ordem da prova; respostas: { questaoId: "B" }; marcadas: ids para voltar depois.
//   Entregue (pelo aluno ou porque o tempo acabou), as respostas vão para a tabela resposta, com o simulado_id.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn("prova", "duracao_minutos", { type: Sequelize.INTEGER }, { transaction });
      await queryInterface.createTable(
        "simulado",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          usuario_id: { type: Sequelize.UUID, allowNull: false, references: { model: "usuario", key: "id" }, onDelete: "CASCADE" },
          edital_id: { type: Sequelize.UUID, allowNull: false, references: { model: "edital", key: "id" }, onDelete: "CASCADE" },
          prova_id: { type: Sequelize.UUID, allowNull: false, references: { model: "prova", key: "id" }, onDelete: "CASCADE" },
          questoes: { type: Sequelize.JSONB, allowNull: false },
          respostas: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
          marcadas: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
          duracao_minutos: { type: Sequelize.INTEGER, allowNull: false },
          duracao_estimada: { type: Sequelize.BOOLEAN, allowNull: false },
          termina_em: { type: Sequelize.DATE, allowNull: false },
          entregue_em: { type: Sequelize.DATE },
          acertos: { type: Sequelize.INTEGER },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") }
        },
        { transaction }
      );
      await queryInterface.addIndex("simulado", ["usuario_id", "edital_id"], { name: "ix_simulado_usuario_edital", transaction });
      await queryInterface.addColumn(
        "resposta",
        "simulado_id",
        { type: Sequelize.UUID, references: { model: "simulado", key: "id" }, onDelete: "CASCADE" },
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("resposta", "simulado_id", { transaction });
      await queryInterface.dropTable("simulado", { transaction });
      await queryInterface.removeColumn("prova", "duracao_minutos", { transaction });
    });
  }
};
