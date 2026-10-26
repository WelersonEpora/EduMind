"use strict";

const express = require("express");

// Administração da plataforma (etapa 4b-2): as equipes e os orientadores. Fora de qualquer equipe.
function criarRotasDeAdmin(equipeService) {
  const router = express.Router();

  router.get("/equipes", async (req, res) => {
    res.json({ data: await equipeService.listarEquipes() });
  });

  // { nome, orientador: { nome, email, senha } }. Se o e-mail do orientador já tem conta, nome e senha são ignorados.
  router.post("/equipes", async (req, res) => {
    const { equipe, contaJaExistia } = await equipeService.criarEquipe(req.body || {});
    res.status(201).json({ data: equipe, contaJaExistia });
  });

  return router;
}

module.exports = { criarRotasDeAdmin };
