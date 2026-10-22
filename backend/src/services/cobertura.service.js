"use strict";

const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const { incluirArtigosComLetra, compararArtigos } = require("../parsers/artigos.parser");
const { lerEstrutura, descreverCaminho, artigoNoCaminho } = require("../parsers/estrutura.parser");
const { quandoFoiAlterado } = require("./fontes.service");

// Cobertura do edital (etapa 2c-1): cada artigo pedido nos itens aprovados, cruzado com os artigos da versão da norma
// que vale para o edital. Situação de cada artigo: "encontrado", "revogado" ou "faltando" (nunca inventar texto).
//
// - Abrangência da citação: lista de artigos ("293 a 305; 311-A"), norma inteira (citada sem artigos: decisão do
//   orientador, 2026-10-22) ou estrutura ("Título II – Capítulos I e II", etapa 2c-2).
// - Estrutura: o código (parsers/estrutura.parser.js) acha os artigos pela estrutura guardada na divisão; eles só
//   entram na cobertura depois que o orientador confere a lista (decisão de 2026-10-22). Os artigos citados pelo
//   número no mesmo trecho ("e também o artigo 92") entram direto.
// - Versão usada: a mais recente com data até a publicação do edital; sem nenhuma, a mais antiga depois dela (com o
//   alerta de vigência por artigo). Só versões já divididas em artigos.
// - Calculada na hora, sem gravar: muda sozinha quando o orientador aprova itens, confirma normas ou envia textos.

// Palavras que indicam citação por parte da norma, e não por artigo.
const PALAVRAS_DE_ESTRUTURA = /\b(t[íi]tulos?|cap[íi]tulos?|se[çc][õoã]o|se[çc][õo]es|subse[çc][õoã]o|subse[çc][õo]es|livros?|partes?|tomos?)\b/i;

function abrangenciaDe(citacao) {
  const texto = String(citacao.artigos_texto ?? "").trim();
  if (!texto) return "norma_inteira";
  if (PALAVRAS_DE_ESTRUTURA.test(texto)) return "estrutura";
  if ((citacao.artigos?.artigos || []).length === 0) return "norma_inteira";
  return "artigos";
}

// Versões vêm divididas e com data_versao "AAAA-MM-DD" (ou null).
function versaoDoEdital(versoes, dataDoEdital) {
  if (versoes.length === 0) return null;
  if (!dataDoEdital) {
    const [maisNova] = [...versoes].sort((a, b) => String(b.data_versao ?? "").localeCompare(String(a.data_versao ?? "")));
    return { versao: maisNova, criterio: "sem_data_do_edital" };
  }
  const anteriores = versoes.filter((v) => v.data_versao && v.data_versao <= dataDoEdital);
  if (anteriores.length > 0) {
    anteriores.sort((a, b) => b.data_versao.localeCompare(a.data_versao));
    return { versao: anteriores[0], criterio: "anterior" };
  }
  // Nenhuma até a data do edital: a mais antiga depois (as sem data por último).
  const posteriores = [...versoes].sort((a, b) => String(a.data_versao ?? "9999").localeCompare(String(b.data_versao ?? "9999")));
  return { versao: posteriores[0], criterio: "posterior" };
}

// As alterações do artigo (Redação dada, Incluído, Revogado...) em relação à data do edital.
function vigenciaDoArtigo(artigo, dataDoEdital) {
  if (!dataDoEdital) return null;
  const alteracoes = (artigo.notas || []).filter((n) => n.alteracao && n.data);
  const quando = alteracoes.map((n) => quandoFoiAlterado(n.data, dataDoEdital));
  if (quando.includes("depois")) return "depois";
  if (quando.includes("talvez")) return "talvez";
  return null;
}

// Os artigos de cada caminho da estrutura, na ordem do texto da norma.
function resolverEstrutura(texto, artigos) {
  const { caminhos, avisos } = lerEstrutura(texto);
  const partes = caminhos.map((caminho) => {
    const numeros = [...new Set(artigos.filter((a) => artigoNoCaminho(a.estrutura, caminho)).map((a) => a.numero))];
    const descricao = descreverCaminho(caminho);
    if (numeros.length === 0) {
      const tomo = caminho.some((c) => c.nivel === "tomo") ? " (a divisão em artigos não marca “Tomo”)" : "";
      avisos.push(`${descricao}: não achado no texto da norma${tomo}.`);
    }
    return { descricao, numeros };
  });
  if (caminhos.length === 0 && avisos.length === 0) avisos.push("Nenhum título, capítulo ou seção reconhecido no trecho.");
  const todos = new Set(partes.flatMap((p) => p.numeros));
  const numeros = [...new Set(artigos.map((a) => a.numero).filter((n) => todos.has(n)))];
  return { partes, avisos, numeros };
}

