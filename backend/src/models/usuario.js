"use strict";

const { DataTypes } = require("sequelize");

// Quem entra no sistema (etapa 4a). admin = administrador da plataforma. O e-mail é gravado em minúsculas.
module.exports = (sequelize) =>
  sequelize.define(
    "Usuario",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      nome: { type: DataTypes.TEXT, allowNull: false },
      email: { type: DataTypes.TEXT, allowNull: false },
      senha_hash: { type: DataTypes.STRING(100), allowNull: false },
      admin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    },
    {
      tableName: "usuario",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
