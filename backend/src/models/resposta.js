"use strict";

const { DataTypes } = require("sequelize");

// A resposta de um usuário a uma questão no simulador (etapas 5a e 5b), no contexto de um edital.
module.exports = (sequelize) =>
  sequelize.define(
    "Resposta",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      usuario_id: { type: DataTypes.UUID, allowNull: false },
      edital_id: { type: DataTypes.UUID, allowNull: false },
      questao_id: { type: DataTypes.UUID, allowNull: false },
      resposta: { type: DataTypes.STRING(1), allowNull: false },
      acertou: { type: DataTypes.BOOLEAN, allowNull: false },
      // A prova completa de onde veio a resposta (etapa 5b); null: treino.
      simulado_id: { type: DataTypes.UUID }
    },
    { tableName: "resposta", timestamps: true, updatedAt: false, underscored: true, createdAt: "created_at" }
  );
