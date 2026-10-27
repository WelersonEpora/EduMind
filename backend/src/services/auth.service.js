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

const textoObrigatorio = (valor, nome) => {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!texto) throw new AppError(400, `Informe ${nome}.`);
  return texto;
};

function emailValido(valor) {
  const email = normalizarEmail(valor);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, "Informe um e-mail válido.");
  return email;
}

// Os campos da conta que vieram (nome, email, senha), conferidos; a senha já sai como hash. Usado por quem muda uma
// conta: a própria pessoa (Minha conta), o orientador e o administrador.
async function dadosDaConta({ nome, email, senha: senhaNova } = {}) {
  const conta = {};
  if (nome !== undefined) conta.nome = textoObrigatorio(nome, "o nome");
  if (email !== undefined) conta.email = emailValido(email);
  if (senhaNova !== undefined) conta.senha_hash = await senha.gerarHash(senha.validar(senhaNova));
  return conta;
}

// Grava a conta (instância do Usuario). O e-mail novo não pode ser de outra conta.
async function gravarConta(Usuario, usuario, conta, transaction) {
  if (conta.email && conta.email !== usuario.email) {
    const dono = await Usuario.findOne({ where: { email: conta.email }, attributes: ["id"], raw: true, transaction });
    if (dono) throw new AppError(409, "Este e-mail já é de outra conta.");
  }
  await usuario.update(conta, { transaction });
}

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

  // O próprio usuário troca a senha (a inicial é passada por quem o incluiu). Exige a senha atual.
  async function trocarSenha(usuarioId, { atual, nova } = {}) {
    const usuario = await Usuario.findByPk(usuarioId, { attributes: ["id", "senha_hash"] });
    if (!usuario || typeof atual !== "string" || !(await senha.conferir(atual, usuario.senha_hash))) {
      throw new AppError(400, "A senha atual não confere.");
    }
    await usuario.update({ senha_hash: await senha.gerarHash(senha.validar(nova)) });
  }

  // O próprio usuário muda o nome e o e-mail. O nome muda direto; o e-mail, que é o login, exige a senha atual.
  async function alterarConta(usuarioId, { nome, email, atual } = {}) {
    const conta = await dadosDaConta({ nome, email });
    if (Object.keys(conta).length === 0) throw new AppError(400, "Nada para alterar.");
    await sequelize.transaction(async (transaction) => {
      const usuario = await Usuario.findByPk(usuarioId, { transaction, lock: true });
      if (conta.email && conta.email !== usuario.email) {
        if (typeof atual !== "string" || !(await senha.conferir(atual, usuario.senha_hash))) {
          throw new AppError(400, "Para mudar o e-mail, informe a senha atual correta.");
        }
      }
      await gravarConta(Usuario, usuario, conta, transaction);
    });
    return perfil(usuarioId);
  }

  return { entrar, usuarioAtivo, equipesDo, papelNaEquipe, perfil, trocarSenha, alterarConta };
}

module.exports = { criarAuthService, normalizarEmail, textoObrigatorio, dadosDaConta, gravarConta };
