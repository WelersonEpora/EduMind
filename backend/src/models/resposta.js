"use strict";

const { DataTypes } = require("sequelize");

// A resposta de um usuário a uma questão no simulador (etapa 5a), no contexto de um edital.
module.exports = (sequelize) =>
  sequelize.define(
    "Resposta",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      usuario_id: { type: DataTypes.UUID, allowNull: false },
      edital_id: { type: DataTypes.UUID, allowNull: false },
      questao_id: { type: DataTypes.UUID, allowNull: false },
      resposta: { type: DataTypes.STRING(1), allowNull: false },
      acertou: { type: DataTypes.BOOLEAN, allowNull: false }
    },
    { tableName: "resposta", timestamps: true, updatedAt: false, underscored: true, createdAt: "created_at" }
  );
