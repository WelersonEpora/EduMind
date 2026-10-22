"use strict";

// Um id que não é UUID nunca existe; sem esta checagem, o Postgres recusaria a consulta com erro 500.
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function eUuid(valor) {
  return typeof valor === "string" && FORMATO_UUID.test(valor);
}

module.exports = { eUuid };
