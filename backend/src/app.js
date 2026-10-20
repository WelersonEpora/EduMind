"use strict";

const path = require("node:path");
const express = require("express");
const pinoHttp = require("pino-http");
const logger = require("./shared/logger");
const { naoEncontrado, tratarErro } = require("./shared/middlewares");
const { criarEditalService } = require("./services/edital.service");
const { criarRotasDeEditais } = require("./routes/editais.routes");

// Recebe a conexão e a pasta de dados de fora, para os testes montarem o app com o banco de teste.
function criarApp({ sequelize, dataDir }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));
  app.use(express.json());

  const editalService = criarEditalService({ sequelize, dirUploads: path.join(dataDir, "uploads", "editais") });

  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.use("/api/v1/editais", criarRotasDeEditais(editalService));

  app.use(naoEncontrado);
  app.use(tratarErro);
  return app;
}

module.exports = { criarApp };
