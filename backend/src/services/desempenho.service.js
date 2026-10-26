"use strict";

const { Op } = require("sequelize");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");

// Desempenho no simulador (etapa 5c), decisões de 2026-10-26:
// - Do aluno, num edital: o geral e por disciplina (cada resposta conta, no treino e na prova completa), o caderno de
//   erros (questões cuja resposta mais recente está errada; acertou uma vez, sai), os artigos de lei das questões que
//   ele mais erra e as provas completas entregues.
// - O orientador e o professor veem os alunos atribuídos ao edital e o desempenho de cada um (aba Alunos).

const MAXIMO_DE_ARTIGOS = 10;

function criarDesempenhoService({ sequelize, simuladorService }) {
  const { Resposta, Simulado, Norma } = sequelize.models;

  async function desempenho(editalId, usuarioId) {
    const respostas = await Resposta.findAll({
      where: { edital_id: editalId, usuario_id: usuarioId },
      attributes: ["questao_id", "acertou", "created_at"],
      order: [["created_at", "ASC"]],
      raw: true
    });
    const ultima = new Map();
    for (const r of respostas) ultima.set(r.questao_id, r.acertou);
    const { questoes, disciplinas } = await simuladorService.questoesDoEdital(editalId, [...ultima.keys()]);
    const questaoDe = new Map(questoes.map((q) => [q.id, q]));

    // Por disciplina, na ordem do edital (só as que têm respostas).
    const porDisciplina = new Map(disciplinas.map((d) => [d.id, { id: d.id, texto: d.texto, questoes: new Set(), respostas: 0, acertos: 0 }]));
    // Os artigos das questões: quantas respostas e quantos erros.
    const porArtigo = new Map();
    for (const r of respostas) {
      const questao = questaoDe.get(r.questao_id);
      if (!questao) continue;
      const linha = porDisciplina.get(questao.disciplina_do_edital.id);
      linha.questoes.add(questao.id);
      linha.respostas += 1;
      if (r.acertou) linha.acertos += 1;
      const vistos = new Set();
      for (const ref of questao.referencias) {
        const chave = `${ref.norma_id}|${ref.artigo}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        if (!porArtigo.has(chave)) porArtigo.set(chave, { norma_id: ref.norma_id, numero: ref.artigo, respostas: 0, erros: 0 });
        const artigo = porArtigo.get(chave);
        artigo.respostas += 1;
        if (!r.acertou) artigo.erros += 1;
      }
    }

    const maisErrados = [...porArtigo.values()]
      .filter((a) => a.erros > 0)
      .sort((a, b) => b.erros - a.erros || b.erros / b.respostas - a.erros / a.respostas)
      .slice(0, MAXIMO_DE_ARTIGOS);
    const normas = maisErrados.length
      ? await Norma.findAll({ where: { id: [...new Set(maisErrados.map((a) => a.norma_id))] }, attributes: ["id", "nome"], raw: true })
      : [];
    const nomeDaNorma = new Map(normas.map((n) => [n.id, n.nome]));

    const simulados = await Simulado.findAll({
      where: { edital_id: editalId, usuario_id: usuarioId, entregue_em: { [Op.ne]: null } },
      attributes: ["id", "prova_id", "questoes", "acertos", "duracao_minutos", "created_at", "entregue_em"],
      order: [["entregue_em", "DESC"]],
      raw: true
    });
    const provas = simulados.length
      ? await sequelize.query(`SELECT id, banca, ano FROM prova WHERE id IN (:ids)`, {
          replacements: { ids: [...new Set(simulados.map((s) => s.prova_id))] },
          type: sequelize.QueryTypes.SELECT
        })
      : [];
    const provaDe = new Map(provas.map((p) => [p.id, p]));

    const acertos = respostas.filter((r) => r.acertou).length;
    return {
      questoes: ultima.size,
      respostas: respostas.length,
      acertos,
      ultima_atividade: respostas.length ? respostas[respostas.length - 1].created_at : null,
      // O caderno: a resposta mais recente errada, e a questão ainda pode ser treinada.
      caderno: [...ultima].filter(([id, acertou]) => !acertou && questaoDe.get(id)?.utilizavel).length,
      por_disciplina: [...porDisciplina.values()]
        .filter((d) => d.respostas > 0)
        .map(({ questoes: vistas, ...d }) => ({ ...d, questoes: vistas.size })),
      artigos: maisErrados.map((a) => ({ norma: { id: a.norma_id, nome: nomeDaNorma.get(a.norma_id) }, numero: a.numero, respostas: a.respostas, erros: a.erros })),
      provas: simulados.map((s) => ({
        id: s.id,
        prova: provaDe.get(s.prova_id) || { id: s.prova_id },
        entregue_em: s.entregue_em,
        acertos: s.acertos,
        total: s.questoes.length,
        duracao_minutos: s.duracao_minutos,
        minutos_usados: Math.min(s.duracao_minutos, Math.ceil((new Date(s.entregue_em) - new Date(s.created_at)) / 60000))
      }))
    };
  }

  // Os alunos da equipe atribuídos ao edital, com o resumo do que fizeram no simulador.
  async function alunos(editalId) {
    const lista = await sequelize.query(
      `SELECT u.id, u.nome, u.email
         FROM edital_aluno ea
         JOIN edital e ON e.id = ea.edital_id
         JOIN usuario u ON u.id = ea.usuario_id
         JOIN membro m ON m.usuario_id = u.id AND m.equipe_id = e.equipe_id AND m.papel = 'aluno'
        WHERE ea.edital_id = :editalId
        ORDER BY u.nome`,
      { replacements: { editalId }, type: sequelize.QueryTypes.SELECT }
    );
    if (lista.length === 0) return [];
    const replacements = { editalId, ids: lista.map((a) => a.id) };
    const [respostas, provas] = await Promise.all([
      sequelize.query(
        `SELECT usuario_id, COUNT(*)::int AS respostas, (COUNT(*) FILTER (WHERE acertou))::int AS acertos,
                COUNT(DISTINCT questao_id)::int AS questoes, MAX(created_at) AS ultima_atividade
           FROM resposta WHERE edital_id = :editalId AND usuario_id IN (:ids) GROUP BY usuario_id`,
        { replacements, type: sequelize.QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT usuario_id, COUNT(*)::int AS provas FROM simulado
          WHERE edital_id = :editalId AND usuario_id IN (:ids) AND entregue_em IS NOT NULL GROUP BY usuario_id`,
        { replacements, type: sequelize.QueryTypes.SELECT }
      )
    ]);
    const deRespostas = new Map(respostas.map((r) => [r.usuario_id, r]));
    const deProvas = new Map(provas.map((p) => [p.usuario_id, p.provas]));
    return lista.map((aluno) => {
      const r = deRespostas.get(aluno.id);
      return {
        ...aluno,
        questoes: r?.questoes ?? 0,
        respostas: r?.respostas ?? 0,
        acertos: r?.acertos ?? 0,
        provas: deProvas.get(aluno.id) ?? 0,
        ultima_atividade: r?.ultima_atividade ?? null
      };
    });
  }

  // O desempenho de um aluno atribuído ao edital (para o orientador e o professor). Outro usuário: 404.
  async function doAluno(editalId, alunoId) {
    const aluno = eUuid(alunoId) ? (await alunos(editalId)).find((a) => a.id === alunoId) : null;
    if (!aluno) throw new AppError(404, "Aluno não encontrado neste edital.");
    return { aluno: { id: aluno.id, nome: aluno.nome, email: aluno.email }, ...(await desempenho(editalId, alunoId)) };
  }

  return { desempenho, alunos, doAluno };
}

module.exports = { criarDesempenhoService };
