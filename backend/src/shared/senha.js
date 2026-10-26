"use strict";

const bcrypt = require("bcryptjs");

const RODADAS = 12;
const TAMANHO_MINIMO = 8;

const gerarHash = (senha) => bcrypt.hash(senha, RODADAS);
const conferir = (senha, hash) => bcrypt.compare(senha, hash);

module.exports = { gerarHash, conferir, TAMANHO_MINIMO };
