"use strict";

// Leitura das questões da prova (etapa 3b). Decisões do orientador, 2026-10-22:
// - A IA lê o texto das páginas e devolve cada questão; o código confere que enunciado e alternativas existem
//   literalmente no texto da prova e que o gabarito existe no PDF do gabarito.
// - Todas as questões são guardadas, com a disciplina da prova.
// - Só as questões com problema vão para a revisão do orientador; as conferidas valem direto.
//
// prova.leitura_status: null (nunca lida), "lendo", "lida" ou "erro"; leitura: registro das chamadas e avisos.
// prova_questao.status: "valida", "a_revisar" ou "descartada". revisada_em: quando o orientador mexeu nela (ler de
// novo a prova pede confirmação se houver alguma).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn("prova", "leitura_status", { type: Sequelize.STRING(20) }, { transaction });
      await queryInterface.addColumn("prova", "leitura_erro", { type: Sequelize.TEXT }, { transaction });
      await queryInterface.addColumn("prova", "leitura", { type: Sequelize.JSONB }, { transaction });

      await queryInterface.createTable(
        "prova_questao",
        {
          id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
          prova_id: { type: Sequelize.UUID, allowNull: false, references: { model: "prova", key: "id" }, onDelete: "CASCADE" },
          numero: { type: Sequelize.INTEGER, allowNull: false },
          disciplina: { type: Sequelize.TEXT },
          pagina: { type: Sequelize.INTEGER },
          texto_apoio: { type: Sequelize.TEXT },
          enunciado: { type: Sequelize.TEXT, allowNull: false },
          alternativas: { type: Sequelize.JSONB, allowNull: false },
          gabarito: { type: Sequelize.STRING(1) },
          anulada: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          depende_de_imagem: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          problemas: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
          status: { type: Sequelize.STRING(20), allowNull: false },
          editada: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          revisada_em: { type: Sequelize.DATE },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") }
        },
        { transaction }
      );
      await queryInterface.addConstraint("prova_questao", {
        type: "unique",
        fields: ["prova_id", "numero"],
        name: "uq_prova_questao_prova_numero",
        transaction
      });
      await queryInterface.addConstraint("prova_questao", {
        type: "check",
        fields: ["status"],
        where: { status: ["valida", "a_revisar", "descartada"] },
        name: "ck_prova_questao_status",
        transaction
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("prova_questao", { transaction });
      for (const coluna of ["leitura", "leitura_erro", "leitura_status"]) await queryInterface.removeColumn("prova", coluna, { transaction });
    });
  }
};
