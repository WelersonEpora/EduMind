"use strict";

const env = require("../../src/config/env");
const { conectar } = require("../../src/db");

// Conexão com o banco de teste (edumind_test), já migrado pelo "pretest" do package.json.
// Apaga todos os dados ao abrir, para cada teste começar do zero. Por isso os arquivos de teste
// rodam um de cada vez (--test-concurrency=1).
async function abrirBancoDeTeste(t) {
  const sequelize = conectar(env.bancoDeTeste);
  t.after(() => sequelize.close());
  await sequelize.query("TRUNCATE edital, norma, fetch_log CASCADE");
  return sequelize;
}

module.exports = { abrirBancoDeTeste };
