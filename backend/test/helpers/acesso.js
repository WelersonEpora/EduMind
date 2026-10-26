"use strict";

const { randomUUID } = require("node:crypto");
const { criarSessao } = require("../../src/shared/sessao");
const senha = require("../../src/shared/senha");

// Login nos testes da API (etapa 4a): sessão com segredo de teste, usuário com equipes e um fetch com o cookie.

const SENHA = "senha-de-teste";

function sessaoDeTeste() {
  return criarSessao({ segredo: "segredo-de-teste", duracaoMs: 60_000, cookieSecure: false });
}

// equipes: [{ id, papel }]. Devolve o id do usuário.
async function criarUsuario(sequelize, { email, nome = email, equipes = [], ativo = true, admin = false }) {
  const { Usuario, Membro } = sequelize.models;
  const id = randomUUID();
  await Usuario.create({ id, nome, email, senha_hash: await senha.gerarHash(SENHA), ativo, admin });
  for (const equipe of equipes) {
    await Membro.create({ id: randomUUID(), equipe_id: equipe.id, usuario_id: id, papel: equipe.papel || "orientador", ativo: equipe.ativo ?? true });
  }
  return id;
}

// Entra com o e-mail e devolve um fetch que manda o cookie da sessão (e, se dado, o cabeçalho da equipe).
async function entrar(base, email, { equipeId } = {}) {
  const resposta = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, senha: SENHA })
  });
  if (resposta.status !== 200) throw new Error(`login de ${email} falhou: ${resposta.status}`);
  const cookie = resposta.headers.get("set-cookie").split(";")[0];
  return (url, opcoes = {}) =>
    fetch(url, { ...opcoes, headers: { ...opcoes.headers, cookie, ...(equipeId && { "x-equipe-id": equipeId }) } });
}

module.exports = { SENHA, sessaoDeTeste, criarUsuario, entrar };
