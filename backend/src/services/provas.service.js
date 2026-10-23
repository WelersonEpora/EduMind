"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const pdfTexto = require("./pdf-texto");
const { textoSemMarcaDagua } = require("./texto-da-prova");

// Biblioteca de provas anteriores (etapa 3a).
//
// - O sistema não baixa provas nem acessa sites de provas: monta links de busca no Google (restritos ao PCI
//   Concursos, ao Estudegratis e um aberto) a partir do edital. O orientador baixa e envia o PDF e o gabarito.
// - As provas ficam numa biblioteca compartilhada; cada edital escolhe as que usa (edital_prova).
// - O gabarito vem com a origem marcada: oficial definitivo, oficial preliminar ou não oficial.
// - PDF sem texto selecionável (escaneado) é aceito, mas fica marcado: a leitura das questões vai precisar de texto.

const SITUACOES_DO_GABARITO = ["oficial_definitivo", "oficial_preliminar", "nao_oficial"];
const FONTES_DE_BUSCA = [
  { fonte: "PCI Concursos", site: "pciconcursos.com.br" },
  { fonte: "Estudegratis", site: "estudegratis.com.br" },
  { fonte: "Google", site: null }
];
const MAXIMO_DE_NORMAS_NAS_BUSCAS = 10;

const semAcento = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// "Fundação para o Vestibular da UNESP - VUNESP" -> "VUNESP" (a última sigla); sem sigla, o nome inteiro.
function nomeCurtoDaBanca(banca) {
  const siglas = String(banca ?? "").match(/\b[A-ZÀ-Ú]{3,}\b/g);
  return siglas ? siglas[siglas.length - 1] : String(banca ?? "").trim();
}

function linkDeBusca(consulta, site) {
  const q = site ? `site:${site} ${consulta}` : `${consulta} pdf`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

// As buscas sugeridas para um edital, da mais para a menos específica: o mesmo concurso em outros anos, o mesmo
// órgão em outros cargos e a mesma banca cobrando cada norma do edital.
function buscasDoEdital(edital, nomesDasNormas) {
  const banca = nomeCurtoDaBanca(edital.banca);
  const consultas = [];
  if (banca && edital.orgao && edital.cargo) {
    consultas.push({ descricao: "Mesmo concurso, outros anos", consulta: `${banca} prova "${edital.cargo}" ${edital.orgao} gabarito` });
  }
  if (banca && edital.orgao) {
    consultas.push({ descricao: "Mesmo órgão, outros cargos", consulta: `${banca} prova ${edital.orgao} gabarito` });
  }
  if (banca && edital.cargo) {
    consultas.push({ descricao: "Mesmo cargo, outros órgãos", consulta: `${banca} prova "${edital.cargo}" gabarito` });
  }
  for (const norma of nomesDasNormas.slice(0, MAXIMO_DE_NORMAS_NAS_BUSCAS)) {
    consultas.push({ descricao: `${banca || "Mesma banca"} cobrando: ${norma}`, consulta: `${banca} prova "${norma}" gabarito` });
  }
  return consultas.map(({ descricao, consulta }) => ({
    descricao,
    consulta,
    links: FONTES_DE_BUSCA.map(({ fonte, site }) => ({ fonte, url: linkDeBusca(consulta, site) }))
  }));
}

// O quanto uma prova da biblioteca serve ao edital: mesma banca pesa mais (o estilo), depois órgão e cargo.
function relevancia(prova, edital) {
  const mesmaBanca = Boolean(prova.banca && edital.banca) && semAcento(nomeCurtoDaBanca(prova.banca)) === semAcento(nomeCurtoDaBanca(edital.banca));
  const mesmoOrgao = Boolean(prova.orgao && edital.orgao) && semAcento(prova.orgao) === semAcento(edital.orgao);
  const mesmoCargo = Boolean(prova.cargo && edital.cargo) && semAcento(prova.cargo) === semAcento(edital.cargo);
  return { mesmaBanca, mesmoOrgao, mesmoCargo, pontos: (mesmaBanca ? 4 : 0) + (mesmoOrgao ? 2 : 0) + (mesmoCargo ? 1 : 0) };
}

function textoOpcional(valor) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  return texto === "" ? null : texto;
}

