"use strict";

const { DataTypes } = require("sequelize");

// Uma prova anterior na biblioteca de provas (etapa 3a), compartilhada entre editais.
module.exports = (sequelize) =>
  sequelize.define(
    "Prova",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      banca: { type: DataTypes.TEXT },
      orgao: { type: DataTypes.TEXT },
      cargo: { type: DataTypes.TEXT },
      ano: { type: DataTypes.INTEGER },
      gabarito_situacao: { type: DataTypes.STRING(20) },
      observacoes: { type: DataTypes.TEXT }
    },
    {
      tableName: "prova",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
