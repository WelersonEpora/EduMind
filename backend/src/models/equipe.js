"use strict";

const { DataTypes } = require("sequelize");

// O espaço de trabalho de um orientador (etapa 4a): os editais e as provas são da equipe.
module.exports = (sequelize) =>
  sequelize.define(
    "Equipe",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      nome: { type: DataTypes.TEXT, allowNull: false }
    },
    {
      tableName: "equipe",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
