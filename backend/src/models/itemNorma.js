"use strict";

const { DataTypes } = require("sequelize");

// Norma citada por um item do edital. Os artigos são expandidos por código (parsers/artigos.parser.js).
module.exports = (sequelize) =>
  sequelize.define(
    "ItemNorma",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      item_id: { type: DataTypes.UUID, allowNull: false },
      ordem: { type: DataTypes.INTEGER, allowNull: false },
      tipo: { type: DataTypes.TEXT },
      numero: { type: DataTypes.TEXT },
      ano: { type: DataTypes.TEXT },
      nome: { type: DataTypes.TEXT },
      artigos_texto: { type: DataTypes.TEXT },
      artigos_texto_verificado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      artigos: { type: DataTypes.JSONB },
      norma_id: { type: DataTypes.UUID }
    },
    {
      tableName: "item_norma",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
