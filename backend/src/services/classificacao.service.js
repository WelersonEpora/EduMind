"use strict";

const crypto = require("node:crypto");
const { Op } = require("sequelize");
const gemini = require("../ai/gemini.provider");
const { carregarPrompt } = require("../ai/carregar-prompt");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const logger = require("../shared/logger");
const { ESQUEMA_CLASSIFICACAO, montarClassificacao, conferirReferencias } = require("./classificacao-da-prova");

// Classificação das questões de uma prova por norma e artigo (etapa 3c), em segundo plano, como a leitura.
// - Vão para a IA as questões lidas e não descartadas, menos as que o orientador já classificou à mão (ficam como
//   estão).
// - A conferência usa a versão mais recente (já dividida) de cada norma da biblioteca.

const PROMPT = "prova-classificacao.md";
const STATUS = ["classificada", "a_revisar", "nao_juridica"];

function criarClassificacaoService({ sequelize, gerarJson = gemini.gerarJson, agora = () => new Date() }) {
  const { Prova, ProvaQuestao, QuestaoArtigo, Norma, NormaVersao, NormaArtigo } = sequelize.models;
  const aindaClassificando = (id) => ({ where: { id, classificacao_status: "classificando" } });

  async function provaExistente(id) {
    const prova = eUuid(id) ? await Prova.findByPk(id) : null;
    if (!prova) throw new AppError(404, "Prova não encontrada na biblioteca.");
    return prova;
  }

  // As normas da biblioteca com os artigos da versão mais recente já dividida (null se ainda sem texto).
  async function contextoDaBiblioteca(anoDaProva) {
    const normas = new Map();
    const normasPorId = new Map();
    for (const norma of await Norma.findAll({ attributes: ["id", "chave", "nome"], order: [["nome", "ASC"]], raw: true })) {
      const versao = await NormaVersao.findOne({
        where: { norma_id: norma.id, processada_em: { [Op.ne]: null } },
        order: [["created_at", "DESC"]],
        attributes: ["id"],
        raw: true
      });
      let artigos = null;
      if (versao) {
        artigos = new Map();
        for (const a of await NormaArtigo.findAll({ where: { versao_id: versao.id }, attributes: ["numero", "revogado", "notas"], raw: true })) {
          if (!artigos.has(a.numero)) artigos.set(a.numero, a);
        }
      }
      const item = { id: norma.id, chave: norma.chave, nome: norma.nome, artigos };
      normas.set(norma.chave, item);
      normasPorId.set(norma.id, item);
    }
    return { normas, normasPorId, anoDaProva };
  }

  function textoDasQuestoes(questoes) {
    return questoes
      .map((q) =>
        [
          `QUESTÃO ${q.numero}${q.disciplina ? ` [${q.disciplina}]` : ""}`,
          q.enunciado,
          ...q.alternativas.map((a) => `(${a.letra}) ${a.texto}`),
          `Gabarito: ${q.anulada ? "anulada" : q.gabarito || "não informado"}`
        ].join("\n")
      )
      .join("\n\n");
  }

  async function executar(id) {
    try {
      const prova = await Prova.findByPk(id, { attributes: ["id", "ano"], raw: true });
      const questoes = await ProvaQuestao.findAll({
        where: { prova_id: id, status: { [Op.ne]: "descartada" }, classificacao_revisada_em: null },
        order: [["numero", "ASC"]],
        raw: true
      });
      if (questoes.length === 0) throw new AppError(422, "Não há questões para classificar (todas descartadas ou já revisadas por você).");
      const contexto = await contextoDaBiblioteca(prova.ano);

      const { versao, instrucaoDoSistema, prompt } = carregarPrompt(PROMPT, {
        normas: [...contexto.normas.values()].map((n) => `${n.chave} | ${n.nome}`).join("\n"),
        questoes: textoDasQuestoes(questoes)
      });
      const resposta = await gerarJson({ systemInstruction: instrucaoDoSistema, prompt, responseSchema: ESQUEMA_CLASSIFICACAO, somentePaga: true });
      const resultado = montarClassificacao(resposta.texto, questoes.map((q) => q.numero), contexto);

      const classificacao = {
        concluida_em: agora().toISOString(),
        chamadas: [{ prompt: versao, modelo: resposta.modelo, chave: resposta.chave, tokens: resposta.tokens }]
      };
      const gravou = await sequelize.transaction(async (transaction) => {
        const [alterados] = await Prova.update(
          { classificacao_status: "classificada", classificacao_erro: null, classificacao },
          { ...aindaClassificando(id), transaction }
        );
        if (alterados === 0) return false;
        await QuestaoArtigo.destroy({ where: { questao_id: questoes.map((q) => q.id) }, transaction });
        for (const questao of questoes) {
          const r = resultado.get(questao.numero);
          await ProvaQuestao.update(
            { classificacao_status: r.classificacao_status, classificacao_problemas: r.classificacao_problemas, norma_citada: r.norma_citada },
            { where: { id: questao.id }, transaction }
          );
          if (r.referencias.length) {
            await QuestaoArtigo.bulkCreate(r.referencias.map((ref) => ({ id: crypto.randomUUID(), questao_id: questao.id, ...ref })), { transaction });
          }
        }
        return true;
      });
      logger.info({ provaId: id, gravou, questoes: questoes.length, chamadas: classificacao.chamadas }, "classificação da prova concluída");
    } catch (erro) {
      logger.error({ err: erro, provaId: id }, "classificação da prova falhou");
      const mensagem =
        erro instanceof AppError || erro instanceof gemini.ErroDoGemini ? erro.message : "Erro inesperado na classificação. Veja o log do backend.";
      await Prova.update({ classificacao_status: "erro", classificacao_erro: mensagem }, aindaClassificando(id)).catch((erroAoGravar) =>
        logger.error({ err: erroAoGravar, provaId: id }, "não gravou o erro da classificação")
      );
    }
  }

  async function iniciar(id) {
    const prova = await provaExistente(id);
    if (prova.leitura_status !== "lida") throw new AppError(400, "Leia as questões da prova antes de classificar.");
    const [alterados] = await Prova.update(
      { classificacao_status: "classificando", classificacao_erro: null },
      { where: { id: prova.id, [Op.or]: [{ classificacao_status: null }, { classificacao_status: { [Op.ne]: "classificando" } }] } }
    );
    if (alterados === 0) throw new AppError(409, "A classificação desta prova já está em andamento.");
    return { concluida: executar(prova.id) };
  }

  async function marcarInterrompidas() {
    const [alterados] = await Prova.update(
      { classificacao_status: "erro", classificacao_erro: "O backend reiniciou durante a classificação. Classifique de novo." },
      { where: { classificacao_status: "classificando" } }
    );
    return alterados;
  }

  // As referências de cada questão da prova, com o nome da norma (para a tela).
  async function referenciasDaProva(provaId) {
    const linhas = await QuestaoArtigo.findAll({
      attributes: ["questao_id", "norma_id", "artigo", "papel"],
      include: [
        { model: ProvaQuestao, as: "questao", where: { prova_id: provaId }, attributes: [] },
        { model: Norma, as: "norma", attributes: ["nome", "chave"] }
      ],
      order: [["papel", "ASC"], ["artigo", "ASC"]]
    });
    const porQuestao = new Map();
    for (const l of linhas) {
      if (!porQuestao.has(l.questao_id)) porQuestao.set(l.questao_id, []);
      porQuestao.get(l.questao_id).push({ norma_id: l.norma_id, norma: l.norma.nome, chave: l.norma.chave, artigo: l.artigo, papel: l.papel });
    }
    return porQuestao;
  }

  // O orientador corrige a classificação: novas referências (conferidas de novo pelo código) e/ou o status.
  async function revisar(provaId, questaoId, { referencias, classificacao_status: status } = {}) {
    const prova = await provaExistente(provaId);
    const questao = eUuid(questaoId) ? await ProvaQuestao.findOne({ where: { id: questaoId, prova_id: prova.id } }) : null;
    if (!questao) throw new AppError(404, "Questão não encontrada nesta prova.");
    if (referencias === undefined && status === undefined) throw new AppError(400, "Nada para alterar.");
    if (status !== undefined && !STATUS.includes(status)) throw new AppError(400, 'O status precisa ser "classificada", "a_revisar" ou "nao_juridica".');

    const novos = { classificacao_revisada_em: agora() };
    let gravar = null;
    if (status === "nao_juridica") {
      gravar = [];
      Object.assign(novos, { classificacao_status: "nao_juridica", classificacao_problemas: [], norma_citada: null });
    } else if (referencias !== undefined) {
      const validas =
        Array.isArray(referencias) &&
        referencias.every((r) => r && eUuid(r.norma_id) && typeof r.artigo === "string" && ["principal", "relacionado"].includes(r.papel));
      if (!validas) throw new AppError(400, "Cada referência precisa de norma_id, artigo e papel (principal ou relacionado).");
      const contexto = await contextoDaBiblioteca(prova.ano);
      if (referencias.some((r) => !contexto.normasPorId.has(r.norma_id))) throw new AppError(400, "Norma não encontrada na biblioteca.");
      const conferidas = conferirReferencias(referencias, contexto);
      gravar = conferidas.referencias;
      Object.assign(novos, {
        classificacao_problemas: conferidas.problemas,
        norma_citada: null,
        classificacao_status: status || (conferidas.problemas.length ? "a_revisar" : "classificada")
      });
    } else {
      novos.classificacao_status = status;
    }

    await sequelize.transaction(async (transaction) => {
      await questao.update(novos, { transaction });
      if (gravar) {
        await QuestaoArtigo.destroy({ where: { questao_id: questao.id }, transaction });
        if (gravar.length) await QuestaoArtigo.bulkCreate(gravar.map((ref) => ({ id: crypto.randomUUID(), questao_id: questao.id, ...ref })), { transaction });
      }
    });
    const refs = (await referenciasDaProva(prova.id)).get(questao.id) || [];
    return { ...questao.get({ plain: true }), referencias: refs };
  }

  return { iniciar, marcarInterrompidas, referenciasDaProva, revisar };
}

module.exports = { criarClassificacaoService };
