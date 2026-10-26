"use strict";

const express = require("express");
const multer = require("multer");
const { AppError } = require("../shared/errors");
const { exigirOrientador, exigirOrientadorOuProfessor } = require("../shared/acesso");

const TAMANHO_MAXIMO_PDF = 50 * 1024 * 1024;

// multer entrega o nome em latin1; o navegador manda UTF-8.
const nomeDoArquivo = (file) => Buffer.from(file.originalname, "latin1").toString("utf8");

// Biblioteca de provas anteriores (etapa 3a): upload da prova e do gabarito, dados do concurso e os arquivos.
function criarRotasDeProvas(provasService, leituraService, classificacaoService) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_PDF } });

  // Provas são do orientador e do professor (etapa 4c); o aluno vai usá-las no simulador, que ainda não existe.
  router.use(exigirOrientadorOuProfessor);

  // A prova da rota precisa ser da equipe (etapa 4a). Fora dela, 404, como se não existisse.
  router.param("id", (req, res, next, id) => provasService.daEquipe(id, req.equipe.id).then(() => next()));

  router.get("/", async (req, res) => {
    res.json({ data: await provasService.biblioteca(req.equipe.id) });
  });

  // Campos do formulário: banca, orgao, cargo, ano, origem_url, observacoes e, vindo da tela de um edital, edital_id.
  router.post("/", upload.single("arquivo"), async (req, res) => {
    if (!req.file) throw new AppError(400, "Envie o PDF da prova no campo 'arquivo'.");
    const { edital_id: editalId, ...campos } = req.body || {};
    const { prova, jaExistia } = await provasService.enviarProva({
      buffer: req.file.buffer,
      nomeArquivo: nomeDoArquivo(req.file),
      campos,
      editalId: editalId || null,
      equipeId: req.equipe.id
    });
    res.status(jaExistia ? 200 : 201).json({ data: prova, jaExistia });
  });

  // Campos: gabarito_situacao (obrigatório) e origem_url.
  router.post("/:id/gabarito", upload.single("arquivo"), async (req, res) => {
    if (!req.file) throw new AppError(400, "Envie o PDF do gabarito no campo 'arquivo'.");
    res.json({ data: await provasService.enviarGabarito(req.params.id, { buffer: req.file.buffer, nomeArquivo: nomeDoArquivo(req.file), campos: req.body || {} }) });
  });

  router.patch("/:id", async (req, res) => {
    res.json({ data: await provasService.atualizar(req.params.id, req.body || {}) });
  });

  // Excluir apaga a prova, as questões e a classificação: só o orientador.
  router.delete("/:id", exigirOrientador, async (req, res) => {
    res.json({ data: await provasService.excluir(req.params.id) });
  });

  // Leitura das questões (etapa 3b): em segundo plano; a tela acompanha pelo leitura_status da prova.
  router.post("/:id/leitura", async (req, res) => {
    await leituraService.iniciar(req.params.id, { confirmarPerdaDaRevisao: Boolean(req.body?.confirmarPerdaDaRevisao) });
    res.status(202).json({ data: { leitura_status: "lendo" } });
  });

  router.get("/:id/questoes", async (req, res) => {
    res.json({ data: await leituraService.questoes(req.params.id) });
  });

  router.patch("/:id/questoes/:questaoId", async (req, res) => {
    res.json({ data: await leituraService.revisarQuestao(req.params.id, req.params.questaoId, req.body || {}) });
  });

  // Gabarito com várias versões: o orientador escolhe a do caderno ({ versao: índice }).
  router.put("/:id/gabarito/versao", async (req, res) => {
    res.json({ data: await leituraService.escolherVersaoDoGabarito(req.params.id, req.body || {}) });
  });

  // O orientador confere o gabarito inteiro: { respostas: [{ numero, resposta }] }.
  router.put("/:id/gabarito/conferencia", async (req, res) => {
    res.json({ data: await leituraService.conferirGabarito(req.params.id, req.body || {}) });
  });

  // Classificação das questões por norma e artigo (etapa 3c): em segundo plano, como a leitura.
  router.post("/:id/classificacao", async (req, res) => {
    await classificacaoService.iniciar(req.params.id);
    res.status(202).json({ data: { classificacao_status: "classificando" } });
  });

  // { referencias: [{ norma_id, artigo, papel }] } e/ou { classificacao_status }.
  router.patch("/:id/questoes/:questaoId/classificacao", async (req, res) => {
    res.json({ data: await classificacaoService.revisar(req.params.id, req.params.questaoId, req.body || {}) });
  });

  router.get("/:id/arquivos/:tipo", async (req, res) => {
    res.type("application/pdf").sendFile(await provasService.arquivo(req.params.id, req.params.tipo));
  });

  return router;
}

module.exports = { criarRotasDeProvas };
