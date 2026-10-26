"use strict";

const express = require("express");
const { exigirOrientador } = require("../shared/acesso");

// A equipe da requisição e os membros dela (etapa 4b-2). Ver a equipe: qualquer membro. Mudar: só o orientador.
function criarRotasDaEquipe(equipeService) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    res.json({ data: await equipeService.equipe(req.equipe.id) });
  });

  router.patch("/", exigirOrientador, async (req, res) => {
    res.json({ data: await equipeService.renomear(req.equipe.id, req.body || {}) });
  });

  // { nome, email, senha, papel }. Se o e-mail já tem conta, nome e senha são ignorados.
  router.post("/membros", exigirOrientador, async (req, res) => {
    const { membro, contaJaExistia } = await equipeService.incluirMembro(req.equipe.id, req.body || {});
    res.status(201).json({ data: membro, contaJaExistia });
  });

  // { papel } e/ou { ativo }.
  router.patch("/membros/:membroId", exigirOrientador, async (req, res) => {
    res.json({ data: await equipeService.alterarMembro(req.equipe.id, req.params.membroId, req.body || {}) });
  });

  return router;
}

module.exports = { criarRotasDaEquipe };
