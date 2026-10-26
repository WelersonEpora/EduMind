"use strict";

const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");

// Primeiro administrador da plataforma (etapa 4a). Roda a cada deploy (npm run db:seed), mas só age uma vez:
// - Se já existe algum administrador ativo, não faz nada e não lê as variáveis. ADMIN_NOME, ADMIN_EMAIL e
//   ADMIN_PASSWORD só são necessárias na primeira vez e podem sair do .env depois (decisão do orientador, 2026-10-26).
// - Sem administrador e sem ADMIN_EMAIL e ADMIN_PASSWORD, para com erro, em vez de gravar uma senha conhecida.
// - Se o e-mail já tem conta (de membro comum), ela vira administradora e a senha NÃO muda.
// - Equipe sem nenhum membro (a "Equipe inicial" da migration, com os editais e provas de antes do login) ganha o
//   administrador como orientador, para os dados não ficarem sem dono.
// Seeder é histórico: SQL direto, sem importar código da aplicação.

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    const [jaTem] = await sequelize.query("SELECT 1 FROM usuario WHERE admin AND ativo LIMIT 1", { type: sequelize.QueryTypes.SELECT });
    if (jaTem) return;

    const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const senha = process.env.ADMIN_PASSWORD || "";
    const nome = (process.env.ADMIN_NOME || "").trim() || "Administrador";
    if (!email || !senha) throw new Error("Nenhum administrador ainda: defina ADMIN_EMAIL e ADMIN_PASSWORD no .env para criar o primeiro.");
    if (senha.length < 8) throw new Error("ADMIN_PASSWORD precisa de pelo menos 8 caracteres.");

    const agora = new Date();

    await sequelize.transaction(async (transaction) => {
      const consultar = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT, transaction });
      const [existente] = await consultar("SELECT id FROM usuario WHERE email = :email", { email });
      let usuarioId = existente?.id;
      if (usuarioId) {
        await queryInterface.bulkUpdate("usuario", { admin: true, ativo: true, updated_at: agora }, { id: usuarioId }, { transaction });
      } else {
        usuarioId = randomUUID();
        const senha_hash = await bcrypt.hash(senha, 12);
        await queryInterface.bulkInsert(
          "usuario",
          [{ id: usuarioId, nome, email, senha_hash, admin: true, ativo: true, created_at: agora, updated_at: agora }],
          { transaction }
        );
      }

      const semMembros = await consultar("SELECT e.id FROM equipe e WHERE NOT EXISTS (SELECT 1 FROM membro m WHERE m.equipe_id = e.id)");
      if (semMembros.length) {
        await queryInterface.bulkInsert(
          "membro",
          semMembros.map((e) => ({ id: randomUUID(), equipe_id: e.id, usuario_id: usuarioId, papel: "orientador", ativo: true, created_at: agora, updated_at: agora })),
          { transaction }
        );
      }
    });
  },

  async down() {
    // Nada a desfazer automaticamente: apagar o administrador apagaria os vínculos dele com as equipes.
  }
};
