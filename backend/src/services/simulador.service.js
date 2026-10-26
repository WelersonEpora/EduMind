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
//
// Prova completa cronometrada (etapa 5b), decisões de 2026-10-26:
// - Uma prova anterior inteira, na ordem dela, só com as questões disponíveis (as que entram no treino).
// - O tempo é o das questões objetivas da prova real (prova.duracao_minutos, do orientador), proporcional às questões
//   disponíveis; sem ele, 3 minutos por questão ("estimado"). O aluno não muda o tempo.
// - A tentativa fica no servidor (simulado), com a hora de término: recarregar a página não reinicia o relógio.
// - Sem correção durante a prova. Na entrega (ou quando o tempo acaba), as respostas vão para a tabela resposta.
//
// Caderno de erros (etapa 5c), decisão de 2026-10-26: as questões cuja resposta mais recente está errada (no treino ou
// na prova completa). Acertou uma vez, sai do caderno.

const OUTRAS = "outras";
const MINUTOS_POR_QUESTAO = 3;
// Tolerância para a última resposta chegar depois do fim do tempo (rede lenta).
const FOLGA_EM_SEGUNDOS = 15;

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

// O tempo do simulado: o da prova real, proporcional às questões disponíveis; sem ele, 3 minutos por questão.
function duracaoDoSimulado({ duracaoDaProva, disponiveis, total }) {
  if (duracaoDaProva && total) return { minutos: Math.max(1, Math.round((duracaoDaProva * disponiveis) / total)), estimada: false };
  return { minutos: disponiveis * MINUTOS_POR_QUESTAO, estimada: true };
}

