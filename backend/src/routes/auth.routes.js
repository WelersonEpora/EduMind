"use strict";

const express = require("express");
const { NOME_DO_COOKIE } = require("../shared/sessao");
const { criarLimitador } = require("../shared/limitador");
const { exigirLogin } = require("../shared/acesso");

// Entrar, sair e quem sou eu (etapa 4a). /me devolve as equipes do usuário, para a tela escolher em qual trabalhar.
function criarRotasDeAuth({ authService, sessao }) {
  const router = express.Router();
  const limitarLogin = criarLimitador({ janelaMs: 60_000, maximo: 10, mensagem: "Muitas tentativas de login. Aguarde um minuto." });

  router.post("/login", limitarLogin, async (req, res) => {
    const usuario = await authService.entrar(req.body?.email, req.body?.senha);
    res.cookie(NOME_DO_COOKIE, sessao.emitir(usuario.id), sessao.opcoesDoCookie);
    res.json({ data: usuario });
  });

  router.post("/logout", (req, res) => {
    const { maxAge, ...opcoes } = sessao.opcoesDoCookie;
    res.clearCookie(NOME_DO_COOKIE, opcoes);
    res.status(204).end();
  });

  router.get("/me", exigirLogin({ sessao, authService }), async (req, res) => {
    res.json({ data: await authService.perfil(req.usuario.id) });
  });

  // { atual, nova }. Limitado como o login: a senha atual não pode virar um meio de testar senhas.
  router.put("/senha", limitarLogin, exigirLogin({ sessao, authService }), async (req, res) => {
    await authService.trocarSenha(req.usuario.id, req.body || {});
    res.status(204).end();
  });

  return router;
}

module.exports = { criarRotasDeAuth };
