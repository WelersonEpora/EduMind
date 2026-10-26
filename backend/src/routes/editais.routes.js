"use strict";

const express = require("express");
const multer = require("multer");
const { AppError } = require("../shared/errors");

const TAMANHO_MAXIMO_PDF = 50 * 1024 * 1024;

function criarRotasDeEditais(editalService, extracaoService, revisaoService, fontesService, coberturaService, provasService) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_PDF } });

  // O edital e a prova da rota precisam ser da equipe (etapa 4a). Fora dela, 404, como se não existissem.
  router.param("id", (req, res, next, id) => editalService.daEquipe(id, req.equipe.id).then(() => next()));
  router.param("provaId", (req, res, next, id) => provasService.daEquipe(id, req.equipe.id).then(() => next()));

  router.get("/", async (req, res) => {
    res.json({ data: await editalService.listar(req.equipe.id) });
  });

  router.post("/", upload.single("arquivo"), async (req, res) => {
    if (!req.file) throw new AppError(400, "Envie o PDF no campo 'arquivo'.");
    // multer entrega o nome em latin1; o navegador manda UTF-8.
    const nomeArquivo = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const { edital, jaExistia } = await editalService.criarAPartirDoPdf({ buffer: req.file.buffer, nomeArquivo, equipeId: req.equipe.id });
    res.status(jaExistia ? 200 : 201).json({ data: edital, jaExistia });
  });

  router.get("/:id", async (req, res) => {
    res.json({ data: await editalService.buscar(req.params.id) });
  });

  // Dispara a extração dos metadados com a IA e responde na hora (202); a tela acompanha pelo status do edital.
  router.post("/:id/extracao", async (req, res) => {
    await extracaoService.iniciar(req.params.id, { confirmarPerdaDaRevisao: req.body?.confirmarPerdaDaRevisao === true });
    res.status(202).json({ data: await editalService.buscar(req.params.id) });
  });

  // Revisão (etapa 1c). Cada rota devolve o que mudou: os metadados inteiros ou o item com as normas.
  router.patch("/:id/metadados", async (req, res) => {
    res.json({ data: await revisaoService.revisarMetadado(req.params.id, req.body || {}) });
  });

  router.patch("/:id/itens/:itemId", async (req, res) => {
    res.json({ data: await revisaoService.revisarItem(req.params.id, req.params.itemId, req.body || {}) });
  });

  router.patch("/:id/normas/:normaId", async (req, res) => {
    res.json({ data: await revisaoService.revisarNorma(req.params.id, req.params.normaId, req.body || {}) });
  });

  router.post("/:id/itens/:itemId/aprovar-verificados", async (req, res) => {
    res.json({ data: await revisaoService.aprovarVerificados(req.params.id, req.params.itemId) });
  });

  // Fontes (etapa 2a-1): as normas citadas nos itens aprovados e a confirmação da identidade de cada uma.
  router.get("/:id/fontes", async (req, res) => {
    res.json({ data: await fontesService.listar(req.params.id) });
  });

  router.post("/:id/fontes/confirmar", async (req, res) => {
    res.json({ data: await fontesService.confirmar(req.params.id, req.body || {}) });
  });

  router.post("/:id/fontes/desligar", async (req, res) => {
    res.json({ data: await fontesService.desligar(req.params.id, req.body || {}) });
  });

  // Cobertura (etapa 2c): cada artigo pedido cruzado com o texto da norma.
  router.get("/:id/cobertura", async (req, res) => {
    res.json({ data: await coberturaService.cobertura(req.params.id) });
  });

  // O orientador confere (ou desfaz) a lista de artigos de uma citação por estrutura (etapa 2c-2): { conferida }.
  router.put("/:id/cobertura/citacoes/:citacaoId/estrutura", async (req, res) => {
    res.json({ data: await coberturaService.conferirEstrutura(req.params.id, req.params.citacaoId, req.body || {}) });
  });

  // Provas anteriores do edital (etapa 3a): buscas sugeridas, provas escolhidas e as demais da biblioteca.
  router.get("/:id/provas", async (req, res) => {
    res.json({ data: await provasService.doEdital(req.params.id) });
  });

  router.put("/:id/provas/:provaId", async (req, res) => {
    res.json({ data: await provasService.escolher(req.params.id, req.params.provaId) });
  });

  router.delete("/:id/provas/:provaId", async (req, res) => {
    res.json({ data: await provasService.desfazerEscolha(req.params.id, req.params.provaId) });
  });

  router.get("/:id/conteudo", async (req, res) => {
    res.json({ data: await editalService.conteudo(req.params.id) });
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
