"use strict";

const { DataTypes } = require("sequelize");

// O texto de uma página do PDF da prova ou do gabarito.
module.exports = (sequelize) =>
  sequelize.define(
    "ProvaPagina",
    {
      arquivo_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      numero: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
      texto: { type: DataTypes.TEXT, allowNull: false }
    },
    { tableName: "prova_pagina", timestamps: false }
  );