function urlOpcional(valor) {
  const texto = textoOpcional(valor);
  if (!texto) return null;
  let url;
  try {
    url = new URL(texto);
  } catch {
    throw new AppError(400, "O link de origem precisa ser um endereço completo (https://...).");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new AppError(400, "O link de origem precisa começar com http:// ou https://.");
  return url.toString();
}

function anoOpcional(valor, agora) {
  const texto = textoOpcional(valor);
  if (!texto) return null;
  const ano = Number(texto);
  if (!Number.isInteger(ano) || ano < 1980 || ano > agora().getFullYear() + 1) throw new AppError(400, "Ano da prova inválido.");
  return ano;
}

function situacaoDoGabarito(valor) {
  const texto = textoOpcional(valor);
  if (!texto) return null;
  if (!SITUACOES_DO_GABARITO.includes(texto)) {
    throw new AppError(400, 'A origem do gabarito precisa ser "oficial_definitivo", "oficial_preliminar" ou "nao_oficial".');
  }
  return texto;
}

function criarProvasService({ sequelize, dirProvas, lerPaginas = pdfTexto.lerPaginas, agora = () => new Date() }) {
  const { Edital, EditalItem, ItemNorma, Norma, Prova, ProvaArquivo, ProvaPagina, EditalProva, ProvaQuestao } = sequelize.models;

  async function provaExistente(id) {
    const prova = eUuid(id) ? await Prova.findByPk(id) : null;
    if (!prova) throw new AppError(404, "Prova não encontrada na biblioteca.");
    return prova;
  }

  async function editalExistente(id) {
    const edital = eUuid(id) ? await Edital.findByPk(id, { attributes: ["id", "banca", "orgao", "cargo"], raw: true }) : null;
    if (!edital) throw new AppError(404, "Edital não encontrado.");
    return edital;
  }

  async function resumoDaProva(prova) {
    const arquivos = await ProvaArquivo.findAll({
      where: { prova_id: prova.id },
      attributes: ["id", "tipo", "nome", "bytes", "origem_url", "total_paginas", "paginas_com_texto", "created_at"],
      raw: true
    });
    const editais = await EditalProva.findAll({ where: { prova_id: prova.id }, attributes: ["edital_id"], raw: true });
    // Quantas questões lidas, por status (etapa 3b).
    const porStatus = await ProvaQuestao.count({ where: { prova_id: prova.id }, group: ["status"] });
    const questoes = { valida: 0, a_revisar: 0, descartada: 0 };
    for (const { status, count } of porStatus) questoes[status] = Number(count);
    const porClassificacao = await ProvaQuestao.count({ where: { prova_id: prova.id }, group: ["classificacao_status"] });
    const classificadas = { classificada: 0, a_revisar: 0, nao_juridica: 0 };
    for (const { classificacao_status: status, count } of porClassificacao) if (status) classificadas[status] = Number(count);
    return {
      ...(prova.get ? prova.get({ plain: true }) : prova),
      prova: arquivos.find((a) => a.tipo === "prova") || null,
      gabarito: arquivos.find((a) => a.tipo === "gabarito") || null,
      editais: editais.map((e) => e.edital_id),
      questoes,
      classificadas
    };
  }

  // Lê e guarda um PDF (prova ou gabarito) com o texto de cada página. O mesmo arquivo não entra duas vezes.
  async function guardarPdf({ buffer, nomeArquivo, provaId, tipo, origemUrl, transaction }) {
    if (!buffer || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new AppError(400, "O arquivo enviado não é um PDF.");
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const repetido = await ProvaArquivo.findOne({ where: { sha256 }, attributes: ["prova_id", "tipo"], raw: true, transaction });
    if (repetido) return { repetido };

    let paginas;
    try {
      paginas = await lerPaginas(buffer);
    } catch (erro) {
      throw new AppError(422, `Não foi possível ler o PDF: ${erro.message}`);
    }
    const id = crypto.randomUUID();
    const caminho = path.join(dirProvas, `${id}.pdf`);
    fs.mkdirSync(dirProvas, { recursive: true });
    fs.writeFileSync(caminho, buffer);
    try {
      await ProvaArquivo.create(
        {
          id,
          prova_id: provaId,
          tipo,
          nome: textoOpcional(nomeArquivo) || `${tipo}.pdf`,
          caminho: `${id}.pdf`,
          sha256,
          bytes: buffer.length,
          origem_url: origemUrl,
          total_paginas: paginas.length,
          paginas_com_texto: paginas.filter((p) => textoSemMarcaDagua(p.texto).trim() !== "").length
        },
        { transaction }
      );
      await ProvaPagina.bulkCreate(
        paginas.map((p) => ({ arquivo_id: id, numero: p.numero, texto: p.texto })),
        { transaction }
      );
    } catch (erro) {
      fs.rmSync(caminho, { force: true });
      throw erro;
    }
    return { caminho };
  }

  async function biblioteca() {
    const provas = await Prova.findAll({ order: [["ano", "DESC NULLS LAST"], ["created_at", "DESC"]] });
    return Promise.all(provas.map(resumoDaProva));
  }

  // Nova prova na biblioteca, a partir do PDF. Se veio de um edital, já fica escolhida para ele.
  async function enviarProva({ buffer, nomeArquivo, campos = {}, editalId = null }) {
    if (editalId) await editalExistente(editalId);
    const dados = {
      banca: textoOpcional(campos.banca),
      orgao: textoOpcional(campos.orgao),
      cargo: textoOpcional(campos.cargo),
      ano: anoOpcional(campos.ano, agora),
      observacoes: textoOpcional(campos.observacoes)
    };
    const origemUrl = urlOpcional(campos.origem_url);

    // O mesmo PDF enviado de novo devolve a prova que já está na biblioteca (e a escolhe para o edital).
    if (buffer && buffer.length) {
      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      const repetido = await ProvaArquivo.findOne({ where: { sha256 }, attributes: ["prova_id", "tipo"], raw: true });
      if (repetido) {
        if (repetido.tipo === "gabarito") throw new AppError(409, "Este PDF já está na biblioteca como gabarito de uma prova.");
        if (editalId) await EditalProva.findOrCreate({ where: { edital_id: editalId, prova_id: repetido.prova_id } });
        return { prova: await resumoDaProva(await provaExistente(repetido.prova_id)), jaExistia: true };
      }
    }

    const id = crypto.randomUUID();
    let gravado = null;
    try {
      await sequelize.transaction(async (transaction) => {
        await Prova.create({ id, ...dados }, { transaction });
        const pdf = await guardarPdf({ buffer, nomeArquivo, provaId: id, tipo: "prova", origemUrl, transaction });
        if (pdf.repetido) throw new AppError(409, "Este PDF acabou de ser enviado. Recarregue a página.");
        gravado = pdf.caminho;
        if (editalId) await EditalProva.create({ edital_id: editalId, prova_id: id }, { transaction });
      });
    } catch (erro) {
      if (gravado) fs.rmSync(gravado, { force: true });
      throw erro;
    }
    return { prova: await resumoDaProva(await provaExistente(id)), jaExistia: false };
  }

  // O gabarito da prova. Um gabarito novo substitui o anterior.
  async function enviarGabarito(provaId, { buffer, nomeArquivo, campos = {} }) {
    const prova = await provaExistente(provaId);
    const situacao = situacaoDoGabarito(campos.gabarito_situacao);
    if (!situacao) throw new AppError(400, "Indique a origem do gabarito: oficial definitivo, oficial preliminar ou não oficial.");
    const origemUrl = urlOpcional(campos.origem_url);
    const anterior = await ProvaArquivo.findOne({ where: { prova_id: prova.id, tipo: "gabarito" } });
    let gravado = null;
    try {
      await sequelize.transaction(async (transaction) => {
        if (anterior) await anterior.destroy({ transaction });
        const pdf = await guardarPdf({ buffer, nomeArquivo, provaId: prova.id, tipo: "gabarito", origemUrl, transaction });
        if (pdf.repetido) {
          throw new AppError(409, pdf.repetido.prova_id === prova.id ? "Este PDF já está nesta prova." : "Este PDF já está na biblioteca em outra prova.");
        }
        gravado = pdf.caminho;
        await prova.update({ gabarito_situacao: situacao }, { transaction });
      });
      if (anterior) fs.rmSync(path.join(dirProvas, anterior.caminho), { force: true });
      return resumoDaProva(await provaExistente(prova.id));
    } catch (erro) {
      if (gravado) fs.rmSync(gravado, { force: true });
      throw erro;
    }
  }

  async function atualizar(provaId, campos = {}) {
    const prova = await provaExistente(provaId);
    const permitidos = ["banca", "orgao", "cargo", "ano", "gabarito_situacao", "observacoes"];
    const nomes = Object.keys(campos);
    if (nomes.length === 0) throw new AppError(400, "Nada para alterar.");
    const alteracoes = {};
    for (const nome of nomes) {
      if (!permitidos.includes(nome)) throw new AppError(400, `O campo "${nome}" não pode ser editado aqui.`);
      if (nome === "ano") alteracoes.ano = anoOpcional(campos.ano, agora);
      else if (nome === "gabarito_situacao") alteracoes.gabarito_situacao = situacaoDoGabarito(campos.gabarito_situacao);
      else alteracoes[nome] = textoOpcional(campos[nome]);
    }
    if ("gabarito_situacao" in alteracoes && !alteracoes.gabarito_situacao) {
      const temGabarito = await ProvaArquivo.count({ where: { prova_id: prova.id, tipo: "gabarito" } });
      if (temGabarito) throw new AppError(400, "Com gabarito enviado, a origem dele não pode ficar vazia.");
    }
    await prova.update(alteracoes);
    return resumoDaProva(prova);
  }

  async function excluir(provaId) {
    const prova = await provaExistente(provaId);
    const arquivos = await ProvaArquivo.findAll({ where: { prova_id: prova.id }, attributes: ["caminho"], raw: true });
    await prova.destroy();
    for (const arquivo of arquivos) fs.rmSync(path.join(dirProvas, arquivo.caminho), { force: true });
    return { excluida: prova.id };
  }

  async function arquivo(provaId, tipo) {
    const prova = await provaExistente(provaId);
    const encontrado = ["prova", "gabarito"].includes(tipo)
      ? await ProvaArquivo.findOne({ where: { prova_id: prova.id, tipo }, attributes: ["caminho"], raw: true })
      : null;
    if (!encontrado) throw new AppError(404, tipo === "gabarito" ? "Esta prova ainda não tem gabarito." : "Arquivo não encontrado.");
    return path.join(dirProvas, encontrado.caminho);
  }

  // As normas confirmadas nos itens aprovados do edital, para as buscas por norma.
  async function nomesDasNormas(editalId) {
    const citacoes = await ItemNorma.findAll({
      where: { norma_id: { [sequelize.Sequelize.Op.ne]: null } },
      attributes: ["norma_id"],
      include: [
        { model: EditalItem, as: "item", where: { edital_id: editalId, status: "aprovado" }, attributes: [] },
        { model: Norma, as: "norma", attributes: ["nome"] }
      ]
    });
    const contagem = new Map();
    for (const c of citacoes) contagem.set(c.norma.nome, (contagem.get(c.norma.nome) || 0) + 1);
    return [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([nome]) => nome);
  }

  // A área de provas do edital: as buscas sugeridas, as provas escolhidas e as demais da biblioteca, das mais às
  // menos relevantes.
  async function doEdital(editalId) {
    const edital = await editalExistente(editalId);
    const escolhidas = new Set((await EditalProva.findAll({ where: { edital_id: editalId }, attributes: ["prova_id"], raw: true })).map((e) => e.prova_id));
    const provas = (await biblioteca()).map((prova) => ({ ...prova, relevancia: relevancia(prova, edital) }));
    const porRelevancia = (a, b) => b.relevancia.pontos - a.relevancia.pontos || (b.ano || 0) - (a.ano || 0);
    return {
      edital,
      buscas: buscasDoEdital(edital, await nomesDasNormas(editalId)),
      escolhidas: provas.filter((p) => escolhidas.has(p.id)).sort(porRelevancia),
      outras: provas.filter((p) => !escolhidas.has(p.id)).sort(porRelevancia)
    };
  }

  async function escolher(editalId, provaId) {
    await editalExistente(editalId);
    const prova = await provaExistente(provaId);
    await EditalProva.findOrCreate({ where: { edital_id: editalId, prova_id: prova.id } });
    return doEdital(editalId);
  }

  async function desfazerEscolha(editalId, provaId) {
    await editalExistente(editalId);
    if (!eUuid(provaId)) throw new AppError(404, "Prova não encontrada na biblioteca.");
    await EditalProva.destroy({ where: { edital_id: editalId, prova_id: provaId } });
    return doEdital(editalId);
  }

  return { biblioteca, enviarProva, enviarGabarito, atualizar, excluir, arquivo, doEdital, escolher, desfazerEscolha };
}

module.exports = { criarProvasService, buscasDoEdital, nomeCurtoDaBanca, relevancia };
