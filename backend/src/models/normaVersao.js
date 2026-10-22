"use strict";

const { DataTypes } = require("sequelize");

// Uma versão do texto de uma norma: cada coleta ou upload com conteúdo diferente (sha256) é uma versão nova.
module.exports = (sequelize) =>
  sequelize.define(
    "NormaVersao",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      norma_id: { type: DataTypes.UUID, allowNull: false },
      url: { type: DataTypes.TEXT },
      origem: { type: DataTypes.STRING(20), allowNull: false },
      status: { type: DataTypes.STRING(30), allowNull: false },
      data_versao: { type: DataTypes.DATEONLY },
      data_versao_precisao: { type: DataTypes.STRING(10) },
      acessado_em: { type: DataTypes.DATE },
      sha256: { type: DataTypes.STRING(64) },
      arquivo_caminho: { type: DataTypes.TEXT },
      artigos_total: { type: DataTypes.INTEGER },
      avisos: { type: DataTypes.JSONB },
      processada_em: { type: DataTypes.DATE }
    },
    {
      tableName: "norma_versao",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
