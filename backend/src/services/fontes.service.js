"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const logger = require("../shared/logger");
const { proporIdentidade, chaveDe } = require("./identidade-da-norma");
const { criarDivisaoService } = require("./divisao.service");
const { criarColetor } = require("./coletor.service");

// Fontes das normas de um edital e biblioteca de normas (etapa 2a-1).
//
// - As normas entram pela revisão: só as citações de itens APROVADOS (decisão do orientador, 2026-10-22).
// - A identidade de cada norma é proposta por código (identidade-da-norma.js) e confirmada pelo orientador; ao
//   confirmar, a norma entra na biblioteca (uma por chave, compartilhada entre editais) e as citações ficam ligadas.
// - A URL oficial é informada pelo orientador, e só de domínio oficial. Para achá-la, o sistema monta uma busca no
//   Google restrita aos domínios oficiais (decisão do orientador, 2026-10-29: a busca na web da IA era lenta e trazia
//   páginas erradas, e saiu). O orientador pode mudar a busca e enviar o texto achado em outro site em que confie.
// - O texto vem por upload manual: cada arquivo com conteúdo diferente é uma versão nova. O coletor (etapa 2a-2,
//   coletor.service.js) ficou fora da tela (decisão do orientador, 2026-10-29): o Planalto corta a conexão e o Senado
//   responde com uma verificação de segurança. Ele continua aqui, em `coletar` e na rota POST /normas/:id/coletar.

const DOMINIOS_OFICIAIS = [".gov.br", ".leg.br", ".jus.br"];
// Arquivos aceitos no upload: a página salva pelo navegador, o PDF ou o texto.
const EXTENSOES = { ".html": "text/html", ".htm": "text/html", ".pdf": "application/pdf", ".txt": "text/plain" };

