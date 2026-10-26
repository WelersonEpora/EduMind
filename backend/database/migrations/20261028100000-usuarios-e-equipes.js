"use strict";

const { randomUUID } = require("node:crypto");

// Login e equipes (etapa 4a). Decisões do orientador, 2026-10-26, no molde do Personal Assistant:
// - usuario: quem entra no sistema. admin = administrador da plataforma (cadastra orientadores); ativo = false
//   bloqueia o login sem apagar nada. O e-mail é gravado em minúsculas.
// - equipe: o espaço de trabalho de um orientador. Só o nome.
// - membro: o usuário numa equipe, com o papel (orientador, professor ou aluno). Um usuário pode estar em várias
//   equipes (um professor que atende dois orientadores), por isso a restrição única é (equipe_id, usuario_id).
// - Editais e provas são da equipe (edital.equipe_id, prova.equipe_id); o resto do edital e da prova vem junto pelas
//   chaves que já existem. A biblioteca de normas continua global: o texto da lei é o mesmo para todos.
// - O mesmo PDF pode estar em duas equipes: a unicidade do SHA-256 do edital passa a ser por equipe, e a do arquivo
//   da prova sai do banco (o serviço confere dentro da equipe).
// - Os editais e provas que já existem vão para uma "Equipe inicial", sem membros; o seeder do administrador o põe
//   como orientador dela.

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opcoes = { transaction };

      await queryInterface.createTable(
        "usuario",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          nome: { type: Sequelize.TEXT, allowNull: false },
          email: { type: Sequelize.TEXT, allowNull: false, unique: true },
          senha_hash: { type: Sequelize.STRING(100), allowNull: false },
          admin: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );

      await queryInterface.createTable(
        "equipe",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          nome: { type: Sequelize.TEXT, allowNull: false },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );

      await queryInterface.createTable(
        "membro",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          equipe_id: { type: Sequelize.UUID, allowNull: false, references: { model: "equipe", key: "id" }, onDelete: "CASCADE" },
          usuario_id: { type: Sequelize.UUID, allowNull: false, references: { model: "usuario", key: "id" }, onDelete: "CASCADE" },
          papel: { type: Sequelize.STRING(20), allowNull: false },
          ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await queryInterface.addConstraint("membro", {
        type: "check",
        name: "ck_membro_papel",
        fields: ["papel"],
        where: { papel: ["orientador", "professor", "aluno"] },
        transaction
      });
      await queryInterface.addConstraint("membro", { type: "unique", name: "uq_membro_equipe_usuario", fields: ["equipe_id", "usuario_id"], transaction });
      await queryInterface.addIndex("membro", ["usuario_id"], { name: "ix_membro_usuario", transaction });

      // Editais e provas passam a ser da equipe. Os que já existem vão para a "Equipe inicial".
      for (const tabela of ["edital", "prova"]) {
        await queryInterface.addColumn(tabela, "equipe_id", { type: Sequelize.UUID, references: { model: "equipe", key: "id" } }, opcoes);
      }
      const [[{ existentes }]] = await queryInterface.sequelize.query(
        "SELECT (SELECT count(*) FROM edital) + (SELECT count(*) FROM prova) AS existentes",
        opcoes
      );
      if (Number(existentes) > 0) {
        const equipeId = randomUUID();
        await queryInterface.bulkInsert("equipe", [{ id: equipeId, nome: "Equipe inicial", created_at: new Date(), updated_at: new Date() }], opcoes);
        for (const tabela of ["edital", "prova"]) {
          await queryInterface.sequelize.query(`UPDATE ${tabela} SET equipe_id = :equipeId`, { replacements: { equipeId }, transaction });
        }
      }
      for (const tabela of ["edital", "prova"]) {
        await queryInterface.changeColumn(tabela, "equipe_id", { type: Sequelize.UUID, allowNull: false }, opcoes);
        await queryInterface.addIndex(tabela, ["equipe_id"], { name: `ix_${tabela}_equipe`, transaction });
      }

      await queryInterface.removeConstraint("edital", "edital_arquivo_sha256_key", opcoes);
      await queryInterface.addConstraint("edital", { type: "unique", name: "uq_edital_equipe_sha256", fields: ["equipe_id", "arquivo_sha256"], transaction });
      await queryInterface.removeConstraint("prova_arquivo", "prova_arquivo_sha256_key", opcoes);
      await queryInterface.addIndex("prova_arquivo", ["sha256"], { name: "ix_prova_arquivo_sha256", transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opcoes = { transaction };
      await queryInterface.removeIndex("prova_arquivo", "ix_prova_arquivo_sha256", opcoes);
      await queryInterface.addConstraint("prova_arquivo", { type: "unique", name: "prova_arquivo_sha256_key", fields: ["sha256"], transaction });
      await queryInterface.removeConstraint("edital", "uq_edital_equipe_sha256", opcoes);
      await queryInterface.addConstraint("edital", { type: "unique", name: "edital_arquivo_sha256_key", fields: ["arquivo_sha256"], transaction });
      for (const tabela of ["prova", "edital"]) await queryInterface.removeColumn(tabela, "equipe_id", opcoes);
      for (const tabela of ["membro", "equipe", "usuario"]) await queryInterface.dropTable(tabela, opcoes);
    });
  }
};
