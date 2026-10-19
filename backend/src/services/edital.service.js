"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { emTransacao } = require("../db");
const { AppError } = require("../shared/errors");
const pdfTexto = require("./pdf-texto");

// Recebe o PDF do edital, guarda o arquivo original e o texto de cada página.
// A extração de metadados e da árvore com IA (etapa 1b) parte do que é gravado aqui.
//
// O mesmo PDF enviado duas vezes (mesmo SHA-256) não cria outro edital: devolve o existente.

const CAMPOS_DA_LISTA = `id, arquivo_nome, arquivo_bytes, total_paginas, banca, orgao, cargo, data_publicacao,
  status, created_at, updated_at`;

function criarEditalService({ db, dirUploads, lerPaginas = pdfTexto.lerPaginas, agora = () => new Date().toISOString() }) {
  function buscar(id) {
    const edital = db.prepare(`SELECT ${CAMPOS_DA_LISTA}, metadados_json, erro FROM edital WHERE id = ?`).get(id);
    if (!edital) throw new AppError(404, "Edital não encontrado.");
    const { metadados_json: metadados, ...resto } = edital;
    return { ...resto, metadados: metadados ? JSON.parse(metadados) : null };
  }

  function listar() {
    return db.prepare(`SELECT ${CAMPOS_DA_LISTA} FROM edital ORDER BY created_at DESC`).all();
  }

  async function criarAPartirDoPdf({ buffer, nomeArquivo }) {
    if (!buffer || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new AppError(400, "O arquivo enviado não é um PDF.");
    }
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const existente = db.prepare("SELECT id FROM edital WHERE arquivo_sha256 = ?").get(sha256);
    if (existente) return { edital: buscar(existente.id), jaExistia: true };

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

    const momento = agora();
    try {
      emTransacao(db, () => {
        db.prepare(
          `INSERT INTO edital (id, arquivo_nome, arquivo_sha256, arquivo_bytes, total_paginas, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'texto_extraido', ?, ?)`
        ).run(id, nomeArquivo, sha256, buffer.length, paginas.length, momento, momento);
        const inserirPagina = db.prepare("INSERT INTO edital_pagina (edital_id, numero, texto) VALUES (?, ?, ?)");
        for (const pagina of paginas) inserirPagina.run(id, pagina.numero, pagina.texto);
      });
    } catch (erro) {
      fs.rmSync(caminho, { force: true });
      throw erro;
    }
    return { edital: buscar(id), jaExistia: false };
  }

  function pagina(id, numero) {
    buscar(id);
    const encontrada = db.prepare("SELECT numero, texto FROM edital_pagina WHERE edital_id = ? AND numero = ?").get(id, numero);
    if (!encontrada) throw new AppError(404, `Página ${numero} não existe neste edital.`);
    return { ...encontrada };
  }

  function caminhoDoArquivo(id) {
    buscar(id);
    return path.join(dirUploads, `${id}.pdf`);
  }

  return { listar, buscar, criarAPartirDoPdf, pagina, caminhoDoArquivo };
}

module.exports = { criarEditalService };
