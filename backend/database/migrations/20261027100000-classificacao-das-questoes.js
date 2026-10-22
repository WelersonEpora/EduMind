"use strict";

// Classificação das questões por norma e artigo (etapa 3c). Decisões do orientador, 2026-10-22:
// - A questão é classificada por norma e artigo, não por item do edital: vale para qualquer edital, e o item sai da
//   cobertura (os artigos que cada item pede).
// - Um artigo principal (o que decide a resposta) e até 3 relacionados.
// - Roda por um botão no cartão da prova; só o que não bate na conferência vai para a revisão do orientador.
//
// prova: classificacao_status (null, "classificando", "classificada", "erro"), classificacao_erro e classificacao
// (registro das chamadas). prova_questao: classificacao_status ("classificada", "a_revisar", "nao_juridica"),
// classificacao_problemas e norma_citada (a norma como a IA a nomeou, quando não está na biblioteca).
// questao_artigo: as referências da questão (norma da biblioteca, número do artigo, papel).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn("prova", "classificacao_status", { type: Sequelize.STRING(20) }, { transaction });
      await queryInterface.addColumn("prova", "classificacao_erro", { type: Sequelize.TEXT }, { transaction });
      await queryInterface.addColumn("prova", "classificacao", { type: Sequelize.JSONB }, { transaction });
      await queryInterface.addColumn("prova_questao", "classificacao_status", { type: Sequelize.STRING(20) }, { transaction });
      await queryInterface.addColumn("prova_questao", "classificacao_problemas", { type: Sequelize.JSONB }, { transaction });
      await queryInterface.addColumn("prova_questao", "norma_citada", { type: Sequelize.TEXT }, { transaction });

      await queryInterface.createTable(
        "questao_artigo",
        {
          id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
          questao_id: { type: Sequelize.UUID, allowNull: false, references: { model: "prova_questao", key: "id" }, onDelete: "CASCADE" },
          norma_id: { type: Sequelize.UUID, allowNull: false, references: { model: "norma", key: "id" }, onDelete: "CASCADE" },
          artigo: { type: Sequelize.TEXT, allowNull: false },
          papel: { type: Sequelize.STRING(12), allowNull: false },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") }
        },
        { transaction }
      );
      await queryInterface.addConstraint("questao_artigo", {
        type: "check",
        fields: ["papel"],
        where: { papel: ["principal", "relacionado"] },
        name: "ck_questao_artigo_papel",
        transaction
      });
      await queryInterface.addConstraint("questao_artigo", {
        type: "unique",
        fields: ["questao_id", "norma_id", "artigo"],
        name: "uq_questao_artigo",
        transaction
      });
      await queryInterface.addIndex("questao_artigo", ["norma_id", "artigo"], { name: "ix_questao_artigo_norma_artigo", transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("questao_artigo", { transaction });
      for (const coluna of ["norma_citada", "classificacao_problemas", "classificacao_status"]) await queryInterface.removeColumn("prova_questao", coluna, { transaction });
      for (const coluna of ["classificacao", "classificacao_erro", "classificacao_status"]) await queryInterface.removeColumn("prova", coluna, { transaction });
    });
  }
};
