"use strict";

const express = require("express");
const multer = require("multer");
const { AppError } = require("../shared/errors");

const TAMANHO_MAXIMO_PDF = 50 * 1024 * 1024;

function criarRotasDeEditais(editalService, extracaoService) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_PDF } });

  router.get("/", async (req, res) => {
    res.json({ data: await editalService.listar() });
  });

  router.post("/", upload.single("arquivo"), async (req, res) => {
    if (!req.file) throw new AppError(400, "Envie o PDF no campo 'arquivo'.");
    // multer entrega o nome em latin1; o navegador manda UTF-8.
    const nomeArquivo = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const { edital, jaExistia } = await editalService.criarAPartirDoPdf({ buffer: req.file.buffer, nomeArquivo });
    res.status(jaExistia ? 200 : 201).json({ data: edital, jaExistia });
  });

  router.get("/:id", async (req, res) => {
    res.json({ data: await editalService.buscar(req.params.id) });
  });

  // Dispara a extração dos metadados com a IA e responde na hora (202); a tela acompanha pelo status do edital.
  router.post("/:id/extracao", async (req, res) => {
    await extracaoService.iniciar(req.params.id);
    res.status(202).json({ data: await editalService.buscar(req.params.id) });
  });

  router.get("/:id/paginas/:numero", async (req, res) => {
    res.json({ data: await editalService.pagina(req.params.id, Number(req.params.numero)) });
  });

  router.get("/:id/arquivo", async (req, res) => {
    res.type("application/pdf").sendFile(await editalService.caminhoDoArquivo(req.params.id));
  });

  return router;
}

module.exports = { criarRotasDeEditais };
