"use strict";

const env = require("./config/env");
const logger = require("./shared/logger");
const { conectar } = require("./db");
const { criarApp } = require("./app");

async function iniciar() {
  const sequelize = conectar(env.banco);
  try {
    await sequelize.authenticate();
  } catch (erro) {
    logger.fatal(
      `Não conectou no PostgreSQL ${env.banco.host}:${env.banco.port}/${env.banco.database}: ${erro.message}. ` +
        "Confira se o Postgres de C:\\Source\\infra está no ar e o .env."
    );
    process.exit(1);
  }
  const app = criarApp({ sequelize, dataDir: env.dataDir });
  app.listen(env.appPort, () => {
    logger.info(`EduMind backend na porta ${env.appPort} (banco ${env.banco.database}, arquivos em ${env.dataDir})`);
  });
}

iniciar();
