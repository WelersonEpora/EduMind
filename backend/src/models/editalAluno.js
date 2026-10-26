"use strict";

const { DataTypes } = require("sequelize");

// Um edital da equipe atribuído a um aluno (etapa 4c): o aluno só vê os editais atribuídos a ele.
module.exports = (sequelize) =>
  sequelize.define(
    "EditalAluno",
    {
      edital_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      usuario_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false }
    },
    { tableName: "edital_aluno", timestamps: true, updatedAt: false, underscored: true, createdAt: "created_at" }
  );
