"use strict";

const crypto = require("node:crypto");
const logger = require("../shared/logger");

// Coletor do texto das normas (etapa 2a-2): baixa, uma vez, a URL oficial que o orientador informou. Decisão do
// orientador (2026-10-29): a URL é a página da lei ou o PDF dela; o que vier é guardado como uma versão, igual ao
// upload. Falhou, foi vedado ou veio vazio: fica como antes, com o upload manual.
//
// Regras do projeto (CLAUDE.md): lê e respeita o robots.txt, User-Agent identificável, no máximo 1 requisição a cada
// 2 s por host, sem paralelismo (uma coleta de cada vez, numa fila), sem retentativa, sem contornar CAPTCHA, login ou
// bloqueio. Página que depende de JavaScript não é detectada aqui: ela vem sem artigos, e quem chama descarta.
// Todo acesso, inclusive o do robots.txt e o não feito por vedação, vai para o fetch_log.

const USER_AGENT = "EduMindBot/1.0 (coletor de normas para orientadores de concursos; +https://edumind.weslab.com.br)";
// O nome que o robots.txt usa para falar com este coletor.
const NOME_NO_ROBOTS = "edumindbot";
const INTERVALO_POR_HOST_MS = 2000;
const TIMEOUT_MS = 30000;
const LIMITE_BYTES = 30 * 1024 * 1024;

// O padrão de uma regra do robots.txt casa com o caminho? "*" é qualquer sequência; "$" no fim prende ao fim.
function casaPadrao(padraoCompleto, caminho) {
  const noFim = padraoCompleto.endsWith("$");
  const padrao = noFim ? padraoCompleto.slice(0, -1) : padraoCompleto;
  // i: posição no padrão; j: posição no caminho. Os padrões do robots.txt são curtos.
  const casa = (i, j) => {
    if (i === padrao.length) return noFim ? j === caminho.length : true;
    if (padrao[i] === "*") {
      for (let k = j; k <= caminho.length; k += 1) if (casa(i + 1, k)) return true;
      return false;
    }
    return j < caminho.length && padrao[i] === caminho[j] && casa(i + 1, j + 1);
  };
  return casa(0, 0);
}

// O caminho (com a query) pode ser acessado por este coletor, segundo o robots.txt? Vale o grupo que cita o coletor
// pelo nome; sem ele, o grupo "*". Entre as regras que casam, a mais longa decide; empate, Allow.
function permitidoPeloRobots(texto, caminho) {
  const grupos = [];
  let atual = null;
  for (const linhaBruta of String(texto).split("\n")) {
    const linha = linhaBruta.split("#")[0].trim();
    const doisPontos = linha.indexOf(":");
    if (doisPontos < 0) continue;
    const campo = linha.slice(0, doisPontos).trim().toLowerCase();
    const valor = linha.slice(doisPontos + 1).trim();
    if (campo === "user-agent") {
      // User-agents seguidos formam um grupo só.
      if (!atual || atual.regras.length > 0) {
        atual = { agentes: [], regras: [] };
        grupos.push(atual);
      }
      atual.agentes.push(valor.toLowerCase());
    } else if ((campo === "allow" || campo === "disallow") && atual) {
      atual.regras.push({ permite: campo === "allow", padrao: valor });
    }
  }
  const meus = grupos.filter((g) => g.agentes.some((a) => a !== "*" && NOME_NO_ROBOTS.includes(a)));
  const regras = (meus.length ? meus : grupos.filter((g) => g.agentes.includes("*"))).flatMap((g) => g.regras);

  let decisiva = null;
  for (const regra of regras) {
    // "Disallow:" vazio não veda nada.
    if (regra.padrao === "" || !casaPadrao(regra.padrao, caminho)) continue;
    const maisLonga = !decisiva || regra.padrao.length > decisiva.padrao.length;
    const empateComAllow = decisiva && regra.padrao.length === decisiva.padrao.length && regra.permite;
    if (maisLonga || empateComAllow) decisiva = regra;
  }
  return !decisiva || decisiva.permite;
}

// O que veio: PDF, página HTML ou texto; outra coisa não serve.
function extensaoDoConteudo(tipo, buffer) {
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return ".pdf";
  const t = String(tipo || "").toLowerCase();
  if (t.includes("html")) return ".html";
  if (t.includes("text/plain")) return ".txt";
  return null;
}

