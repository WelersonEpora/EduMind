"use strict";

const { randomUUID } = require("node:crypto");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const senha = require("../shared/senha");
const { normalizarEmail } = require("./auth.service");
const { PAPEIS } = require("../models/membro");

// Membros da equipe e equipes da plataforma (etapa 4b-2). Decisões do orientador, 2026-10-26:
// - O orientador inclui professores e alunos na própria equipe, troca o papel e desativa. Desativar tira o acesso
//   à equipe sem apagar nada.
// - Quem é incluído com um e-mail que já tem conta só entra na equipe: a senha e o nome dele não mudam.
// - A equipe nunca fica sem orientador ativo.
// - O administrador da plataforma cria as equipes, cada uma já com o seu orientador.

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

function papelValido(valor) {
  if (!PAPEIS.includes(valor)) throw new AppError(400, `O papel deve ser ${PAPEIS.join(", ")}.`);
  return valor;
}

function criarEquipeService({ sequelize }) {
  const { Usuario, Equipe, Membro } = sequelize.models;

  const membroParaTela = (m) => ({
    id: m.id,
    usuario_id: m.usuario.id,
    nome: m.usuario.nome,
    email: m.usuario.email,
    papel: m.papel,
    ativo: m.ativo,
    created_at: m.created_at
  });

  async function membros(equipeId) {
    const lista = await Membro.findAll({
      where: { equipe_id: equipeId },
      include: [{ model: Usuario, as: "usuario", attributes: ["id", "nome", "email"] }],
      order: [["ativo", "DESC"], [{ model: Usuario, as: "usuario" }, "nome", "ASC"]]
    });
    return lista.map(membroParaTela);
  }

  async function equipe(equipeId) {
    const encontrada = await Equipe.findByPk(equipeId, { attributes: ["id", "nome"], raw: true });
    if (!encontrada) throw new AppError(404, "Equipe não encontrada.");
    return { ...encontrada, membros: await membros(equipeId) };
  }

  async function renomear(equipeId, { nome }) {
    await Equipe.update({ nome: textoObrigatorio(nome, "o nome da equipe") }, { where: { id: equipeId } });
    return equipe(equipeId);
  }

  // Inclui na equipe: cria a conta se o e-mail é novo; se já existe, só o vínculo. Devolve o membro e se a conta já
  // existia (a tela avisa que a senha informada não foi usada).
  async function incluir(equipeId, dados, { transaction } = {}) {
    const email = emailValido(dados.email);
    const papel = papelValido(dados.papel);
    let usuario = await Usuario.findOne({ where: { email }, attributes: ["id"], raw: true, transaction });
    const contaJaExistia = Boolean(usuario);
    if (usuario) {
      const vinculo = await Membro.findOne({ where: { equipe_id: equipeId, usuario_id: usuario.id }, attributes: ["id"], raw: true, transaction });
      if (vinculo) throw new AppError(409, "Esta pessoa já está na equipe.");
    } else {
      const nome = textoObrigatorio(dados.nome, "o nome");
      const senhaHash = await senha.gerarHash(senha.validar(dados.senha));
      usuario = { id: randomUUID() };
      await Usuario.create({ id: usuario.id, nome, email, senha_hash: senhaHash }, { transaction });
    }
    const id = randomUUID();
    await Membro.create({ id, equipe_id: equipeId, usuario_id: usuario.id, papel }, { transaction });
    return { id, contaJaExistia };
  }

  async function incluirMembro(equipeId, dados = {}) {
    const { id, contaJaExistia } = await incluir(equipeId, dados);
    return { membro: (await membros(equipeId)).find((m) => m.id === id), contaJaExistia };
  }

  // Muda o papel e/ou ativa/desativa. A equipe precisa continuar com pelo menos um orientador ativo.
  async function alterarMembro(equipeId, membroId, { papel, ativo } = {}) {
    if (papel === undefined && ativo === undefined) throw new AppError(400, "Nada para alterar.");
    if (ativo !== undefined && typeof ativo !== "boolean") throw new AppError(400, 'Indique "ativo": true ou false.');
    const alteracoes = {};
    if (papel !== undefined) alteracoes.papel = papelValido(papel);
    if (ativo !== undefined) alteracoes.ativo = ativo;

    await sequelize.transaction(async (transaction) => {
      const membro = eUuid(membroId) ? await Membro.findOne({ where: { id: membroId, equipe_id: equipeId }, transaction, lock: true }) : null;
      if (!membro) throw new AppError(404, "Membro não encontrado nesta equipe.");
      await membro.update(alteracoes, { transaction });
      const orientadores = await Membro.count({ where: { equipe_id: equipeId, papel: "orientador", ativo: true }, transaction });
      if (orientadores === 0) throw new AppError(409, "A equipe precisa de pelo menos um orientador ativo.");
    });
    return (await membros(equipeId)).find((m) => m.id === membroId);
  }

  // Administrador: todas as equipes, com os orientadores e quantos membros ativos cada uma tem.
  async function listarEquipes() {
    const equipes = await Equipe.findAll({ attributes: ["id", "nome", "created_at"], order: [["nome", "ASC"]], raw: true });
    return Promise.all(
      equipes.map(async (e) => {
        const lista = await membros(e.id);
        return {
          ...e,
          orientadores: lista.filter((m) => m.papel === "orientador" && m.ativo).map((m) => ({ nome: m.nome, email: m.email })),
          membros_ativos: lista.filter((m) => m.ativo).length
        };
      })
    );
  }

  // Administrador: equipe nova, já com o orientador (conta nova ou existente).
  async function criarEquipe({ nome, orientador = {} } = {}) {
    const nomeDaEquipe = textoObrigatorio(nome, "o nome da equipe");
    const id = randomUUID();
    let contaJaExistia;
    await sequelize.transaction(async (transaction) => {
      await Equipe.create({ id, nome: nomeDaEquipe }, { transaction });
      ({ contaJaExistia } = await incluir(id, { ...orientador, papel: "orientador" }, { transaction }));
    });
    return { equipe: await equipe(id), contaJaExistia };
  }

  return { equipe, membros, renomear, incluirMembro, alterarMembro, listarEquipes, criarEquipe };
}

module.exports = { criarEquipeService };
