"use strict";

// Erro com status HTTP e mensagem para o usuário. Qualquer outro erro vira 500 com mensagem genérica.
class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { AppError };
