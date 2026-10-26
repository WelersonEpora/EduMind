"use strict";

const { randomUUID } = require("node:crypto");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const { versaoDoEdital } = require("./cobertura.service");

// Simulador, treino por disciplina (etapa 5a). Decisões do orientador, 2026-10-26:
// - Entram as questões das provas escolhidas para o edital que estão válidas, com gabarito, não anuladas e sem
//   depender de imagem.
// - A disciplina de cada questão é a do edital, achada por código: a questão de Direito cai na disciplina que pede o
//   artigo que ela cobra (pela cobertura); as demais, pelo nome (sem maiúsculas, acentos nem espaços: o PDF às vezes
//   embaralha "LÍNgUA PORTUgUESA"). O que não casa fica em "outras".
// - A correção é no servidor: a tela só recebe o gabarito depois de responder. Cada resposta fica guardada.
// - Depois de responder, o texto dos artigos que a questão cobra, na versão que vale para o edital, com aviso quando
//   o artigo foi alterado depois do ano da prova (o aviso não esconde a questão).

const OUTRAS = "outras";

// "LÍNgUA PORTUgUESA" e "Língua Portuguesa" viram "linguaportuguesa".
function chaveDoNome(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

// A disciplina do edital pelo nome: igual, ou uma começa com a outra ("Atualidades e Noções sobre..." é Atualidades).
function disciplinaPeloNome(nome, disciplinas) {
  const chave = chaveDoNome(nome);
  if (chave.length < 4) return null;
  return disciplinas.find((d) => d.chave === chave) || disciplinas.find((d) => d.chave.length >= 4 && (chave.startsWith(d.chave) || d.chave.startsWith(chave))) || null;
}

// Alteração do artigo em relação ao ano da prova: "depois", "talvez" (no mesmo ano) ou null.
function mudouDepoisDaProva(notas, anoDaProva) {
  if (!anoDaProva) return null;
  const anos = (notas || []).filter((n) => n.alteracao && n.data?.valor).map((n) => Number(n.data.valor.slice(0, 4)));
  if (anos.some((ano) => ano > anoDaProva)) return "depois";
  if (anos.some((ano) => ano === anoDaProva)) return "talvez";
  return null;
}

function embaralharAoAcaso(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function criarSimuladorService({ sequelize, coberturaService, embaralhar = embaralharAoAcaso }) {
  const { Edital, EditalItem, NormaVersao, NormaArtigo, Norma, Resposta } = sequelize.models;

  // As questões que podem entrar no simulador do edital, com as referências (norma e artigo). questaoId: só uma.
  async function questoesUtilizaveis(editalId, { questaoId } = {}) {
    const linhas = await sequelize.query(
      `SELECT q.id, q.numero, q.disciplina, q.texto_apoio, q.enunciado, q.alternativas, q.gabarito,
              p.id AS prova_id, p.ano, p.banca, p.gabarito_situacao
         FROM prova_questao q
         JOIN prova p ON p.id = q.prova_id
         JOIN edital_prova ep ON ep.prova_id = p.id AND ep.edital_id = :editalId
        WHERE q.status = 'valida' AND q.gabarito IS NOT NULL AND NOT q.anulada AND NOT q.depende_de_imagem
          ${questaoId ? "AND q.id = :questaoId" : ""}
        ORDER BY p.ano DESC NULLS LAST, q.numero`,
      { replacements: { editalId, questaoId }, type: sequelize.QueryTypes.SELECT }
    );
    const referencias = linhas.length
      ? await sequelize.query(
          `SELECT questao_id, norma_id, artigo, papel FROM questao_artigo WHERE questao_id IN (:ids)
            ORDER BY CASE papel WHEN 'principal' THEN 0 ELSE 1 END`,
          { replacements: { ids: linhas.map((l) => l.id) }, type: sequelize.QueryTypes.SELECT }
        )
      : [];
    for (const linha of linhas) linha.referencias = referencias.filter((r) => r.questao_id === linha.id);
    return linhas;
  }

  // As disciplinas do edital (na ordem da árvore) e, pela cobertura, qual disciplina pede cada artigo e cada norma.
  async function mapaDoEdital(editalId) {
    // A ordem é por nível (entre irmãos): a da árvore é a do bloco e, dentro dele, a da disciplina.
    const itens = await EditalItem.findAll({
      where: { edital_id: editalId, nivel: ["bloco", "disciplina"] },
      attributes: ["id", "parent_id", "nivel", "texto", "status", "ordem"],
      raw: true
    });
    const ordemDoBloco = new Map(itens.filter((i) => i.nivel === "bloco").map((i) => [i.id, i.ordem]));
    const disciplinas = itens
      .filter((i) => i.nivel === "disciplina" && i.status !== "rejeitado")
      .sort((a, b) => (ordemDoBloco.get(a.parent_id) ?? 0) - (ordemDoBloco.get(b.parent_id) ?? 0) || a.ordem - b.ordem)
      .map((i) => ({ id: i.id, texto: i.texto, chave: chaveDoNome(i.texto) }));
    const porArtigo = new Map();
    const porNorma = new Map();
    const { disciplinas: cobertas } = await coberturaService.cobertura(editalId);
    for (const disciplina of cobertas) {
      for (const citacao of disciplina.itens.flatMap((i) => i.citacoes)) {
        if (!citacao.norma) continue;
        if (!porNorma.has(citacao.norma.id)) porNorma.set(citacao.norma.id, disciplina.id);
        const artigos = [...citacao.artigos, ...(citacao.estrutura?.partes || []).flatMap((p) => p.artigos)];
        for (const artigo of artigos) {
          const chave = `${citacao.norma.id}|${artigo.numero}`;
          if (!porArtigo.has(chave)) porArtigo.set(chave, disciplina.id);
        }
      }
    }
    return { disciplinas, porArtigo, porNorma };
  }

  // A disciplina do edital de uma questão: pelo artigo cobrado, pela norma, pelo nome; senão "outras".
  function disciplinaDa(questao, mapa) {
    for (const r of questao.referencias) {
      const pelaNorma = mapa.porArtigo.get(`${r.norma_id}|${r.artigo}`);
      if (pelaNorma) return pelaNorma;
    }
    for (const r of questao.referencias) if (mapa.porNorma.has(r.norma_id)) return mapa.porNorma.get(r.norma_id);
    return disciplinaPeloNome(questao.disciplina, mapa.disciplinas)?.id || OUTRAS;
  }

  async function editalExistente(editalId) {
    const edital = eUuid(editalId) ? await Edital.findByPk(editalId, { attributes: ["id", "data_publicacao"], raw: true }) : null;
    if (!edital) throw new AppError(404, "Edital não encontrado.");
    return edital;
  }

  async function questoesComDisciplina(editalId) {
    const [questoes, mapa] = await Promise.all([questoesUtilizaveis(editalId), mapaDoEdital(editalId)]);
    for (const questao of questoes) questao.disciplina_id = disciplinaDa(questao, mapa);
    return { questoes, mapa };
  }

  // Para a tela de início: as disciplinas com quantas questões cada uma tem, e as provas de onde elas vêm.
  async function resumo(editalId) {
    await editalExistente(editalId);
    const { questoes, mapa } = await questoesComDisciplina(editalId);
    const contar = (id) => questoes.filter((q) => q.disciplina_id === id).length;
    const disciplinas = mapa.disciplinas.map((d) => ({ id: d.id, texto: d.texto, questoes: contar(d.id) })).filter((d) => d.questoes > 0);
    const outras = contar(OUTRAS);
    if (outras) disciplinas.push({ id: OUTRAS, texto: "Outras", questoes: outras });
    const provas = new Map();
    for (const q of questoes) {
      if (!provas.has(q.prova_id)) provas.set(q.prova_id, { id: q.prova_id, ano: q.ano, banca: q.banca, gabarito_situacao: q.gabarito_situacao, questoes: 0 });
      provas.get(q.prova_id).questoes += 1;
    }
    return { total: questoes.length, disciplinas, provas: [...provas.values()] };
  }

  // Um treino: as questões das disciplinas escolhidas, embaralhadas, sem o gabarito. quantidade null: todas.
  async function treino(editalId, { disciplinas, quantidade } = {}) {
    await editalExistente(editalId);
    if (!Array.isArray(disciplinas) || disciplinas.length === 0) throw new AppError(400, "Escolha pelo menos uma disciplina.");
    if (quantidade != null && !(Number.isInteger(quantidade) && quantidade > 0)) throw new AppError(400, "A quantidade precisa ser um inteiro maior que zero.");
    const { questoes, mapa } = await questoesComDisciplina(editalId);
    const escolhidas = embaralhar(questoes.filter((q) => disciplinas.includes(q.disciplina_id)));
    const nomes = new Map([...mapa.disciplinas.map((d) => [d.id, d.texto]), [OUTRAS, "Outras"]]);
    return escolhidas.slice(0, quantidade ?? escolhidas.length).map((q) => ({
      id: q.id,
      numero: q.numero,
      disciplina: { id: q.disciplina_id, texto: nomes.get(q.disciplina_id) },
      prova: { id: q.prova_id, ano: q.ano, banca: q.banca, gabarito_oficial: q.gabarito_situacao === "oficial_definitivo" },
      texto_apoio: q.texto_apoio,
      enunciado: q.enunciado,
      alternativas: q.alternativas
    }));
  }

  // O texto dos artigos que a questão cobra, na versão da norma que vale para o edital, com o aviso de alteração.
  async function artigosDaQuestao(questao, dataDoEdital) {
    const resultado = [];
    for (const r of questao.referencias) {
      const norma = await Norma.findByPk(r.norma_id, { attributes: ["id", "nome"], raw: true });
      const versoes = await NormaVersao.findAll({
        where: { norma_id: r.norma_id },
        attributes: ["id", "data_versao", "processada_em"],
        raw: true
      });
      const escolha = versaoDoEdital(versoes.filter((v) => v.processada_em), dataDoEdital);
      const artigo = escolha
        ? await NormaArtigo.findOne({
            where: { versao_id: escolha.versao.id, numero: r.artigo },
            attributes: ["texto_bruto", "revogado", "notas"],
            order: [["ordem", "ASC"]],
            raw: true
          })
        : null;
      resultado.push({
        norma,
        numero: r.artigo,
        papel: r.papel,
        // Nunca inventar texto: artigo que não está no texto da norma vai sem texto.
        texto: artigo?.texto_bruto ?? null,
        revogado: Boolean(artigo?.revogado),
        mudou_depois_da_prova: artigo ? mudouDepoisDaProva(artigo.notas, questao.ano) : null
      });
    }
    return resultado;
  }

  // Corrige, guarda a resposta e devolve o gabarito e os artigos.
  async function responder(editalId, usuarioId, { questao_id: questaoId, resposta } = {}) {
    const edital = await editalExistente(editalId);
    if (!eUuid(questaoId)) throw new AppError(400, "Indique a questão.");
    const [questao] = await questoesUtilizaveis(editalId, { questaoId });
    if (!questao) throw new AppError(404, "Questão não encontrada no simulador deste edital.");
    const letra = typeof resposta === "string" ? resposta.trim().toUpperCase() : "";
    if (!questao.alternativas.some((a) => a.letra === letra)) throw new AppError(400, "Escolha uma das alternativas.");
    const acertou = letra === questao.gabarito;
    await Resposta.create({ id: randomUUID(), usuario_id: usuarioId, edital_id: editalId, questao_id: questao.id, resposta: letra, acertou });
    return { acertou, gabarito: questao.gabarito, artigos: await artigosDaQuestao(questao, edital.data_publicacao || null) };
  }

  return { resumo, treino, responder };
}

module.exports = { criarSimuladorService, chaveDoNome, disciplinaPeloNome, mudouDepoisDaProva, OUTRAS };
