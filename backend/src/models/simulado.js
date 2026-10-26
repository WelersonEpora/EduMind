"use strict";

const { DataTypes } = require("sequelize");

// Uma prova completa cronometrada feita no simulador (etapa 5b): a tentativa de um usuário, guardada no servidor.
module.exports = (sequelize) =>
  sequelize.define(
    "Simulado",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      usuario_id: { type: DataTypes.UUID, allowNull: false },
      edital_id: { type: DataTypes.UUID, allowNull: false },
      prova_id: { type: DataTypes.UUID, allowNull: false },
      questoes: { type: DataTypes.JSONB, allowNull: false },
      respostas: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      marcadas: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      duracao_minutos: { type: DataTypes.INTEGER, allowNull: false },
      duracao_estimada: { type: DataTypes.BOOLEAN, allowNull: false },
      termina_em: { type: DataTypes.DATE, allowNull: false },
      entregue_em: { type: DataTypes.DATE },
      acertos: { type: DataTypes.INTEGER }
    },
    { tableName: "simulado", timestamps: true, updatedAt: false, underscored: true, createdAt: "created_at" }
  );
