"use strict";

const pino = require("pino");
const env = require("../config/env");

const emProducao = env.nodeEnv === "production";
// O `node --test` define NODE_TEST_CONTEXT nos processos de teste: log silencioso, sem precisar de
// NODE_ENV=test no script (que não funciona no cmd do Windows sem cross-env).
const emTeste = env.nodeEnv === "test" || Boolean(process.env.NODE_TEST_CONTEXT);

const logger = pino({
  level: emTeste ? "silent" : emProducao ? "info" : "debug",
  // O cookie de sessão (etapa 4a) nunca vai para o log.
  redact: ["req.headers.cookie", 'res.headers["set-cookie"]'],
  transport:
    emProducao || emTeste
      ? undefined
      : { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
});

module.exports = logger;
