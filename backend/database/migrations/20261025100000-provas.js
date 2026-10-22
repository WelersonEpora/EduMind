"use strict";

// Biblioteca de provas anteriores (etapa 3a). Decisões do orientador, 2026-10-22:
// - As provas ficam numa biblioteca compartilhada entre editais, como as normas; cada edital escolhe as que usa.
// - O sistema não baixa provas: só monta links de busca. O orientador baixa e envia o PDF (e o gabarito).
// - O gabarito é aceito com a origem marcada (oficial definitivo, oficial preliminar ou não oficial).
//
// prova: os dados do concurso. prova_arquivo: o PDF da prova e o do gabarito (um de cada), com a página de onde o
// orientador baixou. prova_pagina: o texto de cada página, para a leitura das questões (etapa seguinte).
// edital_prova: as provas escolhidas para um edital.

module.exports = {
  async up(queryInterface, Sequelize) {
    const quando = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") }
    };
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "prova",
        {
          id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
          banca: { type: Sequelize.TEXT },
          orgao: { type: Sequelize.TEXT },
          cargo: { type: Sequelize.TEXT },
          ano: { type: Sequelize.INTEGER },
          gabarito_situacao: { type: Sequelize.STRING(20) },
          observacoes: { type: Sequelize.TEXT },
          ...quando
        },
        { transaction }
      );
      await queryInterface.addConstraint("prova", {
        type: "check",
        fields: ["gabarito_situacao"],
        where: { gabarito_situacao: ["oficial_definitivo", "oficial_preliminar", "nao_oficial"] },
        name: "ck_prova_gabarito_situacao",
        transaction
      });

      await queryInterface.createTable(
        "prova_arquivo",
        {
          id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
          prova_id: { type: Sequelize.UUID, allowNull: false, references: { model: "prova", key: "id" }, onDelete: "CASCADE" },
          tipo: { type: Sequelize.STRING(10), allowNull: false },
          nome: { type: Sequelize.TEXT, allowNull: false },
          caminho: { type: Sequelize.TEXT, allowNull: false },
          sha256: { type: Sequelize.STRING(64), allowNull: false, unique: true },
          bytes: { type: Sequelize.INTEGER, allowNull: false },
          origem_url: { type: Sequelize.TEXT },
          total_paginas: { type: Sequelize.INTEGER, allowNull: false },
          paginas_com_texto: { type: Sequelize.INTEGER, allowNull: false },
          ...quando
        },
        { transaction }
      );
      await queryInterface.addConstraint("prova_arquivo", {
        type: "check",
        fields: ["tipo"],
        where: { tipo: ["prova", "gabarito"] },
        name: "ck_prova_arquivo_tipo",
        transaction
      });
      await queryInterface.addConstraint("prova_arquivo", {
        type: "unique",
        fields: ["prova_id", "tipo"],
        name: "uq_prova_arquivo_prova_tipo",
        transaction
      });

      await queryInterface.createTable(
        "prova_pagina",
        {
          arquivo_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: "prova_arquivo", key: "id" },
            onDelete: "CASCADE"
          },
          numero: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true },
          texto: { type: Sequelize.TEXT, allowNull: false }
        },
        { transaction }
      );

      await queryInterface.createTable(
        "edital_prova",
        {
          edital_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: "edital", key: "id" },
            onDelete: "CASCADE"
          },
          prova_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: "prova", key: "id" },
            onDelete: "CASCADE"
          },
          created_at: quando.created_at
        },
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const tabela of ["edital_prova", "prova_pagina", "prova_arquivo", "prova"]) {
        await queryInterface.dropTable(tabela, { transaction });
      }
    });
  }
};