const mesmaLista = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

function criarCoberturaService({ sequelize, agora = () => new Date() }) {
  const { Edital, EditalItem, ItemNorma, Norma, NormaVersao, NormaArtigo } = sequelize.models;

  // Cache por chamada: a mesma norma aparece em vários itens.
  function carregadorDeNormas(dataDoEdital) {
    const cache = new Map();
    return (normaId) => {
      if (!cache.has(normaId)) {
        cache.set(
          normaId,
          (async () => {
            const norma = await Norma.findByPk(normaId, { attributes: ["id", "nome", "chave"], raw: true });
            const versoes = await NormaVersao.findAll({
              where: { norma_id: normaId },
              attributes: ["id", "data_versao", "data_versao_precisao", "processada_em", "artigos_total"],
              raw: true
            });
            const escolha = versaoDoEdital(versoes.filter((v) => v.processada_em), dataDoEdital);
            const artigos = escolha
              ? await NormaArtigo.findAll({
                  where: { versao_id: escolha.versao.id },
                  attributes: ["id", "numero", "ordem", "revogado", "notas", "redacao_anterior", "estrutura"],
                  order: [["ordem", "ASC"]],
                  raw: true
                })
              : [];
            // Um número repetido no texto (raro): vale o primeiro, na ordem do texto.
            const porNumero = new Map();
            for (const artigo of artigos) if (!porNumero.has(artigo.numero)) porNumero.set(artigo.numero, artigo);
            return { norma, versoes, escolha, artigos, porNumero };
          })()
        );
      }
      return cache.get(normaId);
    };
  }

  function artigoCoberto(numero, origem, porNumero, dataDoEdital) {
    const artigo = porNumero.get(numero);
    if (!artigo) return { numero, origem, situacao: "faltando", norma_artigo_id: null, vigencia: null, redacao_anterior: null };
    return {
      numero,
      origem,
      situacao: artigo.revogado ? "revogado" : "encontrado",
      norma_artigo_id: artigo.id,
      vigencia: vigenciaDoArtigo(artigo, dataDoEdital),
      redacao_anterior: artigo.redacao_anterior || null
    };
  }

  async function cobrirCitacao(citacao, carregar, dataDoEdital) {
    const abrangencia = abrangenciaDe(citacao);
    const base = {
      id: citacao.id,
      nome: citacao.nome,
      tipo: citacao.tipo,
      numero: citacao.numero,
      ano: citacao.ano,
      artigos_texto: citacao.artigos_texto,
      abrangencia,
      avisos: abrangencia === "artigos" ? citacao.artigos?.avisos || [] : []
    };
    if (!citacao.norma_id) return { ...base, situacao: "sem_identidade", norma: null, versao: null, artigos: [] };

    const { norma, versoes, escolha, artigos, porNumero } = await carregar(citacao.norma_id);
    if (!escolha) {
      const situacao = versoes.length > 0 ? "texto_nao_dividido" : "sem_texto";
      return { ...base, situacao, norma, versao: null, artigos: [] };
    }
    const versao = {
      id: escolha.versao.id,
      data_versao: escolha.versao.data_versao,
      data_versao_precisao: escolha.versao.data_versao_precisao,
      criterio: escolha.criterio
    };

    let pedidos;
    let estrutura = null;
    if (abrangencia === "norma_inteira") {
      pedidos = artigos.map((a) => ({ numero: a.numero, origem: "norma_inteira" }));
      pedidos = pedidos.filter((p, i) => pedidos.findIndex((q) => q.numero === p.numero) === i);
    } else {
      // Artigos explícitos (inclusive os de uma citação por estrutura, como "e também o artigo 92"), mais os com
      // letra que existem no texto e caem num intervalo do edital.
      const expandido = { artigos: citacao.artigos?.artigos || [], intervalos: citacao.artigos?.intervalos || [] };
      pedidos = incluirArtigosComLetra(expandido, [...porNumero.keys()]).artigos;
    }

    if (abrangencia === "estrutura") {
      const resolvida = resolverEstrutura(citacao.artigos_texto, artigos);
      const conferencia = citacao.estrutura_conferida;
      const vale = Boolean(conferencia && conferencia.texto === citacao.artigos_texto && mesmaLista(conferencia.artigos, resolvida.numeros));
      estrutura = {
        partes: resolvida.partes.map((p) => ({
          descricao: p.descricao,
          artigos: p.numeros.map((n) => artigoCoberto(n, "estrutura", porNumero, dataDoEdital))
        })),
        avisos: resolvida.avisos,
        total: resolvida.numeros.length,
        conferida: vale,
        conferida_em: vale ? conferencia.conferida_em : null,
        // Conferida antes, mas o trecho foi corrigido na revisão ou a lista mudou (outra versão do texto).
        mudou: Boolean(conferencia) && !vale
      };
      if (vale) {
        const jaPedidos = new Set(pedidos.map((p) => p.numero));
        const daEstrutura = resolvida.numeros.filter((n) => !jaPedidos.has(n)).map((numero) => ({ numero, origem: "estrutura" }));
        pedidos = [...pedidos, ...daEstrutura].sort((a, b) => compararArtigos(a.numero, b.numero));
      }
    }

    return {
      ...base,
      situacao: "com_texto",
      norma,
      versao,
      estrutura,
      artigos: pedidos.map((p) => artigoCoberto(p.numero, p.origem, porNumero, dataDoEdital))
    };
  }

  async function cobertura(editalId) {
    const edital = eUuid(editalId)
      ? await Edital.findByPk(editalId, { attributes: ["id", "data_publicacao"], raw: true })
      : null;
    if (!edital) throw new AppError(404, "Edital não encontrado.");
    const dataDoEdital = edital.data_publicacao || null;

    const itens = await EditalItem.findAll({
      where: { edital_id: editalId },
      attributes: ["id", "parent_id", "nivel", "ordem", "texto", "status"],
      include: [{ model: ItemNorma, as: "normas", attributes: { exclude: ["item_id", "created_at", "updated_at"] } }],
      order: [["ordem", "ASC"], [{ model: ItemNorma, as: "normas" }, "ordem", "ASC"]]
    });

    // Árvore em ordem de leitura, guardando a disciplina de cada item.
    const filhos = new Map();
    for (const item of itens.map((i) => i.get({ plain: true }))) {
      if (!filhos.has(item.parent_id)) filhos.set(item.parent_id, []);
      filhos.get(item.parent_id).push(item);
    }
    const disciplinas = [];
    const carregar = carregadorDeNormas(dataDoEdital);
    const percorrer = async (parentId, disciplina) => {
      for (const item of filhos.get(parentId) || []) {
        let atual = disciplina;
        if (item.nivel === "disciplina") {
          atual = { id: item.id, texto: item.texto, itens: [] };
          disciplinas.push(atual);
        }
        if (item.status === "aprovado" && item.normas.length > 0 && atual) {
          const citacoes = [];
          for (const citacao of item.normas) citacoes.push(await cobrirCitacao(citacao, carregar, dataDoEdital));
          atual.itens.push({ id: item.id, texto: item.texto, citacoes });
        }
        await percorrer(item.id, atual);
      }
    };
    await percorrer(null, null);

    const comItens = disciplinas.filter((d) => d.itens.length > 0);
    await anexarQuestoes(editalId, comItens);
    return { edital: { id: edital.id, data_publicacao: dataDoEdital }, resumo: resumir(comItens), disciplinas: comItens };
  }

  // O orientador confere (ou desfaz a conferência de) a lista de artigos de uma citação por estrutura.
  async function conferirEstrutura(editalId, citacaoId, { conferida } = {}) {
    if (typeof conferida !== "boolean") throw new AppError(400, 'Indique "conferida": true ou false.');
    const edital = eUuid(editalId) ? await Edital.findByPk(editalId, { attributes: ["id", "data_publicacao"], raw: true }) : null;
    if (!edital) throw new AppError(404, "Edital não encontrado.");
    const citacao = eUuid(citacaoId)
      ? await ItemNorma.findOne({
          where: { id: citacaoId },
          include: [{ model: EditalItem, as: "item", where: { edital_id: editalId, status: "aprovado" }, attributes: ["id"] }]
        })
      : null;
    if (!citacao) throw new AppError(404, "Citação não encontrada entre os itens aprovados deste edital.");
    if (!conferida) {
      await citacao.update({ estrutura_conferida: null });
    } else {
      if (abrangenciaDe(citacao) !== "estrutura") throw new AppError(400, "Esta citação não é por título, capítulo ou seção.");
      const { escolha, artigos } = citacao.norma_id ? await carregadorDeNormas(edital.data_publicacao)(citacao.norma_id) : {};
      if (!escolha) throw new AppError(409, "A norma precisa de texto dividido em artigos antes da conferência.");
      const { numeros } = resolverEstrutura(citacao.artigos_texto, artigos);
      if (numeros.length === 0) throw new AppError(409, "Nenhum artigo achado pela estrutura: corrija o trecho na revisão.");
      await citacao.update({
        estrutura_conferida: { texto: citacao.artigos_texto, versao_id: escolha.versao.id, artigos: numeros, conferida_em: agora().toISOString() }
      });
    }
    const atualizada = await ItemNorma.findByPk(citacao.id, { raw: true });
    return cobrirCitacao(atualizada, carregadorDeNormas(edital.data_publicacao), edital.data_publicacao);
  }

  // As questões das provas escolhidas para o edital (etapa 3c) que caem em cada artigo, pela classificação por norma
  // e artigo. Descartadas e não jurídicas ficam de fora.
  async function anexarQuestoes(editalId, disciplinas) {
    const linhas = await sequelize.query(
      `SELECT qa.norma_id, qa.artigo, qa.papel, q.id AS questao_id, q.numero, p.id AS prova_id, p.ano, p.banca
         FROM questao_artigo qa
         JOIN prova_questao q ON q.id = qa.questao_id AND q.status <> 'descartada' AND q.classificacao_status <> 'nao_juridica'
         JOIN prova p ON p.id = q.prova_id
         JOIN edital_prova ep ON ep.prova_id = p.id AND ep.edital_id = :editalId
        ORDER BY p.ano DESC NULLS LAST, q.numero`,
      { replacements: { editalId }, type: sequelize.QueryTypes.SELECT }
    );
    const porArtigo = new Map();
    for (const l of linhas) {
      const chave = `${l.norma_id}|${l.artigo}`;
      if (!porArtigo.has(chave)) porArtigo.set(chave, []);
      porArtigo.get(chave).push({ questao_id: l.questao_id, prova_id: l.prova_id, numero: l.numero, ano: l.ano, banca: l.banca, papel: l.papel });
    }
    for (const citacao of disciplinas.flatMap((d) => d.itens.flatMap((i) => i.citacoes))) {
      if (!citacao.norma) continue;
      const artigos = [...citacao.artigos, ...(citacao.estrutura?.partes || []).flatMap((p) => p.artigos)];
      for (const artigo of artigos) artigo.questoes = porArtigo.get(`${citacao.norma.id}|${artigo.numero}`) || [];
    }
  }

  return { cobertura, conferirEstrutura };
}

