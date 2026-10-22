"use strict";

const { DataTypes } = require("sequelize");

// Um nó da árvore do conteúdo programático: bloco > disciplina > assunto > subassunto.
module.exports = (sequelize) =>
  sequelize.define(
    "EditalItem",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      edital_id: { type: DataTypes.UUID, allowNull: false },
      parent_id: { type: DataTypes.UUID },
      nivel: { type: DataTypes.STRING(20), allowNull: false },
      ordem: { type: DataTypes.INTEGER, allowNull: false },
      texto: { type: DataTypes.TEXT, allowNull: false },
      source_excerpt: { type: DataTypes.TEXT, allowNull: false },
      pagina: { type: DataTypes.INTEGER, allowNull: false },
      verificado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      pagina_encontrada: { type: DataTypes.INTEGER },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "rascunho" },
      status_em: { type: DataTypes.DATE },
      editado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    },
    {
      tableName: "edital_item",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
