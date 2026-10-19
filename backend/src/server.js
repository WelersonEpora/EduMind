"use strict";

const path = require("node:path");
const env = require("./config/env");
const logger = require("./shared/logger");
const { abrirBanco } = require("./db");
const { criarApp } = require("./app");

const db = abrirBanco(path.join(env.dataDir, "edumind.db"));
const app = criarApp({ db, dataDir: env.dataDir });

app.listen(env.appPort, () => {
  logger.info(`EduMind backend na porta ${env.appPort} (dados em ${env.dataDir})`);
});
