"use strict";

const { AppError } = require("./errors");
const { NOME_DO_COOKIE } = require("./sessao");

// Toda a API, menos /health e /api/v1/auth, passa por estes dois (etapa 4a).

// Quem está chamando: o usuário da sessão, conferido no banco a cada requisição (ativo e existente).
function exigirLogin({ sessao, authService }) {
  return async function (req, res, next) {
    const usuario = await authService.usuarioAtivo(sessao.ler(req.cookies?.[NOME_DO_COOKIE]));
    if (!usuario) throw new AppError(401, "Sessão ausente ou expirada. Entre de novo.");
    req.usuario = usuario;
    next();
  };
}

// Em que equipe ele está trabalhando: o cabeçalho X-Equipe-Id, que a tela manda em toda chamada, ou ?equipe= na URL,
// para os links que o navegador abre sozinho (o PDF do edital, da prova, da norma), que não levam cabeçalho. Sem
// nenhum dos dois, vale a única equipe do usuário; com mais de uma, a tela precisa escolher.
function exigirEquipe({ authService }) {
  return async function (req, res, next) {
    const equipeId = req.get("x-equipe-id") || (typeof req.query.equipe === "string" ? req.query.equipe : null);
    if (equipeId) {
      const papel = await authService.papelNaEquipe(req.usuario.id, equipeId);
      if (!papel) throw new AppError(403, "Você não faz parte desta equipe.");
      req.equipe = { id: equipeId, papel };
      return next();
    }
    const equipes = await authService.equipesDo(req.usuario.id);
    if (equipes.length === 0) throw new AppError(403, "Você ainda não faz parte de nenhuma equipe.");
    if (equipes.length > 1) throw new AppError(400, "Escolha a equipe.", { codigo: "equipe_nao_escolhida" });
    req.equipe = { id: equipes[0].id, papel: equipes[0].papel };
    next();
  };
}

// Só o orientador da equipe da requisição (depois de exigirEquipe).
function exigirOrientador(req, res, next) {
  if (req.equipe?.papel !== "orientador") throw new AppError(403, "Só o orientador da equipe pode fazer isso.");
  next();
}

// Orientador ou professor da equipe da requisição (depois de exigirEquipe): o aluno não mexe na biblioteca de normas.
function exigirOrientadorOuProfessor(req, res, next) {
  if (!["orientador", "professor"].includes(req.equipe?.papel)) {
    throw new AppError(403, "Só o orientador ou o professor da equipe pode fazer isso.");
  }
  next();
}

// Só o administrador da plataforma (depois de exigirLogin). Não depende de equipe.
function exigirAdmin(req, res, next) {
  if (!req.usuario?.admin) throw new AppError(403, "Só o administrador da plataforma pode fazer isso.");
  next();
}

module.exports = { exigirLogin, exigirEquipe, exigirOrientador, exigirOrientadorOuProfessor, exigirAdmin };
