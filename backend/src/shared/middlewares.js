"use strict";

const multer = require("multer");
const { AppError } = require("./errors");
const logger = require("./logger");

function naoEncontrado(req, res) {
  res.status(404).json({ error: { message: `Rota não encontrada: ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars
function tratarErro(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { message: err.message } });
  }
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: { message: "Arquivo grande demais." } });
  }
  logger.error({ err }, "erro não tratado");
  return res.status(500).json({ error: { message: "Erro interno. Veja o log do backend." } });
}

module.exports = { naoEncontrado, tratarErro };
