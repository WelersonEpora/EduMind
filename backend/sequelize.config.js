"use strict";

// Configuração do sequelize-cli (npm run db:migrate). As migrations em database/migrations são a fonte da
// verdade do schema; nunca editar uma migration já aplicada: alteração nova é um arquivo novo.
const env = require("./src/config/env");

const comum = { migrationStorageTableName: "sequelize_meta", logging: false };

module.exports = {
  development: { ...env.banco, ...comum },
  test: { ...env.bancoDeTeste, ...comum },
  production: { ...env.banco, ...comum }
};
