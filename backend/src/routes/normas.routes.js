"use strict";

const express = require("express");
const multer = require("multer");
const { AppError } = require("../shared/errors");
const { exigirOrientadorOuProfessor } = require("../shared/acesso");

const TAMANHO_MAXIMO_ARQUIVO = 30 * 1024 * 1024;

// Biblioteca de normas (etapa 2a-1): URL oficial e upload manual das versões. É de todos, não da equipe (etapa 4a):
// só a lista de editais que citam cada norma vem filtrada pela equipe. Ler: qualquer membro; incluir e mudar:
// orientador ou professor (etapa 4c).
function criarRotasDeNormas(fontesService) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_ARQUIVO } });

  router.get("/", async (req, res) => {
    res.json({ data: await fontesService.biblioteca(req.equipe.id) });
  });

  // Inclusão direta na biblioteca (sem edital), por orientador ou professor. Com a chave já na biblioteca, devolve a
  // existente (200 e jaExistia).
  router.post("/", exigirOrientadorOuProfessor, async (req, res) => {
    const { norma, jaExistia } = await fontesService.incluir(req.body);
    res.status(jaExistia ? 200 : 201).json({ data: norma, jaExistia });
  });

  router.get("/:id", async (req, res) => {
    res.json({ data: await fontesService.detalharNorma(req.params.id, req.equipe.id) });
  });

  router.get("/:id/versoes/:versaoId/artigos", async (req, res) => {
    res.json({ data: await fontesService.artigosDaVersao(req.params.id, req.params.versaoId) });
  });

  // A busca na web da IA, só para achar a URL oficial. Pode levar dezenas de segundos.
  router.post("/:id/buscar-url", exigirOrientadorOuProfessor, async (req, res) => {
    res.json({ data: await fontesService.buscarUrl(req.params.id) });
  });

  router.patch("/:id", exigirOrientadorOuProfessor, async (req, res) => {
    res.json({ data: await fontesService.definirUrl(req.params.id, req.body || {}) });
  });

  router.post("/:id/versoes", exigirOrientadorOuProfessor, upload.single("arquivo"), async (req, res) => {
    if (!req.file) throw new AppError(400, "Envie o arquivo no campo 'arquivo'.");
    // multer entrega o nome em latin1; o navegador manda UTF-8.
    const nomeArquivo = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const { norma, jaExistia } = await fontesService.enviarVersao(req.params.id, { buffer: req.file.buffer, nomeArquivo });
    res.status(jaExistia ? 200 : 201).json({ data: norma, jaExistia });
  });

  // Divide de novo a versão em artigos.
  router.post("/:id/versoes/:versaoId/processar", exigirOrientadorOuProfessor, async (req, res) => {
    res.json({ data: await fontesService.processarVersao(req.params.id, req.params.versaoId) });
  });

  router.get("/:id/versoes/:versaoId/arquivo", async (req, res) => {
    const { caminho, tipo } = await fontesService.arquivoDaVersao(req.params.id, req.params.versaoId);
    res.type(tipo).sendFile(caminho);
  });

  return router;
}

module.exports = { criarRotasDeNormas };
