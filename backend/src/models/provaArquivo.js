"use strict";

const { DataTypes } = require("sequelize");

// O PDF da prova ou o do gabarito, com a página de onde o orientador o baixou.
module.exports = (sequelize) =>
  sequelize.define(
    "ProvaArquivo",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      prova_id: { type: DataTypes.UUID, allowNull: false },
      tipo: { type: DataTypes.STRING(10), allowNull: false },
      nome: { type: DataTypes.TEXT, allowNull: false },
      caminho: { type: DataTypes.TEXT, allowNull: false },
      sha256: { type: DataTypes.STRING(64), allowNull: false },
      bytes: { type: DataTypes.INTEGER, allowNull: false },
      origem_url: { type: DataTypes.TEXT },
      total_paginas: { type: DataTypes.INTEGER, allowNull: false },
      paginas_com_texto: { type: DataTypes.INTEGER, allowNull: false }
    },
    {
      tableName: "prova_arquivo",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
