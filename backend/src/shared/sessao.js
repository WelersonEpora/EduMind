"use strict";

const jwt = require("jsonwebtoken");

const NOME_DO_COOKIE = "edumind_sessao";

// Sessão (etapa 4a), como no FinMind: um JWT que só diz QUEM é o usuário (`sub`), num cookie httpOnly. Se ele ainda
// pode entrar e em que equipes está vem sempre do banco, a cada requisição: desativar alguém vale na hora.
// SameSite=Lax e a API sem CORS bastam contra CSRF numa API só de JSON.
function criarSessao({ segredo, duracaoMs, cookieSecure }) {
  if (!segredo) throw new Error("JWT_SECRET não definido no .env. Gere um com: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"");
  return {
    emitir: (usuarioId) => jwt.sign({ sub: usuarioId }, segredo, { expiresIn: Math.floor(duracaoMs / 1000) }),
    // O id do usuário, ou null se o token faltar, for inválido ou tiver expirado.
    ler(token) {
      if (!token) return null;
      try {
        return jwt.verify(token, segredo).sub || null;
      } catch {
        return null;
      }
    },
    opcoesDoCookie: { httpOnly: true, secure: cookieSecure, sameSite: "lax", maxAge: duracaoMs }
  };
}

module.exports = { criarSessao, NOME_DO_COOKIE };
