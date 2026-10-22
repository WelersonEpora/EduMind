"use strict";

const env = require("./config/env");
const logger = require("./shared/logger");
const { conectar } = require("./db");
const { criarApp } = require("./app");
const { criarExtracaoService } = require("./services/extracao.service");

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
  const extracaoService = criarExtracaoService({ sequelize });
  const interrompidas = await extracaoService.marcarInterrompidas();
  if (interrompidas > 0) logger.warn(`${interrompidas} extração(ões) interrompida(s) pelo reinício marcada(s) como erro.`);
  const app = criarApp({ sequelize, dataDir: env.dataDir, extracaoService });
  app.listen(env.appPort, () => {
    logger.info(`EduMind backend na porta ${env.appPort} (banco ${env.banco.database}, arquivos em ${env.dataDir})`);
  });
}

iniciar();
