"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// SQLite embutido no Node (node:sqlite): sem dependência nativa para compilar.
//
// As migrations em ./migrations são a fonte da verdade do schema. Cada arquivo começa com um
// número de 3 dígitos ("001-inicial.sql"); o banco guarda o último aplicado em PRAGMA user_version.
// Nunca editar uma migration já aplicada: alteração nova é um arquivo novo.
const PASTA_MIGRATIONS = path.join(__dirname, "migrations");

function aplicarMigrations(db) {
  const versaoAtual = db.prepare("PRAGMA user_version").get().user_version;
  const arquivos = fs
    .readdirSync(PASTA_MIGRATIONS)
    .filter((nome) => nome.endsWith(".sql"))
    .sort();
  for (const nome of arquivos) {
    const versao = Number(nome.slice(0, 3));
    if (versao <= versaoAtual) continue;
    const sql = fs.readFileSync(path.join(PASTA_MIGRATIONS, nome), "utf8");
    emTransacao(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${versao}`);
    });
  }
}

function emTransacao(db, fn) {
  db.exec("BEGIN");
  try {
    const resultado = fn();
    db.exec("COMMIT");
    return resultado;
  } catch (erro) {
    db.exec("ROLLBACK");
    throw erro;
  }
}

// `arquivo` pode ser ":memory:" (testes).
function abrirBanco(arquivo) {
  if (arquivo !== ":memory:") fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec("PRAGMA foreign_keys = ON");
  if (arquivo !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  aplicarMigrations(db);
  return db;
}

module.exports = { abrirBanco, emTransacao };
