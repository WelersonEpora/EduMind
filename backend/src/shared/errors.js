"use strict";

// Erro com status HTTP e mensagem para o usuário. Qualquer outro erro vira 500 com mensagem genérica.
// `dados` (opcional) vai junto na resposta, para a tela agir sem ler a mensagem (ex.: { codigo, revisados }).
class AppError extends Error {
  constructor(status, message, dados = null) {
    super(message);
    this.status = status;
    this.dados = dados;
  }
}

module.exports = { AppError };