function esperarPadrao(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// `urlPermitida`: quem chama diz quais URLs podem ser acessadas (os domínios oficiais), conferido também depois de
// um redirecionamento.
function criarColetor({ sequelize, urlPermitida, fetchFn = fetch, esperar = esperarPadrao, agora = () => new Date() }) {
  const { FetchLog } = sequelize.models;
  const ultimoAcesso = new Map();
  let fila = Promise.resolve();

  async function registrar(campos) {
    await FetchLog.create({ id: crypto.randomUUID(), host: new URL(campos.url).hostname, acessado_em: agora(), ...campos }).catch(
      (erro) => logger.error({ err: erro, url: campos.url }, "não gravou o fetch_log")
    );
  }

  // Uma requisição, respeitando o intervalo por host. Devolve { resposta, buffer } ou lança o erro de rede.
  async function requisitar(url) {
    const host = new URL(url).hostname;
    const espera = (ultimoAcesso.get(host) ?? -Infinity) + INTERVALO_POR_HOST_MS - agora().getTime();
    if (espera > 0) await esperar(espera);
    ultimoAcesso.set(host, agora().getTime());
    const resposta = await fetchFn(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/pdf,text/plain;q=0.9,*/*;q=0.1" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const tamanho = Number(resposta.headers.get("content-length"));
    if (tamanho > LIMITE_BYTES) throw new Error(`O arquivo passa de ${LIMITE_BYTES / 1024 / 1024} MB.`);
    const buffer = Buffer.from(await resposta.arrayBuffer());
    if (buffer.length > LIMITE_BYTES) throw new Error(`O arquivo passa de ${LIMITE_BYTES / 1024 / 1024} MB.`);
    return { resposta, buffer };
  }

  // robots.txt: 2xx, lê as regras; 4xx, não há regras (tudo permitido); 5xx ou falha de rede, não acessa.
  async function robotsPermite(url) {
    const { origin, pathname, search } = new URL(url);
    const urlDoRobots = `${origin}/robots.txt`;
    try {
      const { resposta, buffer } = await requisitar(urlDoRobots);
      if (resposta.status >= 500) {
        await registrar({ url: urlDoRobots, http_status: resposta.status, status: "falhou", erro: "robots.txt indisponível" });
        return { permitido: false, mensagem: `O site não respondeu o robots.txt (status ${resposta.status}).` };
      }
      const permitido = resposta.ok ? permitidoPeloRobots(buffer.toString("utf8"), `${pathname}${search}`) : true;
      await registrar({ url: urlDoRobots, http_status: resposta.status, bytes: buffer.length, robots_permitido: permitido, status: "obtido" });
      return { permitido, mensagem: permitido ? null : "O robots.txt do site não permite baixar esta página." };
    } catch (erro) {
      await registrar({ url: urlDoRobots, status: "falhou", erro: erro.message });
      return { permitido: false, mensagem: `Não foi possível ler o robots.txt do site: ${erro.cause?.code || erro.message}.` };
    }
  }

  async function coletarAgora(url) {
    if (!urlPermitida(url)) return { status: "falhou", mensagem: "A URL não é de um domínio oficial." };
    const robots = await robotsPermite(url);
    if (!robots.permitido) {
      const status = robots.mensagem.startsWith("O robots.txt") ? "vedado_robots" : "falhou";
      await registrar({ url, robots_permitido: status === "vedado_robots" ? false : null, status, erro: robots.mensagem });
      return { status, mensagem: robots.mensagem };
    }

    let resposta;
    let buffer;
    try {
      ({ resposta, buffer } = await requisitar(url));
    } catch (erro) {
      const mensagem =
        erro.name === "TimeoutError" ? `O site não respondeu em ${TIMEOUT_MS / 1000} s.` : `Falha ao acessar: ${erro.cause?.code || erro.message}.`;
      await registrar({ url, robots_permitido: true, status: "falhou", erro: mensagem });
      return { status: "falhou", mensagem };
    }
    const base = { url, robots_permitido: true, http_status: resposta.status, bytes: buffer.length };
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    let falha = null;
    if (!resposta.ok) falha = { status: "falhou", mensagem: `O site respondeu com status ${resposta.status}.` };
    else if (resposta.url && !urlPermitida(resposta.url)) falha = { status: "falhou", mensagem: `O site redirecionou para fora dos domínios oficiais (${resposta.url}).` };
    else if (buffer.length === 0) falha = { status: "vazio", mensagem: "O site devolveu uma resposta vazia." };
    const extensao = falha ? null : extensaoDoConteudo(resposta.headers.get("content-type"), buffer);
    if (!falha && !extensao) {
      falha = { status: "falhou", mensagem: `O endereço não devolveu uma página nem um PDF (${resposta.headers.get("content-type") || "tipo desconhecido"}).` };
    }
    // Pediu um PDF e veio uma página: quase sempre uma verificação de segurança que só passa num navegador (o Senado
    // faz isso), e o coletor não a contorna.
    if (!falha && extensao !== ".pdf" && new URL(url).pathname.toLowerCase().endsWith(".pdf")) {
      falha = {
        status: "falhou",
        mensagem:
          "O site devolveu uma página em vez do PDF (provavelmente uma verificação de segurança). Abra a URL no navegador, salve o PDF e envie o arquivo."
      };
    }
    await registrar({ ...base, sha256, status: falha ? falha.status : "obtido", erro: falha?.mensagem ?? null });
    if (falha) return falha;
    return { status: "obtido", buffer, extensao, url: resposta.url || url };
  }

  // Uma coleta de cada vez: a próxima só começa quando a anterior termina.
  function coletar(url) {
    const resultado = fila.then(() => coletarAgora(url));
    fila = resultado.catch(() => {});
    return resultado;
  }

  return { coletar };
}

module.exports = { criarColetor, permitidoPeloRobots, USER_AGENT };
