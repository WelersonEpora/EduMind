"use strict";

const { DataTypes } = require("sequelize");

// Todo acesso do coletor, inclusive a leitura do robots.txt e os acessos não feitos por vedação.
module.exports = (sequelize) =>
  sequelize.define(
    "FetchLog",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      url: { type: DataTypes.TEXT, allowNull: false },
      host: { type: DataTypes.TEXT, allowNull: false },
      acessado_em: { type: DataTypes.DATE, allowNull: false },
      robots_permitido: { type: DataTypes.BOOLEAN },
      http_status: { type: DataTypes.INTEGER },
      sha256: { type: DataTypes.STRING(64) },
      bytes: { type: DataTypes.INTEGER },
      status: { type: DataTypes.STRING(30), allowNull: false },
      erro: { type: DataTypes.TEXT }
    },
    {
      tableName: "fetch_log",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
