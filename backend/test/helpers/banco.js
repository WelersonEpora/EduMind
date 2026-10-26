"use strict";

const { randomUUID } = require("node:crypto");
const env = require("../../src/config/env");
const { conectar } = require("../../src/db");

// Conexão com o banco de teste (edumind_test), já migrado pelo "pretest" do package.json.
// Apaga todos os dados ao abrir, para cada teste começar do zero. Por isso os arquivos de teste
// rodam um de cada vez (--test-concurrency=1).
async function abrirBancoDeTeste(t) {
  const sequelize = conectar(env.bancoDeTeste);
  t.after(() => sequelize.close());
  await sequelize.query("TRUNCATE edital, norma, prova, fetch_log, usuario, equipe CASCADE");
  return sequelize;
}

// Editais e provas são de uma equipe (etapa 4a): os testes de serviço criam uma e passam o id.
async function criarEquipe(sequelize, nome = "Equipe de teste") {
  const id = randomUUID();
  await sequelize.models.Equipe.create({ id, nome });
  return id;
}

module.exports = { abrirBancoDeTeste, criarEquipe };