// "Lei nº 9.099 1995 (site:gov.br OR site:leg.br OR site:jus.br)": a identidade da norma e os domínios oficiais.
function buscaNoGoogle(norma) {
  // Sem número, vai o nome; o tipo fica de fora quando o nome já o traz ("Constituição Federal").
  const semTipo = !norma.numero && norma.nome?.startsWith(norma.tipo);
  const identidade = norma.numero
    ? [norma.tipo, `nº ${norma.numero}`, norma.ano]
    : [semTipo ? null : norma.tipo, norma.nome, norma.ano];
  const sites = DOMINIOS_OFICIAIS.map((dominio) => `site:${dominio.slice(1)}`).join(" OR ");
  const q = `${identidade.filter(Boolean).join(" ")} (${sites})`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function urlOficial(texto) {
  let url;
  try {
    url = new URL(String(texto ?? "").trim());
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  return DOMINIOS_OFICIAIS.some((dominio) => host.endsWith(dominio)) ? url.toString() : null;
}

function esferaDe(jurisdicao) {
  if (jurisdicao === "BR") return "federal";
  return /^[A-Z]{2}$/.test(jurisdicao) ? "estadual" : "tribunal";
}

// Quando a alteração de uma nota aconteceu em relação à data de publicação do edital: "depois", "antes" ou "talvez"
// (a nota só traz o ano, e é o mesmo ano do edital).
function quandoFoiAlterado(data, dataDoEdital) {
  if (data.precisao === "dia") return data.valor > dataDoEdital ? "depois" : "antes";
  const ano = Number(data.valor.slice(0, 4));
  const anoDoEdital = Number(dataDoEdital.slice(0, 4));
  if (ano === anoDoEdital) return "talvez";
  return ano > anoDoEdital ? "depois" : "antes";
}

function criarFontesService({
  sequelize,
  dirNormas,
  agora = () => new Date(),
  divisao = criarDivisaoService({ sequelize, dirNormas, agora }),
  coletor = criarColetor({ sequelize, urlPermitida: (url) => urlOficial(url) !== null })
}) {
  const { Edital, EditalItem, ItemNorma, Norma, NormaVersao, NormaArtigo } = sequelize.models;

  // Alerta de vigência (decisão do orientador, 2026-10-23): o texto enviado pode ser mais novo que o edital. Conta os
  // artigos da versão mais recente com alteração (Redação dada, Incluído, Revogado...) depois da publicação do edital,
  // e quais deles o edital cobra. O detalhe por artigo aparece na cobertura (etapa 2c).
  async function vigencia(normaId, dataDoEdital, citados) {
    if (!dataDoEdital) return null;
    const versao = await NormaVersao.findOne({ where: { norma_id: normaId }, order: [["created_at", "DESC"]], attributes: ["id"] });
    if (!versao) return null;
    const artigos = await NormaArtigo.findAll({ where: { versao_id: versao.id }, attributes: ["numero", "notas"], raw: true });
    const depois = [];
    const talvez = [];
    for (const artigo of artigos) {
      const quando = (artigo.notas || []).filter((n) => n.alteracao && n.data).map((n) => quandoFoiAlterado(n.data, dataDoEdital));
      if (quando.includes("depois")) depois.push(artigo.numero);
      else if (quando.includes("talvez")) talvez.push(artigo.numero);
    }
    return {
      dataDoEdital,
      alteradosDepois: depois.length,
      talvezDepois: talvez.length,
      citadosAlteradosDepois: depois.filter((n) => citados.has(n)),
      citadosTalvezDepois: talvez.filter((n) => citados.has(n))
    };
  }

  async function editalExistente(id) {
    const edital = eUuid(id) ? await Edital.findByPk(id, { attributes: ["id", "status", "data_publicacao"] }) : null;
    if (!edital) throw new AppError(404, "Edital não encontrado.");
    return edital;
  }

  async function normaExistente(id) {
    const norma = eUuid(id) ? await Norma.findByPk(id) : null;
    if (!norma) throw new AppError(404, "Norma não encontrada na biblioteca.");
    return norma;
  }

  async function resumoDaNorma(norma) {
    const versoes = await NormaVersao.findAll({
      where: { norma_id: norma.id },
      attributes: { exclude: ["arquivo_caminho", "updated_at"] },
      order: [["created_at", "DESC"]],
      raw: true
    });
    return { ...norma.get({ plain: true }), versoes, busca_google: buscaNoGoogle(norma) };
  }

  // As normas citadas nos itens aprovados, agrupadas: pela norma da biblioteca quando a citação já foi ligada, ou
  // pela identidade proposta quando ainda falta confirmar.
  async function listar(editalId) {
    const edital = await editalExistente(editalId);
    const citacoes = await ItemNorma.findAll({
      include: [{ model: EditalItem, as: "item", where: { edital_id: editalId, status: "aprovado" }, attributes: ["id", "texto"] }],
      order: [[{ model: EditalItem, as: "item" }, "ordem", "ASC"], ["ordem", "ASC"]]
    });

    const grupos = new Map();
    for (const citacao of citacoes) {
      const proposta = proporIdentidade(citacao, citacao.item.texto);
      const chaveDoGrupo = citacao.norma_id ? `norma:${citacao.norma_id}` : `proposta:${proposta.chave}`;
      if (!grupos.has(chaveDoGrupo)) {
        grupos.set(chaveDoGrupo, { chave: chaveDoGrupo, normaId: citacao.norma_id, proposta, citacoes: [] });
      }
      grupos.get(chaveDoGrupo).citacoes.push({
        id: citacao.id,
        item_id: citacao.item.id,
        item_texto: citacao.item.texto,
        tipo: citacao.tipo,
        numero: citacao.numero,
        ano: citacao.ano,
        nome: citacao.nome,
        artigos_texto: citacao.artigos_texto,
        // Os artigos pedidos, como o parser expandiu o trecho do edital.
        artigos: (citacao.artigos?.artigos || []).map((a) => a.numero)
      });
    }

    const resultado = [];
    for (const grupo of grupos.values()) {
      // Ligado: a norma da biblioteca. Não ligado: a norma da biblioteca que já tem a chave proposta, se houver.
      const norma = grupo.normaId
        ? await Norma.findByPk(grupo.normaId)
        : await Norma.findOne({ where: { chave: grupo.proposta.chave } });
      resultado.push({
        chave: grupo.chave,
        confirmada: Boolean(grupo.normaId),
        proposta: grupo.normaId ? null : grupo.proposta,
        norma: norma ? await resumoDaNorma(norma) : null,
        citacoes: grupo.citacoes,
        vigencia: grupo.normaId
          ? await vigencia(grupo.normaId, edital.data_publicacao, new Set(grupo.citacoes.flatMap((c) => c.artigos)))
          : null
      });
    }
    return resultado;
  }

  // Confirma a identidade de um grupo de citações: acha a norma na biblioteca pela chave, ou cria, e liga as citações.
  async function confirmar(editalId, { citacoes, ...campos }) {
    await editalExistente(editalId);
    if (!Array.isArray(citacoes) || citacoes.length === 0 || !citacoes.every(eUuid)) {
      throw new AppError(400, "Indique as citações a confirmar.");
    }
    const identidade = identidadeValida(campos);

    return sequelize.transaction(async (transaction) => {
      const doEdital = await ItemNorma.findAll({
        where: { id: citacoes },
        include: [{ model: EditalItem, as: "item", where: { edital_id: editalId, status: "aprovado" }, attributes: ["id"] }],
        transaction
      });
      if (doEdital.length !== citacoes.length) throw new AppError(404, "Citação não encontrada entre os itens aprovados deste edital.");

      const { norma } = await acharOuCriar(identidade, transaction);
      await ItemNorma.update({ norma_id: norma.id }, { where: { id: citacoes }, transaction });
      return resumoDaNorma(norma);
    });
  }

  // A identidade digitada pelo orientador (na confirmação das Fontes ou na inclusão direta na biblioteca), validada.
  function identidadeValida({ jurisdicao, tipo, numero, ano, nome }) {
    const texto = (valor) => (typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null);
    const identidade = { jurisdicao: texto(jurisdicao)?.toUpperCase(), tipo: texto(tipo), numero: texto(numero), ano: texto(ano) };
    if (!identidade.jurisdicao || !/^[A-Z]{2,10}$/.test(identidade.jurisdicao)) {
      throw new AppError(400, 'A jurisdição precisa ser "BR", a sigla do estado ("SP") ou a do tribunal ("TJSP").');
    }
    if (!identidade.tipo) throw new AppError(400, "O tipo da norma não pode ficar vazio.");
    if (identidade.ano && !/^\d{4}$/.test(identidade.ano)) throw new AppError(400, "O ano precisa ter 4 dígitos.");
    if (!texto(nome)) throw new AppError(400, "O nome da norma não pode ficar vazio.");
    return { ...identidade, nome: texto(nome) };
  }

  // A norma da biblioteca com a chave da identidade; se não existe, cria. Uma norma por chave.
  async function acharOuCriar(identidade, transaction) {
    const chave = chaveDe(identidade);
    const existente = await Norma.findOne({ where: { chave }, transaction });
    if (existente) return { norma: existente, jaExistia: true };
    const norma = await Norma.create(
      {
        id: crypto.randomUUID(),
        chave,
        tipo: identidade.tipo,
        numero: identidade.numero,
        ano: identidade.ano,
        nome: identidade.nome,
        jurisdicao: identidade.jurisdicao,
        esfera: esferaDe(identidade.jurisdicao)
      },
      { transaction }
    );
    return { norma, jaExistia: false };
  }

  // Inclusão direta na biblioteca, sem edital (para preparar a biblioteca antes do edital chegar). Com a chave já na
  // biblioteca, não cria outra: devolve a existente (jaExistia).
  async function incluir(campos) {
    const identidade = identidadeValida(campos || {});
    const { norma, jaExistia } = await sequelize.transaction((transaction) => acharOuCriar(identidade, transaction));
    return { norma: await resumoDaNorma(norma), jaExistia };
  }

  // Desfaz a ligação (identidade confirmada errada). A norma continua na biblioteca.
  async function desligar(editalId, { citacoes }) {
    await editalExistente(editalId);
    if (!Array.isArray(citacoes) || !citacoes.every(eUuid)) throw new AppError(400, "Indique as citações.");
    const doEdital = await ItemNorma.findAll({
      where: { id: citacoes },
      include: [{ model: EditalItem, as: "item", where: { edital_id: editalId }, attributes: ["id"] }]
    });
    await ItemNorma.update({ norma_id: null }, { where: { id: doEdital.map((c) => c.id) } });
    return { desligadas: doEdital.length };
  }

  // Corrige o nome (decisão de 2026-10-27). O nome é texto livre, fora da chave: versões, artigos e citações não mudam.
  // A biblioteca é de todos, então o nome novo vale para todas as equipes.
  async function renomear(normaId, { nome }) {
    const norma = await normaExistente(normaId);
    const texto = typeof nome === "string" ? nome.trim() : "";
    if (!texto) throw new AppError(400, "O nome da norma não pode ficar vazio.");
    await norma.update({ nome: texto });
    return resumoDaNorma(norma);
  }

  async function definirUrl(normaId, { url }) {
    const norma = await normaExistente(normaId);
    if (url === null || url === "") {
      await norma.update({ url_oficial: null, url_fonte: null });
      return resumoDaNorma(norma);
    }
    const oficial = urlOficial(url);
    if (!oficial) throw new AppError(400, "A URL precisa ser de um domínio oficial (.gov.br, .leg.br ou .jus.br).");
    await norma.update({ url_oficial: oficial, url_fonte: "orientador" });
    return resumoDaNorma(norma);
  }

  // Baixa de novo o texto da URL já informada (a norma foi alterada, ou a tentativa anterior falhou).
  async function coletar(normaId) {
    const norma = await normaExistente(normaId);
    if (!norma.url_oficial) throw new AppError(400, "Informe a URL oficial antes de baixar o texto.");
    const coleta = await coletarDaUrl(norma);
    return { ...(await resumoDaNorma(norma)), coleta };
  }

  // { status, mensagem }: "obtido" (versão nova), "igual" (o texto da URL é o de uma versão que já existe), "sem_artigos"
  // (a página não é o texto da norma: nada fica guardado) ou o status do coletor ("falhou", "vazio", "vedado_robots").
  async function coletarDaUrl(norma) {
    const resultado = await coletor.coletar(norma.url_oficial);
    if (resultado.status !== "obtido") return { status: resultado.status, mensagem: resultado.mensagem };
    const { versaoId, jaExistia } = await guardarVersao(norma, {
      buffer: resultado.buffer,
      extensao: resultado.extensao,
      origem: "coleta",
      status: "obtido",
      url: resultado.url
    });
    if (jaExistia) return { status: "igual", mensagem: "O texto da URL é igual ao de uma versão que já existe." };

    const versao = await NormaVersao.findByPk(versaoId);
    if (!versao.artigos_total) {
      // Sem artigos, a página não é o texto da norma (uma lista, uma página que depende de JavaScript...). Guardada,
      // ela seria a versão mais recente da norma.
      await NormaArtigo.destroy({ where: { versao_id: versaoId } });
      await versao.destroy();
      fs.rmSync(path.join(dirNormas, versao.arquivo_caminho), { force: true });
      return {
        status: "sem_artigos",
        mensagem: "A página baixada não tem artigos: não parece ser o texto da norma. Confira a URL ou envie o texto."
      };
    }
    return { status: "obtido", mensagem: `Texto baixado da URL: ${versao.artigos_total} artigos.` };
  }

  // Upload manual do texto da norma. O mesmo conteúdo (sha256) enviado de novo devolve a versão que já existe.
  async function enviarVersao(normaId, { buffer, nomeArquivo }) {
    const norma = await normaExistente(normaId);
    const extensao = path.extname(String(nomeArquivo || "")).toLowerCase();
    if (!buffer || buffer.length === 0) throw new AppError(400, "O arquivo está vazio.");
    if (!EXTENSOES[extensao]) {
      throw new AppError(400, "Envie a página salva pelo navegador (.html ou .htm), um PDF ou um .txt.");
    }
    if (extensao === ".pdf" && buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new AppError(400, "O arquivo tem extensão .pdf, mas não é um PDF.");
    }

    const { jaExistia } = await guardarVersao(norma, { buffer, extensao, origem: "upload", status: "upload_recebido", url: norma.url_oficial });
    return { norma: await resumoDaNorma(norma), jaExistia };
  }

  // Guarda o arquivo como versão nova da norma e divide em artigos. O mesmo conteúdo (sha256) devolve a versão que
  // já existe. A divisão não desfaz a versão se falhar: o arquivo fica guardado, com o erro como aviso, e pode ser
  // processado de novo.
  async function guardarVersao(norma, { buffer, extensao, origem, status, url }) {
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const existente = await NormaVersao.findOne({ where: { norma_id: norma.id, sha256 } });
    if (existente) return { versaoId: existente.id, jaExistia: true };
    const id = crypto.randomUUID();
    const relativo = path.join(norma.id, `${id}${extensao}`);
    const caminho = path.join(dirNormas, relativo);
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    fs.writeFileSync(caminho, buffer);
    try {
      await NormaVersao.create({
        id,
        norma_id: norma.id,
        url,
        origem,
        status,
        // A data de acesso é a do envio ou da coleta. A data da versão vem das notas de redação, na divisão.
        acessado_em: agora(),
        sha256,
        arquivo_caminho: relativo
      });
    } catch (erro) {
      fs.rmSync(caminho, { force: true });
      throw erro;
    }
    try {
      await divisao.processarVersao(id);
    } catch (erro) {
      logger.error({ err: erro, versaoId: id }, "divisão da versão em artigos falhou");
      await NormaVersao.update({ avisos: [`A divisão em artigos falhou: ${erro.message}`] }, { where: { id } });
    }
    return { versaoId: id, jaExistia: false };
  }

  // Divide de novo uma versão já guardada (o parser melhorou, ou o upload é anterior à etapa 2b).
  async function processarVersao(normaId, versaoId) {
    const versao = eUuid(versaoId) ? await NormaVersao.findOne({ where: { id: versaoId, norma_id: normaId } }) : null;
    if (!versao) throw new AppError(404, "Versão não encontrada nesta norma.");
    await divisao.processarVersao(versao.id);
    return resumoDaNorma(await normaExistente(normaId));
  }

  async function arquivoDaVersao(normaId, versaoId) {
    const versao = eUuid(versaoId) ? await NormaVersao.findOne({ where: { id: versaoId, norma_id: normaId } }) : null;
    if (!versao || !versao.arquivo_caminho) throw new AppError(404, "Versão sem arquivo.");
    const extensao = path.extname(versao.arquivo_caminho);
    return { caminho: path.join(dirNormas, versao.arquivo_caminho), tipo: EXTENSOES[extensao] || "application/octet-stream" };
  }

  // Os editais da equipe que citam a norma (pelas citações ligadas a ela), para a biblioteca mostrar onde ela é usada.
  // A norma é de todos; os editais, só da equipe (etapa 4a).
  async function editaisQueCitam(normaId, equipeId) {
    const citacoes = await ItemNorma.findAll({
      where: { norma_id: normaId },
      attributes: ["id"],
      include: [
        {
          model: EditalItem,
          as: "item",
          attributes: ["edital_id"],
          required: true,
          include: [{ model: Edital, as: "edital", where: { equipe_id: equipeId }, attributes: ["id", "arquivo_nome", "cargo", "orgao"] }]
        }
      ]
    });
    const editais = new Map(citacoes.map((c) => [c.item.edital.id, c.item.edital.get({ plain: true })]));
    return [...editais.values()];
  }

  async function biblioteca(equipeId) {
    const normas = await Norma.findAll({ order: [["nome", "ASC"]] });
    return Promise.all(normas.map(async (norma) => ({ ...(await resumoDaNorma(norma)), editais: await editaisQueCitam(norma.id, equipeId) })));
  }

  async function detalharNorma(normaId, equipeId) {
    const norma = await normaExistente(normaId);
    return { ...(await resumoDaNorma(norma)), editais: await editaisQueCitam(norma.id, equipeId) };
  }

  // Os artigos de uma versão, na ordem do texto (a biblioteca mostra a norma como documento).
  async function artigosDaVersao(normaId, versaoId) {
    const versao = eUuid(versaoId) ? await NormaVersao.findOne({ where: { id: versaoId, norma_id: normaId } }) : null;
    if (!versao) throw new AppError(404, "Versão não encontrada nesta norma.");
    return NormaArtigo.findAll({
      where: { versao_id: versao.id },
      attributes: ["id", "numero", "ordem", "caput", "texto_bruto", "notas", "revogado", "estrutura", "redacao_anterior"],
      order: [["ordem", "ASC"]],
      raw: true
    });
  }

  return {
    listar,
    confirmar,
    incluir,
    desligar,
    renomear,
    definirUrl,
    coletar,
    enviarVersao,
    processarVersao,
    arquivoDaVersao,
    biblioteca,
    detalharNorma,
    artigosDaVersao
  };
}

module.exports = { criarFontesService, urlOficial, buscaNoGoogle, quandoFoiAlterado };
