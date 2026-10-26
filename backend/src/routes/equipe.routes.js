"use strict";

const express = require("express");
const { exigirOrientador, exigirOrientadorOuProfessor } = require("../shared/acesso");

// A equipe da requisição e os membros dela (etapa 4b-2). Ver a equipe: orientador e professor (o aluno não vê os nomes
// e e-mails dos outros, etapa 4c). Mudar: só o orientador.
function criarRotasDaEquipe(equipeService) {
  const router = express.Router();

  router.get("/", exigirOrientadorOuProfessor, async (req, res) => {
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

  // { papel, ativo } e, se a conta é só desta equipe, { nome, email, senha }.
  router.patch("/membros/:membroId", exigirOrientador, async (req, res) => {
    res.json({ data: await equipeService.alterarMembro(req.equipe.id, req.params.membroId, req.body || {}, { quemAltera: req.usuario.id }) });
  });

  // { editais: [ids] }: os editais da equipe que o aluno vê (etapa 4c). Substitui a lista anterior.
  router.put("/membros/:membroId/editais", exigirOrientador, async (req, res) => {
    res.json({ data: await equipeService.atribuirEditais(req.equipe.id, req.params.membroId, req.body || {}) });
  });

  return router;
}

module.exports = { criarRotasDaEquipe };
