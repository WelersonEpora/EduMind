"use strict";

const { DataTypes } = require("sequelize");

// Uma prova da biblioteca escolhida para um edital.
module.exports = (sequelize) =>
  sequelize.define(
    "EditalProva",
    {
      edital_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      prova_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false }
    },
    { tableName: "edital_prova", timestamps: true, updatedAt: false, underscored: true, createdAt: "created_at" }
  );
