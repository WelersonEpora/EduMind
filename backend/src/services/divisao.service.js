"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const logger = require("../shared/logger");
const { linhasDoArquivo } = require("../parsers/texto-da-norma");
const { dividirEmArtigos } = require("../parsers/artigos-da-norma");

// Divisão de uma versão da norma em artigos (etapa 2b): lê o arquivo guardado, divide pelo parser e grava os artigos
// da versão (substituindo os de uma divisão anterior), com a data da versão: a alteração mais recente nas notas de
// redação, com a precisão que a nota permite (dia ou só o ano; com só o ano, grava 1º de janeiro).
//
// Roda depois de cada upload (e da coleta, na etapa 2a-2) e pode rodar de novo quando o parser melhorar.

function criarDivisaoService({ sequelize, dirNormas, agora = () => new Date() }) {
  const { NormaVersao, NormaArtigo } = sequelize.models;

  async function processarVersao(versaoId) {
    const versao = eUuid(versaoId) ? await NormaVersao.findByPk(versaoId) : null;
    if (!versao) throw new AppError(404, "Versão não encontrada.");
    if (!versao.arquivo_caminho) throw new AppError(409, "Esta versão não tem arquivo para dividir.");

    const buffer = fs.readFileSync(path.join(dirNormas, versao.arquivo_caminho));
    let linhas;
    try {
      linhas = await linhasDoArquivo(buffer, versao.arquivo_caminho);
    } catch (erro) {
      throw new AppError(422, `Não foi possível ler o arquivo da norma: ${erro.message}`);
    }
    const { artigos, avisos, dataDaVersao } = dividirEmArtigos(linhas);

    await sequelize.transaction(async (transaction) => {
      await NormaArtigo.destroy({ where: { versao_id: versao.id }, transaction });
      await NormaArtigo.bulkCreate(
        artigos.map((artigo) => ({
          id: crypto.randomUUID(),
          versao_id: versao.id,
          numero: artigo.numero,
          ordem: artigo.ordem,
          caput: artigo.caput,
          notas: artigo.notas,
          revogado: artigo.revogado,
          texto_bruto: artigo.texto,
          estrutura: artigo.estrutura,
          redacao_anterior: artigo.redacao_anterior
        })),
        { transaction }
      );
      await versao.update(
        {
          artigos_total: artigos.length,
          avisos,
          processada_em: agora(),
          data_versao: dataDaVersao ? (dataDaVersao.precisao === "ano" ? `${dataDaVersao.valor.slice(0, 4)}-01-01` : dataDaVersao.valor) : null,
          data_versao_precisao: dataDaVersao?.precisao ?? null
        },
        { transaction }
      );
    });
    logger.info({ versaoId: versao.id, artigos: artigos.length, avisos: avisos.length, dataDaVersao }, "versão dividida em artigos");
    return { artigos: artigos.length, revogados: artigos.filter((a) => a.revogado).length, avisos, dataDaVersao };
  }

  return { processarVersao };
}

module.exports = { criarDivisaoService };
