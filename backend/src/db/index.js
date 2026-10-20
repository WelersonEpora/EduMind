"use strict";

const { Sequelize } = require("sequelize");
const definirModelos = require("../models");

// Conexão com o PostgreSQL. O schema vem das migrations em database/migrations (npm run db:migrate),
// nunca do sequelize.sync().
function conectar(config) {
  const sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect: "postgres",
    logging: false
  });
  definirModelos(sequelize);
  return sequelize;
}

module.exports = { conectar };
