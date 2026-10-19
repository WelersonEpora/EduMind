"use strict";

const path = require("node:path");
const dotenv = require("dotenv");

const RAIZ_DO_PROJETO = path.resolve(__dirname, "..", "..", "..");

dotenv.config({ path: path.join(RAIZ_DO_PROJETO, ".env"), quiet: true });

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  appPort: Number(process.env.APP_PORT || 3000),
  // Banco SQLite e arquivos enviados (PDFs dos editais, normas baixadas). Fora do git.
  dataDir: path.resolve(RAIZ_DO_PROJETO, process.env.DATA_DIR || "data"),
  // Fora das variáveis obrigatórias: sem chave, o resto do EduMind (upload, texto por página,
  // revisão) continua funcionando. Só a extração com IA falha, de forma clara, quando chamada.
  // Mesmo padrão de chaves do FinMind e do AgroMind: a gratuita primeiro, a paga como reserva.
  gemini: {
    apiKeyFree: process.env.GEMINI_API_KEY_FREE || "",
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS || 240000)
  }
};
