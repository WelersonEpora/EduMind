"use strict";

const { DataTypes } = require("sequelize");

// Uma referência da questão: norma da biblioteca, número do artigo e papel (principal ou relacionado).
module.exports = (sequelize) =>
  sequelize.define(
    "QuestaoArtigo",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      questao_id: { type: DataTypes.UUID, allowNull: false },
      norma_id: { type: DataTypes.UUID, allowNull: false },
      artigo: { type: DataTypes.TEXT, allowNull: false },
      papel: { type: DataTypes.STRING(12), allowNull: false }
    },
    { tableName: "questao_artigo", timestamps: true, updatedAt: false, underscored: true, createdAt: "created_at" }
  );
