"use strict";

const express = require("express");
const multer = require("multer");
const { AppError } = require("../shared/errors");
const { exigirOrientador } = require("../shared/acesso");

const TAMANHO_MAXIMO_PDF = 50 * 1024 * 1024;

// O que o aluno pode nos editais (etapa 4c): ler a lista, o edital, o conteúdo programático, as páginas, o PDF e a
// cobertura, e usar o simulador (etapas 5a e 5b), só nos editais atribuídos a ele. O resto (revisão, fontes, provas e
// qualquer alteração) é do orientador e do professor.
// GET "/" (a lista), "/:id", "/:id/conteudo", "/:id/cobertura", "/:id/arquivo" e "/:id/paginas/:numero"; tudo em
// "/:id/simulador" (o que se grava ali é do próprio usuário).
function eLeituraDoAluno(req) {
  const partes = req.path.split("/").filter(Boolean);
  if (partes[1] === "simulador") return true;
  if (req.method !== "GET") return false;
  if (partes.length <= 1) return true;
  if (partes.length === 2) return ["conteudo", "cobertura", "arquivo"].includes(partes[1]);
  return partes.length === 3 && partes[1] === "paginas";
}
function leituraDoAluno(req, res, next) {
  if (req.equipe.papel === "aluno" && !eLeituraDoAluno(req)) {
    throw new AppError(403, "Só o orientador ou o professor da equipe pode fazer isso.");
  }
  next();
}
const alunoDa = (req) => (req.equipe.papel === "aluno" ? req.usuario.id : undefined);

function criarRotasDeEditais(editalService, extracaoService, revisaoService, fontesService, coberturaService, provasService, simuladorService, desempenhoService) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_PDF } });

  router.use(leituraDoAluno);

  // O edital e a prova da rota precisam ser da equipe (etapa 4a) e, para o aluno, atribuídos a ele (etapa 4c). Fora
  // disso, 404, como se não existissem.
  router.param("id", (req, res, next, id) => editalService.daEquipe(id, req.equipe.id, { alunoId: alunoDa(req) }).then(() => next()));
  router.param("provaId", (req, res, next, id) => provasService.daEquipe(id, req.equipe.id).then(() => next()));

  router.get("/", async (req, res) => {
    res.json({ data: await editalService.listar(req.equipe.id, { alunoId: alunoDa(req) }) });
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
  // Extrair de novo por cima de uma revisão apaga a revisão: só o orientador confirma.
  router.post("/:id/extracao", async (req, res) => {
    const confirmarPerdaDaRevisao = req.body?.confirmarPerdaDaRevisao === true;
    if (confirmarPerdaDaRevisao) exigirOrientador(req, res, () => {});
    await extracaoService.iniciar(req.params.id, { confirmarPerdaDaRevisao });
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

  // Simulador, treino por disciplina (etapa 5a): o resumo para a tela de início, as questões de um treino (sem o
  // gabarito) e a correção de uma resposta.
  router.get("/:id/simulador", async (req, res) => {
    res.json({ data: await simuladorService.resumo(req.params.id, req.usuario.id) });
  });

  router.post("/:id/simulador/treino", async (req, res) => {
    res.json({ data: await simuladorService.treino(req.params.id, req.body || {}) });
  });

  router.post("/:id/simulador/respostas", async (req, res) => {
    res.status(201).json({ data: await simuladorService.responder(req.params.id, req.usuario.id, req.body || {}) });
  });

  // Prova completa cronometrada (etapa 5b): cada usuário só vê e altera as suas. { prova_id } para começar;
  // { resposta?, marcada? } para guardar uma questão sem corrigir; a entrega corrige tudo.
  router.post("/:id/simulador/provas", async (req, res) => {
    res.status(201).json({ data: await simuladorService.iniciarProva(req.params.id, req.usuario.id, req.body || {}) });
  });

  router.get("/:id/simulador/provas/:simuladoId", async (req, res) => {
    res.json({ data: await simuladorService.prova(req.params.id, req.usuario.id, req.params.simuladoId) });
  });

  router.put("/:id/simulador/provas/:simuladoId/questoes/:questaoId", async (req, res) => {
    res.json({ data: await simuladorService.marcar(req.params.id, req.usuario.id, req.params.simuladoId, req.params.questaoId, req.body || {}) });
  });

  router.post("/:id/simulador/provas/:simuladoId/entrega", async (req, res) => {
    res.json({ data: await simuladorService.entregar(req.params.id, req.usuario.id, req.params.simuladoId) });
  });

  router.delete("/:id/simulador/provas/:simuladoId", async (req, res) => {
    res.json({ data: await simuladorService.desistir(req.params.id, req.usuario.id, req.params.simuladoId) });
  });

  // Desempenho (etapa 5c): o do próprio usuário e o treino com o caderno de erros dele.
  router.get("/:id/simulador/desempenho", async (req, res) => {
    res.json({ data: await desempenhoService.desempenho(req.params.id, req.usuario.id) });
  });

  router.post("/:id/simulador/caderno", async (req, res) => {
    res.json({ data: await simuladorService.treinoDoCaderno(req.params.id, req.usuario.id) });
  });

  // Os alunos atribuídos ao edital e o desempenho de cada um: orientador e professor (o aluno não chega aqui).
  router.get("/:id/alunos", async (req, res) => {
    res.json({ data: await desempenhoService.alunos(req.params.id) });
  });

  // { alunos: [ids de usuário] }: atribui o edital a esses alunos da equipe; só o orientador. Devolve a lista nova.
  router.post("/:id/alunos", exigirOrientador, async (req, res) => {
    await editalService.atribuirAlunos(req.params.id, req.equipe.id, req.body || {});
    res.json({ data: await desempenhoService.alunos(req.params.id) });
  });

  router.get("/:id/alunos/:alunoId", async (req, res) => {
    res.json({ data: await desempenhoService.doAluno(req.params.id, req.params.alunoId) });
  });

  // Tira o edital do aluno; só o orientador. Devolve a lista nova.
  router.delete("/:id/alunos/:alunoId", exigirOrientador, async (req, res) => {
    await editalService.retirarAluno(req.params.id, req.params.alunoId);
    res.json({ data: await desempenhoService.alunos(req.params.id) });
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
