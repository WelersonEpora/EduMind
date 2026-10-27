"use strict";

const { randomUUID } = require("node:crypto");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const senha = require("../shared/senha");
const { normalizarEmail, textoObrigatorio, dadosDaConta, gravarConta } = require("./auth.service");
const { PAPEIS } = require("../models/membro");

// Membros da equipe e equipes da plataforma (etapa 4b-2). Decisões do orientador, 2026-10-26:
// - O orientador inclui professores e alunos na própria equipe, troca o papel e desativa. Desativar tira o acesso
//   à equipe sem apagar nada.
// - Quem é incluído com um e-mail que já tem conta só entra na equipe: a senha e o nome dele não mudam.
// - A equipe nunca fica sem orientador ativo.
// - O orientador corrige o nome de qualquer membro, inclusive o próprio (decisão de 2026-10-27: o nome não dá acesso
//   a nada). E-mail e senha, só de quem é só desta equipe e não é administrador (conta_editavel): a conta é da pessoa,
//   não da equipe. Sem essa trava, quem orienta uma equipe poderia incluir o e-mail de alguém de outra equipe e trocar
//   a senha dela. O próprio e-mail e a própria senha se mudam em Minha conta, com a senha atual.
// - O administrador da plataforma cria as equipes, cada uma já com o seu orientador, e corrige nome, e-mail e senha
//   de qualquer conta que não seja de administrador (decisão de 2026-10-27: o orientador não muda a própria conta
//   pelo modal e pode ter sido cadastrado com o nome errado).
// - O aluno vê só os editais que o orientador atribui a ele (etapa 4c, edital_aluno), na aba Alunos de cada edital; a
//   lista de membros traz os editais atribuídos a cada aluno, só para consulta.

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
  const { Usuario, Equipe, Membro, Edital, EditalAluno } = sequelize.models;

  // Os usuários (dentre os ids) que também estão em alguma outra equipe, ativos ou não.
  async function emOutrasEquipes(equipeId, usuarioIds, transaction) {
    if (usuarioIds.length === 0) return new Set();
    const linhas = await Membro.findAll({
      where: { usuario_id: usuarioIds, equipe_id: { [sequelize.Sequelize.Op.ne]: equipeId } },
      attributes: ["usuario_id"],
      raw: true,
      transaction
    });
    return new Set(linhas.map((l) => l.usuario_id));
  }

  async function membros(equipeId) {
    const lista = await Membro.findAll({
      where: { equipe_id: equipeId },
      include: [{ model: Usuario, as: "usuario", attributes: ["id", "nome", "email", "admin"] }],
      order: [["ativo", "DESC"], [{ model: Usuario, as: "usuario" }, "nome", "ASC"]]
    });
    const foraDaqui = await emOutrasEquipes(equipeId, lista.map((m) => m.usuario.id));
    const atribuidos = await EditalAluno.findAll({
      where: { usuario_id: lista.filter((m) => m.papel === "aluno").map((m) => m.usuario.id) },
      include: [{ model: Edital, as: "edital", where: { equipe_id: equipeId }, attributes: [] }],
      attributes: ["usuario_id", "edital_id"],
      raw: true
    });
    return lista.map((m) => ({
      id: m.id,
      usuario_id: m.usuario.id,
      nome: m.usuario.nome,
      email: m.usuario.email,
      papel: m.papel,
      ativo: m.ativo,
      admin: m.usuario.admin,
      conta_editavel: !m.usuario.admin && !foraDaqui.has(m.usuario.id),
      ...(m.papel === "aluno" && { editais: atribuidos.filter((a) => a.usuario_id === m.usuario.id).map((a) => a.edital_id) }),
      created_at: m.created_at
    }));
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

  // Muda o vínculo (papel, ativo), o nome e, se a conta for editável, o e-mail e a senha. A equipe precisa continuar
  // com pelo menos um orientador ativo. quemAltera: o usuário da sessão (o próprio e-mail e a própria senha se mudam
  // em Minha conta).
  async function alterarMembro(equipeId, membroId, { papel, ativo, nome, email, senha: senhaNova } = {}, { quemAltera } = {}) {
    const vinculo = {};
    if (papel !== undefined) vinculo.papel = papelValido(papel);
    if (ativo !== undefined) {
      if (typeof ativo !== "boolean") throw new AppError(400, 'Indique "ativo": true ou false.');
      vinculo.ativo = ativo;
    }
    const conta = await dadosDaConta({ nome, email, senha: senhaNova });
    if (Object.keys(vinculo).length === 0 && Object.keys(conta).length === 0) throw new AppError(400, "Nada para alterar.");

    await sequelize.transaction(async (transaction) => {
      const membro = eUuid(membroId) ? await Membro.findOne({ where: { id: membroId, equipe_id: equipeId }, transaction, lock: true }) : null;
      if (!membro) throw new AppError(404, "Membro não encontrado nesta equipe.");
      if (Object.keys(conta).length) {
        // O nome não dá acesso a nada: o orientador corrige o de qualquer membro, inclusive o próprio. E-mail e senha só
        // de quem é só desta equipe e não é administrador.
        const usuario = await Usuario.findByPk(membro.usuario_id, { transaction, lock: true });
        if (conta.email || conta.senha_hash) {
          if (usuario.id === quemAltera) throw new AppError(403, "Para mudar o seu e-mail ou senha, use Minha conta.");
          if (usuario.admin || (await emOutrasEquipes(equipeId, [usuario.id], transaction)).size) {
            throw new AppError(403, "Esta pessoa também está em outra equipe: só ela muda o e-mail e a senha, em Minha conta.");
          }
        }
        await gravarConta(Usuario, usuario, conta, transaction);
      }
      if (Object.keys(vinculo).length) await membro.update(vinculo, { transaction });
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
          orientadores: lista
            .filter((m) => m.papel === "orientador" && m.ativo)
            .map((m) => ({ usuario_id: m.usuario_id, nome: m.nome, email: m.email, admin: m.admin })),
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

  // Administrador: corrige nome, e-mail e senha de uma conta. A de outro administrador (e a própria) não: cada um muda
  // a sua em Minha conta.
  async function alterarConta(usuarioId, dados = {}) {
    const conta = await dadosDaConta({ nome: dados.nome, email: dados.email, senha: dados.senha });
    if (Object.keys(conta).length === 0) throw new AppError(400, "Nada para alterar.");
    return sequelize.transaction(async (transaction) => {
      const usuario = eUuid(usuarioId) ? await Usuario.findByPk(usuarioId, { transaction, lock: true }) : null;
      if (!usuario) throw new AppError(404, "Conta não encontrada.");
      if (usuario.admin) throw new AppError(403, "Conta de administrador: cada um muda a sua em Minha conta.");
      await gravarConta(Usuario, usuario, conta, transaction);
      return { id: usuario.id, nome: usuario.nome, email: usuario.email };
    });
  }

  return { equipe, membros, renomear, incluirMembro, alterarMembro, listarEquipes, criarEquipe, alterarConta };
}

module.exports = { criarEquipeService };
