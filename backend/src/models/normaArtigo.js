"use strict";

const { DataTypes } = require("sequelize");

// Um artigo do texto de uma versão da norma, como o parser leu (parsers/artigos-da-norma.js).
module.exports = (sequelize) =>
  sequelize.define(
    "NormaArtigo",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      versao_id: { type: DataTypes.UUID, allowNull: false },
      numero: { type: DataTypes.TEXT, allowNull: false },
      ordem: { type: DataTypes.INTEGER, allowNull: false },
      caput: { type: DataTypes.TEXT },
      paragrafos: { type: DataTypes.JSONB },
      incisos: { type: DataTypes.JSONB },
      notas: { type: DataTypes.JSONB },
      revogado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      texto_bruto: { type: DataTypes.TEXT, allowNull: false },
      estrutura: { type: DataTypes.JSONB },
      redacao_anterior: { type: DataTypes.TEXT }
    },
    {
      tableName: "norma_artigo",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
