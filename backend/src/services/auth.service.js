"use strict";

const { randomUUID } = require("node:crypto");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const senha = require("../shared/senha");

// Login e equipes do usuário (etapa 4a).

// Conferido quando o e-mail não existe, para a resposta levar o mesmo tempo e não revelar quais e-mails existem.
// Gerado na primeira vez que for preciso: custa o mesmo que conferir uma senha de verdade.
let hashDeNinguem = null;

const normalizarEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : "");

function criarAuthService({ sequelize }) {
  const { Usuario, Membro, Equipe } = sequelize.models;

  async function entrar(email, senhaInformada) {
    if (!normalizarEmail(email) || typeof senhaInformada !== "string" || senhaInformada === "") {
      throw new AppError(400, "Informe o e-mail e a senha.");
    }
    const usuario = await Usuario.findOne({ where: { email: normalizarEmail(email) }, raw: true });
    if (!usuario) hashDeNinguem = hashDeNinguem || (await senha.gerarHash(randomUUID()));
    const confere = await senha.conferir(senhaInformada, usuario ? usuario.senha_hash : hashDeNinguem);
    if (!usuario || !confere || !usuario.ativo) throw new AppError(401, "E-mail ou senha inválidos.");
    return perfil(usuario.id);
  }

  async function usuarioAtivo(id) {
    if (!eUuid(id)) return null;
    return Usuario.findOne({ where: { id, ativo: true }, attributes: ["id", "nome", "email", "admin"], raw: true });
  }

  // As equipes em que o usuário está ativo, com o papel em cada uma.
  async function equipesDo(usuarioId) {
    const vinculos = await Membro.findAll({
      where: { usuario_id: usuarioId, ativo: true },
      attributes: ["papel"],
      include: [{ model: Equipe, as: "equipe", attributes: ["id", "nome"] }],
      order: [[{ model: Equipe, as: "equipe" }, "nome", "ASC"]]
    });
    return vinculos.map((v) => ({ id: v.equipe.id, nome: v.equipe.nome, papel: v.papel }));
  }

  // O papel do usuário na equipe, ou null se ele não está nela (ou está desativado).
  async function papelNaEquipe(usuarioId, equipeId) {
    if (!eUuid(equipeId)) return null;
    const vinculo = await Membro.findOne({ where: { usuario_id: usuarioId, equipe_id: equipeId, ativo: true }, attributes: ["papel"], raw: true });
    return vinculo ? vinculo.papel : null;
  }

  async function perfil(usuarioId) {
    const usuario = await usuarioAtivo(usuarioId);
    if (!usuario) throw new AppError(401, "Sessão expirada. Entre de novo.");
    return { ...usuario, equipes: await equipesDo(usuario.id) };
  }

  return { entrar, usuarioAtivo, equipesDo, papelNaEquipe, perfil };
}

module.exports = { criarAuthService, normalizarEmail };
