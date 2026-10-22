"use strict";

const { DataTypes } = require("sequelize");

// Norma da biblioteca, compartilhada entre editais. `chave` é a identidade estável ("br:lei:9099:1995").
module.exports = (sequelize) =>
  sequelize.define(
    "Norma",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      chave: { type: DataTypes.TEXT, allowNull: false },
      tipo: { type: DataTypes.TEXT, allowNull: false },
      numero: { type: DataTypes.TEXT },
      ano: { type: DataTypes.TEXT },
      nome: { type: DataTypes.TEXT, allowNull: false },
      esfera: { type: DataTypes.STRING(20) },
      jurisdicao: { type: DataTypes.STRING(10) },
      url_oficial: { type: DataTypes.TEXT },
      url_fonte: { type: DataTypes.STRING(20) }
    },
    {
      tableName: "norma",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