function resumir(disciplinas) {
  const citacoes = disciplinas.flatMap((d) => d.itens.flatMap((i) => i.citacoes));
  const artigos = citacoes.flatMap((c) => c.artigos);
  const contar = (lista, campo, valor) => lista.filter((x) => x[campo] === valor).length;
  return {
    citacoes: citacoes.length,
    sem_identidade: contar(citacoes, "situacao", "sem_identidade"),
    sem_texto: citacoes.filter((c) => ["sem_texto", "texto_nao_dividido"].includes(c.situacao)).length,
    estrutura_pendente: citacoes.filter((c) => c.estrutura && !c.estrutura.conferida).length,
    artigos: artigos.length,
    encontrados: contar(artigos, "situacao", "encontrado"),
    revogados: contar(artigos, "situacao", "revogado"),
    faltando: contar(artigos, "situacao", "faltando"),
    alterados_depois: contar(artigos, "vigencia", "depois"),
    talvez_alterados_depois: contar(artigos, "vigencia", "talvez"),
    // Artigos pedidos que já caíram em alguma questão das provas escolhidas, e as questões distintas.
    artigos_com_questoes: artigos.filter((a) => a.questoes?.length).length,
    questoes: new Set(artigos.flatMap((a) => (a.questoes || []).map((q) => q.questao_id))).size
  };
}

module.exports = { criarCoberturaService, abrangenciaDe, versaoDoEdital };
