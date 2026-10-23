"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Op } = require("sequelize");
const gemini = require("../ai/gemini.provider");
const { carregarPrompt } = require("../ai/carregar-prompt");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const logger = require("../shared/logger");
const { textoComMarcasDePagina } = require("./extracao.service");
const { ESQUEMA_QUESTOES, ESQUEMA_GABARITO, montarQuestoes, respostaDaQuestao, eProblemaDeGabarito } = require("./leitura-da-prova");
const { textoCorrido } = require("./texto-da-prova");

// Leitura das questões de uma prova da biblioteca (etapa 3b), em segundo plano: a rota responde na hora com a prova
// em "lendo" e a tela acompanha pelo leitura_status. As duas chamadas (questões e gabarito) vão em paralelo, só com a
// chave paga (como a extração do edital).

const PROMPT_QUESTOES = "prova-questoes.md";
const PROMPT_GABARITO = "prova-gabarito.md";
const PROMPT_GABARITO_IMAGEM = "prova-gabarito-imagem.md";
const STATUS_DA_QUESTAO = ["valida", "a_revisar", "descartada"];
const LETRAS = ["A", "B", "C", "D", "E"];

function criarLeituraService({ sequelize, dirProvas, gerarJson = gemini.gerarJson, agora = () => new Date() }) {
  const { Prova, ProvaArquivo, ProvaPagina, ProvaQuestao, QuestaoArtigo, Norma } = sequelize.models;
  const aindaLendo = (id) => ({ where: { id, leitura_status: "lendo" } });

  async function provaExistente(id) {
    const prova = eUuid(id) ? await Prova.findByPk(id) : null;
    if (!prova) throw new AppError(404, "Prova não encontrada na biblioteca.");
    return prova;
  }

  async function arquivoDo(provaId, tipo) {
    return ProvaArquivo.findOne({ where: { prova_id: provaId, tipo }, attributes: ["id", "caminho"], raw: true });
  }

  async function paginasDo(arquivo) {
    if (!arquivo) return null;
    return ProvaPagina.findAll({ where: { arquivo_id: arquivo.id }, attributes: ["numero", "texto"], order: [["numero", "ASC"]], raw: true });
  }

  async function chamarIa(arquivoDoPrompt, variaveis, responseSchema, arquivos = []) {
    const { versao, instrucaoDoSistema, prompt } = carregarPrompt(arquivoDoPrompt, variaveis);
    const resposta = await gerarJson({ systemInstruction: instrucaoDoSistema, prompt, responseSchema, arquivos, somentePaga: true });
    return { texto: resposta.texto, registro: { prompt: versao, modelo: resposta.modelo, chave: resposta.chave, tokens: resposta.tokens } };
  }

  async function executar(id) {
    try {
      const paginasDaProva = await paginasDo(await arquivoDo(id, "prova"));
      const arquivoDoGabarito = await arquivoDo(id, "gabarito");
      const paginasDoGabarito = await paginasDo(arquivoDoGabarito);
      // Gabarito sem texto (só marca d'água): a IA lê o próprio PDF, como imagem.
      const gabaritoDaImagem = Boolean(paginasDoGabarito) && textoCorrido(paginasDoGabarito).trim() === "";
      const lerGabarito = () => {
        if (!paginasDoGabarito) return null;
        if (!gabaritoDaImagem) return chamarIa(PROMPT_GABARITO, { texto_do_gabarito: textoComMarcasDePagina(paginasDoGabarito) }, ESQUEMA_GABARITO);
        const buffer = fs.readFileSync(path.join(dirProvas, arquivoDoGabarito.caminho));
        return chamarIa(PROMPT_GABARITO_IMAGEM, {}, ESQUEMA_GABARITO, [{ mimeType: "application/pdf", buffer }]);
      };
      const [chamadaQuestoes, chamadaGabarito] = await Promise.all([
        chamarIa(PROMPT_QUESTOES, { texto_da_prova: textoComMarcasDePagina(paginasDaProva) }, ESQUEMA_QUESTOES),
        lerGabarito()
      ]);
      const { questoes, avisos, versoes, gabarito } = montarQuestoes({
        respostaQuestoes: chamadaQuestoes.texto,
        respostaGabarito: chamadaGabarito ? chamadaGabarito.texto : null,
        paginasDaProva,
        paginasDoGabarito: paginasDoGabarito || [],
        gabaritoDaImagem
      });
      if (questoes.length === 0) throw new AppError(422, "A leitura não encontrou nenhuma questão no PDF da prova.");

      const leitura = {
        concluida_em: agora().toISOString(),
        versoes,
        gabarito,
        avisos,
        chamadas: [chamadaQuestoes.registro, ...(chamadaGabarito ? [chamadaGabarito.registro] : [])]
      };
      const gravou = await sequelize.transaction(async (transaction) => {
        const [alterados] = await Prova.update({ leitura_status: "lida", leitura_erro: null, leitura, classificacao_status: null, classificacao_erro: null, classificacao: null }, { ...aindaLendo(id), transaction });
        if (alterados === 0) return false;
        await ProvaQuestao.destroy({ where: { prova_id: id }, transaction });
        await ProvaQuestao.bulkCreate(questoes.map((q) => ({ ...q, prova_id: id })), { transaction });
        return true;
      });
      logger.info({ provaId: id, gravou, questoes: questoes.length, avisos, chamadas: leitura.chamadas }, "leitura da prova concluída");
    } catch (erro) {
      logger.error({ err: erro, provaId: id }, "leitura da prova falhou");
      const mensagem =
        erro instanceof AppError || erro instanceof gemini.ErroDoGemini ? erro.message : "Erro inesperado na leitura. Veja o log do backend.";
      await Prova.update({ leitura_status: "erro", leitura_erro: mensagem }, aindaLendo(id)).catch((erroAoGravar) =>
        logger.error({ err: erroAoGravar, provaId: id }, "não gravou o erro da leitura")
      );
    }
  }

  // Marca a prova como "lendo" e dispara a leitura. Ler de novo substitui as questões; se o orientador já revisou
  // alguma, só segue com `confirmarPerdaDaRevisao` (409 com quantas seriam perdidas, como no edital).
  async function iniciar(id, { confirmarPerdaDaRevisao = false } = {}) {
    const prova = await provaExistente(id);
    if (!(await ProvaArquivo.count({ where: { prova_id: prova.id, tipo: "prova" } }))) throw new AppError(400, "A prova não tem PDF.");
    if (prova.leitura_status !== "lendo" && !confirmarPerdaDaRevisao) {
      const revisadas = await ProvaQuestao.count({ where: { prova_id: prova.id, revisada_em: { [Op.ne]: null } } });
      if (revisadas > 0) {
        throw new AppError(
          409,
          `${revisadas} ${revisadas === 1 ? "questão já foi revisada" : "questões já foram revisadas"}. Ler de novo substitui todas e a revisão se perde.`,
          { codigo: "revisao_sera_perdida", revisadas }
        );
      }
    }
    const [alterados] = await Prova.update(
      { leitura_status: "lendo", leitura_erro: null },
      { where: { id: prova.id, [Op.or]: [{ leitura_status: null }, { leitura_status: { [Op.ne]: "lendo" } }] } }
    );
    if (alterados === 0) throw new AppError(409, "A leitura desta prova já está em andamento.");
    return { concluida: executar(prova.id) };
  }

  async function marcarInterrompidas() {
    const [alterados] = await Prova.update(
      { leitura_status: "erro", leitura_erro: "O backend reiniciou durante a leitura. Leia de novo." },
      { where: { leitura_status: "lendo" } }
    );
    return alterados;
  }

  async function questoes(provaId) {
    const prova = await provaExistente(provaId);
    const lista = await ProvaQuestao.findAll({ where: { prova_id: prova.id }, order: [["numero", "ASC"]], raw: true });
    // As referências (norma e artigo) de cada questão, da classificação (etapa 3c).
    const referencias = await QuestaoArtigo.findAll({
      where: { questao_id: lista.map((q) => q.id) },
      attributes: ["questao_id", "norma_id", "artigo", "papel"],
      include: [{ model: Norma, as: "norma", attributes: ["nome", "chave"] }],
      order: [["papel", "ASC"], ["artigo", "ASC"]]
    });
    const porQuestao = new Map();
    for (const r of referencias) {
      if (!porQuestao.has(r.questao_id)) porQuestao.set(r.questao_id, []);
      porQuestao.get(r.questao_id).push({ norma_id: r.norma_id, norma: r.norma.nome, chave: r.norma.chave, artigo: r.artigo, papel: r.papel });
    }
    const campos = ["id", "banca", "orgao", "cargo", "ano", "gabarito_situacao", "leitura_status", "leitura_erro", "leitura", "classificacao_status", "classificacao_erro", "classificacao"];
    return {
      prova: Object.fromEntries(campos.map((c) => [c, prova[c]])),
      questoes: lista.map((q) => ({ ...q, referencias: porQuestao.get(q.id) || [] }))
    };
  }

  // O orientador corrige ou decide sobre uma questão: status, gabarito, anulada, disciplina, enunciado, alternativas.
  async function revisarQuestao(provaId, questaoId, alteracoes = {}) {
    const prova = await provaExistente(provaId);
    const questao = eUuid(questaoId) ? await ProvaQuestao.findOne({ where: { id: questaoId, prova_id: prova.id } }) : null;
    if (!questao) throw new AppError(404, "Questão não encontrada nesta prova.");
    const campos = Object.keys(alteracoes);
    if (campos.length === 0) throw new AppError(400, "Nada para alterar.");

    const novos = {};
    for (const campo of campos) {
      const valor = alteracoes[campo];
      if (campo === "status") {
        if (!STATUS_DA_QUESTAO.includes(valor)) throw new AppError(400, 'O status precisa ser "valida", "a_revisar" ou "descartada".');
        novos.status = valor;
      } else if (campo === "gabarito") {
        if (valor !== null && !LETRAS.includes(valor)) throw new AppError(400, "O gabarito precisa ser uma letra de A a E, ou vazio.");
        novos.gabarito = valor;
      } else if (campo === "anulada") {
        if (typeof valor !== "boolean") throw new AppError(400, '"anulada" precisa ser true ou false.');
        novos.anulada = valor;
      } else if (campo === "disciplina") {
        novos.disciplina = typeof valor === "string" && valor.trim() ? valor.trim() : null;
      } else if (campo === "enunciado") {
        if (typeof valor !== "string" || !valor.trim()) throw new AppError(400, "O enunciado não pode ficar vazio.");
        novos.enunciado = valor.trim();
        novos.editada = true;
      } else if (campo === "alternativas") {
        const validas =
          Array.isArray(valor) &&
          valor.length > 0 &&
          valor.every((a) => a && LETRAS.includes(a.letra) && typeof a.texto === "string" && a.texto.trim() !== "");
        if (!validas) throw new AppError(400, "Cada alternativa precisa de letra (A a E) e texto.");
        novos.alternativas = valor.map((a) => ({ letra: a.letra, texto: a.texto.trim() }));
        novos.editada = true;
      } else {
        throw new AppError(400, `O campo "${campo}" não pode ser editado aqui.`);
      }
    }
    await questao.update({ ...novos, revisada_em: agora() });
    return questao.get({ plain: true });
  }

  async function gabaritoLido(provaId) {
    const prova = await provaExistente(provaId);
    if (prova.leitura_status !== "lida" || !prova.leitura?.gabarito?.versoes) throw new AppError(400, "A prova ainda não teve o gabarito lido.");
    return prova;
  }

  // Põe nas questões as respostas de um gabarito ({ numero: { resposta, valida, conferida } }) e refaz os problemas
  // de gabarito. Sem problema nenhum, a questão vale; uma já validada só volta para revisão se a resposta mudou e
  // criou problema. revisada: a troca foi decisão do orientador (marca revisada_em).
  async function aplicarRespostas(prova, respostas, { revisada, transaction }) {
    const lista = await ProvaQuestao.findAll({ where: { prova_id: prova.id }, transaction });
    for (const questao of lista) {
      const anterior = questao.anulada ? "ANULADA" : questao.gabarito;
      const daQuestao = respostaDaQuestao(respostas[questao.numero], questao.alternativas);
      const problemas = [...questao.problemas.filter((p) => !eProblemaDeGabarito(p)), ...daQuestao.problemas];
      const nova = daQuestao.anulada ? "ANULADA" : daQuestao.gabarito;
      let status = questao.status;
      if (status === "a_revisar" && problemas.length === 0) status = "valida";
      else if (status === "valida" && nova !== anterior && daQuestao.problemas.length > 0) status = "a_revisar";
      await questao.update(
        {
          gabarito: daQuestao.gabarito,
          anulada: daQuestao.anulada,
          problemas,
          status,
          ...(revisada && nova !== anterior ? { revisada_em: agora() } : {})
        },
        { transaction }
      );
    }
  }

  // O gabarito tem várias versões e o caderno não diz qual é a dele: o orientador escolhe ({ versao: índice }). As
  // respostas dessa versão vão para as questões; um gabarito lido da imagem volta a ficar "a conferir".
  async function escolherVersaoDoGabarito(provaId, { versao } = {}) {
    const prova = await gabaritoLido(provaId);
    const { gabarito } = prova.leitura;
    if (!Number.isInteger(versao) || !gabarito.versoes[versao]) throw new AppError(400, "Versão do gabarito inexistente.");
    await sequelize.transaction(async (transaction) => {
      await aplicarRespostas(prova, gabarito.versoes[versao].respostas, { revisada: false, transaction });
      const leitura = {
        ...prova.leitura,
        versoes: { ...prova.leitura.versoes, gabarito: gabarito.versoes[versao].versao },
        // O aviso de "escolha a versão" já foi atendido.
        avisos: (prova.leitura.avisos || []).filter((a) => !a.endsWith("escolha a versão na tela das questões.")),
        gabarito: { ...gabarito, versao_escolhida: versao, conferido_em: null }
      };
      await prova.update({ leitura }, { transaction });
    });
    return questoes(prova.id);
  }

  // O orientador confere o gabarito inteiro de uma vez (o lido da imagem, que o código não tem como conferir):
  // { respostas: [{ numero, resposta: "A".."E" | "ANULADA" | null }] }. As trocas valem nas questões e o gabarito
  // fica conferido.
  async function conferirGabarito(provaId, { respostas } = {}) {
    const prova = await gabaritoLido(provaId);
    if (prova.leitura.gabarito.versao_escolhida === null) throw new AppError(400, "Escolha antes a versão do gabarito.");
    if (!Array.isArray(respostas)) throw new AppError(400, "Envie as respostas: [{ numero, resposta }].");
    const novas = {};
    for (const item of respostas) {
      const resposta = item?.resposta ?? null;
      if (!Number.isInteger(item?.numero) || (resposta !== null && resposta !== "ANULADA" && !LETRAS.includes(resposta))) {
        throw new AppError(400, "Cada resposta precisa do número da questão e de uma letra de A a E, ANULADA ou vazio.");
      }
      if (resposta !== null) novas[item.numero] = { resposta, valida: true, conferida: null };
    }
    // Questão que não veio na lista fica como está.
    const enviadas = new Set(respostas.map((r) => r.numero));
    const atuais = await ProvaQuestao.findAll({ where: { prova_id: prova.id }, attributes: ["numero", "gabarito", "anulada"], raw: true });
    for (const q of atuais) {
      if (enviadas.has(q.numero)) continue;
      const atual = q.anulada ? "ANULADA" : q.gabarito;
      if (atual) novas[q.numero] = { resposta: atual, valida: true, conferida: null };
    }

    await sequelize.transaction(async (transaction) => {
      await aplicarRespostas(prova, novas, { revisada: true, transaction });
      await prova.update({ leitura: { ...prova.leitura, gabarito: { ...prova.leitura.gabarito, conferido_em: agora().toISOString() } } }, { transaction });
    });
    return questoes(prova.id);
  }

  return { iniciar, marcarInterrompidas, questoes, revisarQuestao, escolherVersaoDoGabarito, conferirGabarito };
}

module.exports = { criarLeituraService };
