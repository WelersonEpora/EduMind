"use strict";

const { DataTypes } = require("sequelize");

// Uma prova anterior na biblioteca de provas (etapa 3a), compartilhada entre editais.
module.exports = (sequelize) =>
  sequelize.define(
    "Prova",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      equipe_id: { type: DataTypes.UUID, allowNull: false },
      banca: { type: DataTypes.TEXT },
      orgao: { type: DataTypes.TEXT },
      cargo: { type: DataTypes.TEXT },
      ano: { type: DataTypes.INTEGER },
      gabarito_situacao: { type: DataTypes.STRING(20) },
      observacoes: { type: DataTypes.TEXT },
      leitura_status: { type: DataTypes.STRING(20) },
      leitura_erro: { type: DataTypes.TEXT },
      leitura: { type: DataTypes.JSONB },
      classificacao_status: { type: DataTypes.STRING(20) },
      classificacao_erro: { type: DataTypes.TEXT },
      classificacao: { type: DataTypes.JSONB }
    },
    {
      tableName: "prova",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
