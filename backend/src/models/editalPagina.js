"use strict";

const { DataTypes } = require("sequelize");

// Texto de uma página do PDF, como o pdfjs extraiu. Nunca é alterado depois de gravado.
module.exports = (sequelize) =>
  sequelize.define(
    "EditalPagina",
    {
      edital_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      numero: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
      texto: { type: DataTypes.TEXT, allowNull: false }
    },
    {
      tableName: "edital_pagina",
      timestamps: false,
      underscored: true
    }
  );
