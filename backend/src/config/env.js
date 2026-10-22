"use strict";

const path = require("node:path");
const dotenv = require("dotenv");

const RAIZ_DO_PROJETO = path.resolve(__dirname, "..", "..", "..");

dotenv.config({ path: path.join(RAIZ_DO_PROJETO, ".env"), quiet: true });

// Conexão com o PostgreSQL. Usada pelo servidor e pelo sequelize-cli (sequelize.config.js).
const banco = {
  dialect: "postgres",
  host: process.env.POSTGRES_HOST || "localhost",
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DATABASE || "edumind",
  username: process.env.POSTGRES_USER || "edumind",
  password: process.env.POSTGRES_PASSWORD || ""
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  appPort: Number(process.env.APP_PORT || 3000),
  // Arquivos enviados (PDFs dos editais, normas baixadas). Fora do git.
  dataDir: path.resolve(RAIZ_DO_PROJETO, process.env.DATA_DIR || "data"),
  banco,
  // Os testes apagam os dados a cada caso: nunca apontar para o banco de desenvolvimento.
  bancoDeTeste: { ...banco, database: process.env.POSTGRES_DATABASE_TEST || "edumind_test" },
  // Fora das variáveis obrigatórias: sem chave, o resto do EduMind (upload, texto por página,
  // revisão) continua funcionando. Só a extração com IA falha, de forma clara, quando chamada.
  // Mesmo padrão de chaves do FinMind e do AgroMind: a gratuita primeiro, a paga como reserva.
  gemini: {
    apiKeyFree: process.env.GEMINI_API_KEY_FREE || "",
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS || 420000)
  }
};