function embaralharAoAcaso(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function criarSimuladorService({ sequelize, coberturaService, embaralhar = embaralharAoAcaso, agora = () => new Date() }) {
  const { Edital, EditalItem, NormaVersao, NormaArtigo, Norma, Resposta, Simulado } = sequelize.models;

  // As referências (norma e artigo) de cada questão, a principal primeiro.
  async function anexarReferencias(linhas) {
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

  // As questões que podem entrar no simulador do edital, com as referências (norma e artigo). questaoId: só uma.
  async function questoesUtilizaveis(editalId, { questaoId } = {}) {
    const linhas = await sequelize.query(
      `SELECT q.id, q.numero, q.disciplina, q.texto_apoio, q.enunciado, q.alternativas, q.gabarito,
              p.id AS prova_id, p.ano, p.banca, p.gabarito_situacao, p.duracao_minutos
         FROM prova_questao q
         JOIN prova p ON p.id = q.prova_id
         JOIN edital_prova ep ON ep.prova_id = p.id AND ep.edital_id = :editalId
        WHERE q.status = 'valida' AND q.gabarito IS NOT NULL AND NOT q.anulada AND NOT q.depende_de_imagem
          ${questaoId ? "AND q.id = :questaoId" : ""}
        ORDER BY p.ano DESC NULLS LAST, q.numero`,
      { replacements: { editalId, questaoId }, type: sequelize.QueryTypes.SELECT }
    );
    return anexarReferencias(linhas);
  }

  // As questões de um simulado já começado, pelos ids e na ordem deles (mesmo que alguma tenha mudado depois).
  async function questoesPorIds(ids) {
    const linhas = await sequelize.query(
      `SELECT q.id, q.numero, q.disciplina, q.texto_apoio, q.enunciado, q.alternativas, q.gabarito, q.prova_id, p.ano
         FROM prova_questao q JOIN prova p ON p.id = q.prova_id
        WHERE q.id IN (:ids)`,
      { replacements: { ids }, type: sequelize.QueryTypes.SELECT }
    );
    const porId = new Map(linhas.map((l) => [l.id, l]));
    return anexarReferencias(ids.map((id) => porId.get(id)).filter(Boolean));
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

  const nomesDasDisciplinas = (mapa) => new Map([...mapa.disciplinas.map((d) => [d.id, d.texto]), [OUTRAS, "Outras"]]);

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

  // Quantas questões cada prova tem (as descartadas na leitura não contam): a base do tempo proporcional.
  async function totaisDasProvas(provaIds) {
    if (provaIds.length === 0) return new Map();
    const linhas = await sequelize.query(
      `SELECT prova_id, COUNT(*)::int AS total FROM prova_questao WHERE prova_id IN (:provaIds) AND status <> 'descartada' GROUP BY prova_id`,
      { replacements: { provaIds }, type: sequelize.QueryTypes.SELECT }
    );
    return new Map(linhas.map((l) => [l.prova_id, l.total]));
  }

  // Para a tela de início: as disciplinas com quantas questões cada uma tem, as provas de onde elas vêm (com o tempo
  // da prova completa) e a prova completa em andamento do usuário, se houver.
  async function resumo(editalId, usuarioId) {
    await editalExistente(editalId);
    const { questoes, mapa } = await questoesComDisciplina(editalId);
    const contar = (id) => questoes.filter((q) => q.disciplina_id === id).length;
    const disciplinas = mapa.disciplinas.map((d) => ({ id: d.id, texto: d.texto, questoes: contar(d.id) })).filter((d) => d.questoes > 0);
    const outras = contar(OUTRAS);
    if (outras) disciplinas.push({ id: OUTRAS, texto: "Outras", questoes: outras });
    const provas = new Map();
    for (const q of questoes) {
      if (!provas.has(q.prova_id)) {
        provas.set(q.prova_id, { id: q.prova_id, ano: q.ano, banca: q.banca, gabarito_situacao: q.gabarito_situacao, duracao_da_prova: q.duracao_minutos, questoes: 0 });
      }
      provas.get(q.prova_id).questoes += 1;
    }
    const totais = await totaisDasProvas([...provas.keys()]);
    for (const prova of provas.values()) {
      prova.total = totais.get(prova.id) ?? prova.questoes;
      const duracao = duracaoDoSimulado({ duracaoDaProva: prova.duracao_da_prova, disponiveis: prova.questoes, total: prova.total });
      prova.duracao_minutos = duracao.minutos;
      prova.duracao_estimada = duracao.estimada;
    }
    const emAndamento = usuarioId ? await simuladoEmAndamento(editalId, usuarioId) : null;
    return {
      total: questoes.length,
      disciplinas,
      provas: [...provas.values()],
      em_andamento: emAndamento && { id: emAndamento.id, prova_id: emAndamento.prova_id, restante_segundos: restante(emAndamento) }
    };
  }

  // Um treino: as questões das disciplinas escolhidas, embaralhadas, sem o gabarito. quantidade null: todas.
  async function treino(editalId, { disciplinas, quantidade } = {}) {
    await editalExistente(editalId);
    if (!Array.isArray(disciplinas) || disciplinas.length === 0) throw new AppError(400, "Escolha pelo menos uma disciplina.");
    if (quantidade != null && !(Number.isInteger(quantidade) && quantidade > 0)) throw new AppError(400, "A quantidade precisa ser um inteiro maior que zero.");
    const { questoes, mapa } = await questoesComDisciplina(editalId);
    const escolhidas = embaralhar(questoes.filter((q) => disciplinas.includes(q.disciplina_id)));
    const nomes = nomesDasDisciplinas(mapa);
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

  // Caderno de erros (etapa 5c) ----------------------------------------------------------------------------------------

  // A resposta mais recente do usuário a cada questão do edital.
  async function ultimasRespostas(editalId, usuarioId) {
    return sequelize.query(
      `SELECT DISTINCT ON (questao_id) questao_id, acertou FROM resposta
        WHERE edital_id = :editalId AND usuario_id = :usuarioId
        ORDER BY questao_id, created_at DESC`,
      { replacements: { editalId, usuarioId }, type: sequelize.QueryTypes.SELECT }
    );
  }

  // As questões do caderno que ainda podem ser treinadas (uma questão que voltou para revisão fica de fora).
  async function questoesDoCaderno(editalId, usuarioId) {
    const erradas = new Set((await ultimasRespostas(editalId, usuarioId)).filter((r) => !r.acertou).map((r) => r.questao_id));
    const { questoes, mapa } = await questoesComDisciplina(editalId);
    return { questoes: questoes.filter((q) => erradas.has(q.id)), mapa };
  }

  // Um treino com as questões do caderno, embaralhadas, sem o gabarito (como o treino por disciplina).
  async function treinoDoCaderno(editalId, usuarioId) {
    await editalExistente(editalId);
    const { questoes, mapa } = await questoesDoCaderno(editalId, usuarioId);
    const nomes = nomesDasDisciplinas(mapa);
    return embaralhar(questoes).map((q) => ({
      id: q.id,
      numero: q.numero,
      disciplina: { id: q.disciplina_id, texto: nomes.get(q.disciplina_id) },
      prova: { id: q.prova_id, ano: q.ano, banca: q.banca, gabarito_oficial: q.gabarito_situacao === "oficial_definitivo" },
      texto_apoio: q.texto_apoio,
      enunciado: q.enunciado,
      alternativas: q.alternativas
    }));
  }

  // Para o desempenho (etapa 5c): as questões pelos ids, com a disciplina do edital, as referências e se ainda podem
  // ser treinadas (utilizavel).
  async function questoesDoEdital(editalId, ids) {
    if (ids.length === 0) return { questoes: [], disciplinas: [] };
    const [questoes, mapa, utilizaveis] = await Promise.all([questoesPorIds(ids), mapaDoEdital(editalId), questoesUtilizaveis(editalId)]);
    const nomes = nomesDasDisciplinas(mapa);
    const podeTreinar = new Set(utilizaveis.map((q) => q.id));
    for (const q of questoes) {
      const id = disciplinaDa(q, mapa);
      q.disciplina_do_edital = { id, texto: nomes.get(id) };
      q.utilizavel = podeTreinar.has(q.id);
    }
    return { questoes, disciplinas: [...mapa.disciplinas.map(({ id, texto }) => ({ id, texto })), { id: OUTRAS, texto: "Outras" }] };
  }

  // Prova completa (etapa 5b) ---------------------------------------------------------------------------------------

  const restante = (simulado) => Math.max(0, Math.ceil((new Date(simulado.termina_em) - agora()) / 1000));
  const acabouOTempo = (simulado) => agora() - new Date(simulado.termina_em) > FOLGA_EM_SEGUNDOS * 1000;

  // A prova em andamento do usuário no edital; a que passou do tempo é entregue antes.
  async function simuladoEmAndamento(editalId, usuarioId) {
    const abertos = await Simulado.findAll({ where: { edital_id: editalId, usuario_id: usuarioId, entregue_em: null } });
    let emAndamento = null;
    for (const simulado of abertos) {
      if (acabouOTempo(simulado)) await entregarSimulado(simulado.id);
      else emAndamento = simulado;
    }
    return emAndamento;
  }

  // A prova do usuário no edital (a de outro usuário dá 404); a que passou do tempo é entregue antes.
  async function simuladoDoUsuario(editalId, usuarioId, simuladoId) {
    const simulado = eUuid(simuladoId) ? await Simulado.findOne({ where: { id: simuladoId, edital_id: editalId, usuario_id: usuarioId } }) : null;
    if (!simulado) throw new AppError(404, "Prova não encontrada.");
    if (!simulado.entregue_em && acabouOTempo(simulado)) {
      await entregarSimulado(simulado.id);
      await simulado.reload();
    }
    return simulado;
  }

  // Começa uma prova completa: as questões disponíveis da prova, na ordem dela, e a hora de término.
  async function iniciarProva(editalId, usuarioId, { prova_id: provaId } = {}) {
    await editalExistente(editalId);
    if (!eUuid(provaId)) throw new AppError(400, "Escolha a prova.");
    if (await simuladoEmAndamento(editalId, usuarioId)) {
      throw new AppError(409, "Você já tem uma prova em andamento neste edital: termine ou desista dela antes.");
    }
    const questoes = (await questoesUtilizaveis(editalId)).filter((q) => q.prova_id === provaId).sort((a, b) => a.numero - b.numero);
    if (questoes.length === 0) throw new AppError(404, "Esta prova não tem questões disponíveis no simulador deste edital.");
    const total = (await totaisDasProvas([provaId])).get(provaId) ?? questoes.length;
    const duracao = duracaoDoSimulado({ duracaoDaProva: questoes[0].duracao_minutos, disponiveis: questoes.length, total });
    const simulado = await Simulado.create({
      id: randomUUID(),
      usuario_id: usuarioId,
      edital_id: editalId,
      prova_id: provaId,
      questoes: questoes.map((q) => q.id),
      duracao_minutos: duracao.minutos,
      duracao_estimada: duracao.estimada,
      termina_em: new Date(agora().getTime() + duracao.minutos * 60 * 1000)
    });
    return estadoDoSimulado(simulado);
  }

  async function prova(editalId, usuarioId, simuladoId) {
    return estadoDoSimulado(await simuladoDoUsuario(editalId, usuarioId, simuladoId));
  }

  // O que a tela precisa: as questões (sem o gabarito enquanto a prova não foi entregue), as respostas, as marcadas e
  // o tempo restante. Entregue: a correção de cada questão, com os artigos, e o resultado por disciplina.
  async function estadoDoSimulado(simulado) {
    const [questoes, mapa, [daProva], totais] = await Promise.all([
      questoesPorIds(simulado.questoes),
      mapaDoEdital(simulado.edital_id),
      sequelize.query(`SELECT id, banca, ano, orgao, cargo, gabarito_situacao FROM prova WHERE id = :id`, {
        replacements: { id: simulado.prova_id },
        type: sequelize.QueryTypes.SELECT
      }),
      totaisDasProvas([simulado.prova_id])
    ]);
    const nomes = nomesDasDisciplinas(mapa);
    const entregue = Boolean(simulado.entregue_em);
    const estado = {
      id: simulado.id,
      prova: {
        id: daProva.id,
        banca: daProva.banca,
        ano: daProva.ano,
        orgao: daProva.orgao,
        cargo: daProva.cargo,
        gabarito_oficial: daProva.gabarito_situacao === "oficial_definitivo",
        total: totais.get(simulado.prova_id) ?? questoes.length
      },
      duracao_minutos: simulado.duracao_minutos,
      duracao_estimada: simulado.duracao_estimada,
      restante_segundos: entregue ? 0 : restante(simulado),
      entregue_em: simulado.entregue_em,
      respostas: simulado.respostas,
      marcadas: simulado.marcadas,
      questoes: questoes.map((q) => {
        const disciplinaId = disciplinaDa(q, mapa);
        return {
          id: q.id,
          numero: q.numero,
          disciplina: { id: disciplinaId, texto: nomes.get(disciplinaId) },
          texto_apoio: q.texto_apoio,
          enunciado: q.enunciado,
          alternativas: q.alternativas
        };
      })
    };
    if (!entregue) return estado;

    const dataDoEdital = (await Edital.findByPk(simulado.edital_id, { attributes: ["data_publicacao"], raw: true }))?.data_publicacao || null;
    const porDisciplina = new Map();
    for (const [i, q] of questoes.entries()) {
      const resposta = simulado.respostas[q.id] || null;
      const acertou = resposta !== null && resposta === q.gabarito;
      Object.assign(estado.questoes[i], { resposta, gabarito: q.gabarito, acertou, artigos: await artigosDaQuestao(q, dataDoEdital) });
      const texto = estado.questoes[i].disciplina.texto;
      if (!porDisciplina.has(texto)) porDisciplina.set(texto, { disciplina: texto, total: 0, acertos: 0, em_branco: 0 });
      const linha = porDisciplina.get(texto);
      linha.total += 1;
      if (acertou) linha.acertos += 1;
      if (resposta === null) linha.em_branco += 1;
    }
    estado.resultado = {
      acertos: simulado.acertos,
      total: questoes.length,
      em_branco: questoes.filter((q) => !simulado.respostas[q.id]).length,
      por_disciplina: [...porDisciplina.values()]
    };
    return estado;
  }

  // Guarda a resposta (ou a limpa, com null) e a marcação de uma questão, sem corrigir. Numa única instrução, para dois
  // cliques seguidos não se sobreporem: { resposta?: "B" | null, marcada?: true | false }.
  async function marcar(editalId, usuarioId, simuladoId, questaoId, campos = {}) {
    const simulado = await simuladoDoUsuario(editalId, usuarioId, simuladoId);
    if (simulado.entregue_em) throw new AppError(409, "Esta prova já foi entregue.");
    if (!simulado.questoes.includes(questaoId)) throw new AppError(404, "Questão não encontrada nesta prova.");
    const alteracoes = [];
    const replacements = { id: simulado.id, questaoId, limite: new Date(agora().getTime() - FOLGA_EM_SEGUNDOS * 1000) };
    if ("resposta" in campos) {
      if (campos.resposta === null) {
        alteracoes.push("respostas = respostas - CAST(:questaoId AS text)");
      } else {
        const letra = typeof campos.resposta === "string" ? campos.resposta.trim().toUpperCase() : "";
        const [questao] = await questoesPorIds([questaoId]);
        if (!questao.alternativas.some((a) => a.letra === letra)) throw new AppError(400, "Escolha uma das alternativas.");
        alteracoes.push("respostas = respostas || jsonb_build_object(CAST(:questaoId AS text), CAST(:letra AS text))");
        replacements.letra = letra;
      }
    }
    if ("marcada" in campos) {
      alteracoes.push(
        campos.marcada
          ? "marcadas = CASE WHEN marcadas @> to_jsonb(CAST(:questaoId AS text)) THEN marcadas ELSE marcadas || to_jsonb(CAST(:questaoId AS text)) END"
          : "marcadas = marcadas - CAST(:questaoId AS text)"
      );
    }
    if (alteracoes.length === 0) throw new AppError(400, "Nada para guardar.");
    const [linhas] = await sequelize.query(
      `UPDATE simulado SET ${alteracoes.join(", ")}
        WHERE id = :id AND entregue_em IS NULL AND termina_em > :limite
        RETURNING respostas, marcadas, termina_em`,
      { replacements }
    );
    if (linhas.length === 0) throw new AppError(409, "O tempo acabou: a prova foi entregue.");
    return { respostas: linhas[0].respostas, marcadas: linhas[0].marcadas, restante_segundos: restante(linhas[0]) };
  }

  // Corrige e grava as respostas na tabela resposta. Só uma vez: a linha fica travada durante a entrega.
  async function entregarSimulado(simuladoId) {
    await sequelize.transaction(async (transaction) => {
      const simulado = await Simulado.findByPk(simuladoId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!simulado || simulado.entregue_em) return;
      const gabaritos = await sequelize.query(`SELECT id, gabarito FROM prova_questao WHERE id IN (:ids)`, {
        replacements: { ids: simulado.questoes },
        type: sequelize.QueryTypes.SELECT,
        transaction
      });
      const gabaritoDe = new Map(gabaritos.map((g) => [g.id, g.gabarito]));
      const respondidas = simulado.questoes.filter((id) => simulado.respostas[id] && gabaritoDe.has(id));
      const linhas = respondidas.map((id) => ({
        id: randomUUID(),
        usuario_id: simulado.usuario_id,
        edital_id: simulado.edital_id,
        questao_id: id,
        resposta: simulado.respostas[id],
        acertou: simulado.respostas[id] === gabaritoDe.get(id),
        simulado_id: simulado.id
      }));
      await Resposta.bulkCreate(linhas, { transaction });
      await simulado.update({ entregue_em: agora(), acertos: linhas.filter((l) => l.acertou).length }, { transaction });
    });
  }

  async function entregar(editalId, usuarioId, simuladoId) {
    const simulado = await simuladoDoUsuario(editalId, usuarioId, simuladoId);
    if (!simulado.entregue_em) {
      await entregarSimulado(simulado.id);
      await simulado.reload();
    }
    return estadoDoSimulado(simulado);
  }

  // Desistir apaga a prova em andamento (nada vai para o histórico).
  async function desistir(editalId, usuarioId, simuladoId) {
    const simulado = await simuladoDoUsuario(editalId, usuarioId, simuladoId);
    if (simulado.entregue_em) throw new AppError(409, "Esta prova já foi entregue.");
    await simulado.destroy();
    return { desistiu: simulado.id };
  }

  return { resumo, treino, responder, iniciarProva, prova, marcar, entregar, desistir, treinoDoCaderno, questoesDoCaderno, questoesDoEdital };
}

module.exports = { criarSimuladorService, chaveDoNome, disciplinaPeloNome, mudouDepoisDaProva, duracaoDoSimulado, OUTRAS };
