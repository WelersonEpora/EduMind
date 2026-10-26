"use strict";

const path = require("node:path");
const express = require("express");
const cookieParser = require("cookie-parser");
const pinoHttp = require("pino-http");
const env = require("./config/env");
const logger = require("./shared/logger");
const { criarSessao } = require("./shared/sessao");
const { exigirLogin, exigirEquipe } = require("./shared/acesso");
const { criarAuthService } = require("./services/auth.service");
const { criarRotasDeAuth } = require("./routes/auth.routes");
const { naoEncontrado, tratarErro } = require("./shared/middlewares");
const { criarEditalService } = require("./services/edital.service");
const { criarExtracaoService } = require("./services/extracao.service");
const { criarRevisaoService } = require("./services/revisao.service");
const { criarFontesService } = require("./services/fontes.service");
const { criarCoberturaService } = require("./services/cobertura.service");
const { criarProvasService } = require("./services/provas.service");
const { criarLeituraService } = require("./services/leitura.service");
const { criarClassificacaoService } = require("./services/classificacao.service");
const { criarRotasDeNormas } = require("./routes/normas.routes");
const { criarRotasDeProvas } = require("./routes/provas.routes");
const { criarRotasDeEditais } = require("./routes/editais.routes");

// Recebe a conexão, a pasta de dados, a sessão e o serviço de extração de fora, para os testes montarem o app com o
// banco de teste, um segredo de teste e sem chamar o Gemini.
function criarApp({
  sequelize,
  dataDir,
  sessao = criarSessao(env.sessao),
  extracaoService = criarExtracaoService({ sequelize }),
  fontesService = criarFontesService({ sequelize, dirNormas: path.join(dataDir, "normas") }),
  leituraService = criarLeituraService({ sequelize, dirProvas: path.join(dataDir, "provas") }),
  classificacaoService = criarClassificacaoService({ sequelize })
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));
  app.use(express.json());
  app.use(cookieParser());

  const editalService = criarEditalService({ sequelize, dirUploads: path.join(dataDir, "uploads", "editais") });
  const provasService = criarProvasService({ sequelize, dirProvas: path.join(dataDir, "provas") });

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  // Login (etapa 4a): fora de /auth, toda a API exige sessão e trabalha dentro de uma equipe (req.equipe).
  const authService = criarAuthService({ sequelize });
  app.use("/api/v1/auth", criarRotasDeAuth({ authService, sessao }));
  app.use("/api/v1", exigirLogin({ sessao, authService }), exigirEquipe({ authService }));

  app.use(
    "/api/v1/editais",
    criarRotasDeEditais(editalService, extracaoService, criarRevisaoService({ sequelize }), fontesService, criarCoberturaService({ sequelize }), provasService)
  );

  app.use("/api/v1/normas", criarRotasDeNormas(fontesService));
  app.use("/api/v1/provas", criarRotasDeProvas(provasService, leituraService, classificacaoService));

  app.use(naoEncontrado);
  app.use(tratarErro);
  return app;
}

module.exports = { criarApp };
