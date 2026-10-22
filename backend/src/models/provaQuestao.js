"use strict";

const { DataTypes } = require("sequelize");

// Uma questão lida da prova (etapa 3b), com o gabarito e os problemas da conferência.
module.exports = (sequelize) =>
  sequelize.define(
    "ProvaQuestao",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      prova_id: { type: DataTypes.UUID, allowNull: false },
      numero: { type: DataTypes.INTEGER, allowNull: false },
      disciplina: { type: DataTypes.TEXT },
      pagina: { type: DataTypes.INTEGER },
      texto_apoio: { type: DataTypes.TEXT },
      enunciado: { type: DataTypes.TEXT, allowNull: false },
      alternativas: { type: DataTypes.JSONB, allowNull: false },
      gabarito: { type: DataTypes.STRING(1) },
      anulada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      depende_de_imagem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      problemas: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      status: { type: DataTypes.STRING(20), allowNull: false },
      editada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      revisada_em: { type: DataTypes.DATE },
      classificacao_status: { type: DataTypes.STRING(20) },
      classificacao_problemas: { type: DataTypes.JSONB },
      norma_citada: { type: DataTypes.TEXT },
      classificacao_revisada_em: { type: DataTypes.DATE }
    },
    {
      tableName: "prova_questao",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
