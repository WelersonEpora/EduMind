"use strict";

const bcrypt = require("bcryptjs");
const { AppError } = require("./errors");

const RODADAS = 12;
const TAMANHO_MINIMO = 8;

const gerarHash = (senha) => bcrypt.hash(senha, RODADAS);
const conferir = (senha, hash) => bcrypt.compare(senha, hash);

// Senha nova (cadastro ou troca): pelo menos TAMANHO_MINIMO caracteres.
function validar(senha) {
  if (typeof senha !== "string" || senha.length < TAMANHO_MINIMO) {
    throw new AppError(400, `A senha precisa de pelo menos ${TAMANHO_MINIMO} caracteres.`);
  }
  return senha;
}

module.exports = { gerarHash, conferir, validar, TAMANHO_MINIMO };
