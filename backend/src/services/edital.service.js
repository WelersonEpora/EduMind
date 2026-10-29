"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const pdfTexto = require("./pdf-texto");
const { calcularAndamento } = require("./andamento");
const { comCitacoes } = require("./arvore-do-edital");

// Recebe o PDF do edital, guarda o arquivo original e o texto de cada página.
// A extração de metadados e da árvore com IA (etapa 1b) parte do que é gravado aqui.
//
// O mesmo PDF enviado duas vezes à mesma equipe (mesmo SHA-256) não cria outro edital: devolve o existente. Cada
// equipe tem os seus editais (etapa 4a).

const CAMPOS_DA_LISTA = [
  "id", "arquivo_nome", "arquivo_bytes", "total_paginas", "banca", "orgao", "cargo", "data_publicacao",
  "status", "created_at", "updated_at"
];

function criarEditalService({ sequelize, dirUploads, lerPaginas = pdfTexto.lerPaginas }) {
  const { Edital, EditalPagina, EditalItem, ItemNorma, EditalAluno, Membro } = sequelize.models;

  // Os ids dos editais atribuídos ao aluno (etapa 4c): o aluno só vê esses.
  async function atribuidosAo(alunoId) {
    return (await EditalAluno.findAll({ where: { usuario_id: alunoId }, attributes: ["edital_id"], raw: true })).map((a) => a.edital_id);
  }

  async function buscar(id) {
    const edital = eUuid(id)
      ? await Edital.findByPk(id, { attributes: [...CAMPOS_DA_LISTA, "metadados", "erro"], raw: true })
      : null;
    if (!edital) throw new AppError(404, "Edital não encontrado.");
    return edital;
  }

  // Confere que o edital é da equipe; as rotas chamam antes de qualquer operação com o id (router.param). Para o
  // aluno (alunoId), o edital também precisa estar atribuído a ele; senão, 404, como se não existisse.
  async function daEquipe(id, equipeId, { alunoId } = {}) {
    const edital = eUuid(id) ? await Edital.findOne({ where: { id, equipe_id: equipeId }, attributes: ["id"], raw: true }) : null;
    const atribuido = edital && (!alunoId || (await EditalAluno.count({ where: { edital_id: id, usuario_id: alunoId } })) > 0);
    if (!atribuido) throw new AppError(404, "Edital não encontrado.");
  }

  // Cada edital vem com o andamento (andamento.js): a tela de editais mostra a situação e a casca do edital, os
  // pendentes nas abas. Os metadados só entram no cálculo; não vão na resposta.
  // Para o aluno (alunoId), só os editais atribuídos a ele.
  async function listar(equipeId, { alunoId } = {}) {
    const editais = await Edital.findAll({
      where: { equipe_id: equipeId, ...(alunoId && { id: await atribuidosAo(alunoId) }) },
      attributes: [...CAMPOS_DA_LISTA, "metadados"],
      order: [["created_at", "DESC"]],
      raw: true
    });
    const andamento = await calcularAndamento(sequelize, editais);
    return editais.map(({ metadados, ...edital }) => ({ ...edital, andamento: andamento.get(edital.id) }));
  }

  async function criarAPartirDoPdf({ buffer, nomeArquivo, equipeId }) {
    if (!buffer || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new AppError(400, "O arquivo enviado não é um PDF.");
    }
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const existente = await Edital.findOne({ where: { equipe_id: equipeId, arquivo_sha256: sha256 }, attributes: ["id"] });
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
          { id, equipe_id: equipeId, arquivo_nome: nomeArquivo, arquivo_sha256: sha256, arquivo_bytes: buffer.length, total_paginas: paginas.length },
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
  // de cada item e onde cada uma é citada no edital (citacao). A tela monta a árvore por parent_id.
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
    const paginas = await EditalPagina.findAll({ where: { edital_id: id }, attributes: ["numero", "texto"], raw: true });
    return comCitacoes(emOrdem, paginas);
  }

  async function caminhoDoArquivo(id) {
    await buscar(id);
    return path.join(dirUploads, `${id}.pdf`);
  }

  // Atribui o edital a alunos da equipe (etapa 4c; desde 2026-10-27 pela aba Alunos do edital). alunos: ids de
  // usuário, todos alunos ativos da equipe. Quem já via o edital continua vendo; nada sai daqui.
  async function atribuirAlunos(id, equipeId, { alunos } = {}) {
    if (!Array.isArray(alunos) || alunos.length === 0 || !alunos.every(eUuid)) throw new AppError(400, "Indique os alunos.");
    const ids = [...new Set(alunos)];
    await sequelize.transaction(async (transaction) => {
      const daEquipe = await Membro.count({ where: { equipe_id: equipeId, usuario_id: ids, papel: "aluno", ativo: true }, transaction });
      if (daEquipe !== ids.length) throw new AppError(404, "Aluno não encontrado nesta equipe.");
      const jaVeem = (await EditalAluno.findAll({ where: { edital_id: id, usuario_id: ids }, attributes: ["usuario_id"], raw: true, transaction })).map((a) => a.usuario_id);
      const novos = ids.filter((u) => !jaVeem.includes(u));
      await EditalAluno.bulkCreate(novos.map((u) => ({ edital_id: id, usuario_id: u })), { transaction });
    });
  }

  // Tira o edital do aluno: ele deixa de ver na hora. As respostas dele no simulador ficam guardadas.
  async function retirarAluno(id, alunoId) {
    const removidos = eUuid(alunoId) ? await EditalAluno.destroy({ where: { edital_id: id, usuario_id: alunoId } }) : 0;
    if (removidos === 0) throw new AppError(404, "Este aluno não vê este edital.");
  }

  return { daEquipe, listar, buscar, criarAPartirDoPdf, pagina, conteudo, caminhoDoArquivo, atribuirAlunos, retirarAluno };
}

module.exports = { criarEditalService };
