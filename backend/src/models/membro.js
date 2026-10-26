"use strict";

const { DataTypes } = require("sequelize");

const PAPEIS = ["orientador", "professor", "aluno"];

// O usuário numa equipe, com o papel (etapa 4a). Um usuário pode estar em várias equipes.
module.exports = (sequelize) =>
  sequelize.define(
    "Membro",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      equipe_id: { type: DataTypes.UUID, allowNull: false },
      usuario_id: { type: DataTypes.UUID, allowNull: false },
      papel: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [PAPEIS] } },
      ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    },
    {
      tableName: "membro",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

module.exports.PAPEIS = PAPEIS;
