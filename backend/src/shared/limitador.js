"use strict";

const { AppError } = require("./errors");

// Limite de requisições em memória, por IP, em janela fixa. Basta para uma instância só; usado no login, contra
// tentativa de senha por força bruta. Mesmo desenho do FinMind.
function criarLimitador({ janelaMs, maximo, mensagem }) {
  const registros = new Map();
  return function limitar(req, res, next) {
    const agora = Date.now();
    const registro = registros.get(req.ip);
    if (!registro || agora - registro.inicio >= janelaMs) {
      registros.set(req.ip, { contagem: 1, inicio: agora });
      return next();
    }
    if (registro.contagem >= maximo) return next(new AppError(429, mensagem));
    registro.contagem += 1;
    return next();
  };
}

module.exports = { criarLimitador };
