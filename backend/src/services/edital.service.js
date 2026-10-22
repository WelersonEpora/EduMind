"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const pdfTexto = require("./pdf-texto");

// Recebe o PDF do edital, guarda o arquivo original e o texto de cada página.
// A extração de metadados e da árvore com IA (etapa 1b) parte do que é gravado aqui.
//
// O mesmo PDF enviado duas vezes (mesmo SHA-256) não cria outro edital: devolve o existente.

const CAMPOS_DA_LISTA = [
  "id", "arquivo_nome", "arquivo_bytes", "total_paginas", "banca", "orgao", "cargo", "data_publicacao",
  "status", "created_at", "updated_at"
];

function criarEditalService({ sequelize, dirUploads, lerPaginas = pdfTexto.lerPaginas }) {
  const { Edital, EditalPagina, EditalItem, ItemNorma } = sequelize.models;

  async function buscar(id) {
    const edital = eUuid(id)
      ? await Edital.findByPk(id, { attributes: [...CAMPOS_DA_LISTA, "metadados", "erro"], raw: true })
      : null;
    if (!edital) throw new AppError(404, "Edital não encontrado.");
    return edital;
  }

  function listar() {
    return Edital.findAll({ attributes: CAMPOS_DA_LISTA, order: [["created_at", "DESC"]], raw: true });
  }

  async function criarAPartirDoPdf({ buffer, nomeArquivo }) {
    if (!buffer || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new AppError(400, "O arquivo enviado não é um PDF.");
    }
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const existente = await Edital.findOne({ where: { arquivo_sha256: sha256 }, attributes: ["id"] });
    if (existente) return { edital: await buscar(existente.id), jaExistia: true };

    let paginas;
    try {
      paginas = await lerPaginas(buffer);
    } catch (erro) {
      throw new AppError(422, `Não foi possível ler o PDF: ${erro.message}`);
    }
    if (paginas.length === 0 || paginas.every((p) => p.texto === "")) {
      throw new AppError(422, "O PDF não tem texto selecionável (parece escaneado). Envie uma versão com texto.");
    }

    const id = crypto.randomUUID();
    const caminho = path.join(dirUploads, `${id}.pdf`);
    fs.mkdirSync(dirUploads, { recursive: true });
    fs.writeFileSync(caminho, buffer);

    try {
      await sequelize.transaction(async (transaction) => {
        await Edital.create(
          { id, arquivo_nome: nomeArquivo, arquivo_sha256: sha256, arquivo_bytes: buffer.length, total_paginas: paginas.length },
          { transaction }
        );
        await EditalPagina.bulkCreate(
          paginas.map((p) => ({ edital_id: id, numero: p.numero, texto: p.texto })),
          { transaction }
        );
      });
    } catch (erro) {
      fs.rmSync(caminho, { force: true });
      throw erro;
    }
    return { edital: await buscar(id), jaExistia: false };
  }

  async function pagina(id, numero) {
    await buscar(id);
    const encontrada = Number.isInteger(numero)
      ? await EditalPagina.findOne({ where: { edital_id: id, numero }, attributes: ["numero", "texto"], raw: true })
      : null;
    if (!encontrada) throw new AppError(404, `Página ${numero} não existe neste edital.`);
    return encontrada;
  }

  // Árvore do conteúdo programático em lista, na ordem de leitura (cada item seguido dos seus filhos), com as normas
  // de cada item. A tela monta a árvore por parent_id.
  async function conteudo(id) {
    await buscar(id);
    const itens = await EditalItem.findAll({
      where: { edital_id: id },
      attributes: { exclude: ["edital_id", "created_at", "updated_at"] },
      include: [{ model: ItemNorma, as: "normas", attributes: { exclude: ["item_id", "created_at", "updated_at"] } }],
      order: [["ordem", "ASC"], [{ model: ItemNorma, as: "normas" }, "ordem", "ASC"]]
    });
    const filhos = new Map();
    for (const item of itens.map((i) => i.get({ plain: true }))) {
      if (!filhos.has(item.parent_id)) filhos.set(item.parent_id, []);
      filhos.get(item.parent_id).push(item);
    }
    const emOrdem = [];
    const percorrer = (parentId) => {
      for (const item of filhos.get(parentId) || []) {
        emOrdem.push(item);
        percorrer(item.id);
      }
    };
    percorrer(null);
    return emOrdem;
  }

  async function caminhoDoArquivo(id) {
    await buscar(id);
    return path.join(dirUploads, `${id}.pdf`);
  }

  return { listar, buscar, criarAPartirDoPdf, pagina, conteudo, caminhoDoArquivo };
}

module.exports = { criarEditalService };
