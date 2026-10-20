"use strict";

const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "Edital",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      arquivo_nome: { type: DataTypes.TEXT, allowNull: false },
      arquivo_sha256: { type: DataTypes.STRING(64), allowNull: false },
      arquivo_bytes: { type: DataTypes.INTEGER, allowNull: false },
      total_paginas: { type: DataTypes.INTEGER, allowNull: false },
      banca: { type: DataTypes.TEXT },
      orgao: { type: DataTypes.TEXT },
      cargo: { type: DataTypes.TEXT },
      data_publicacao: { type: DataTypes.DATEONLY },
      metadados: { type: DataTypes.JSONB },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "texto_extraido" },
      erro: { type: DataTypes.TEXT }
    },
    {
      tableName: "edital",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
