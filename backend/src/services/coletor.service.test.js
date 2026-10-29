"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { abrirBancoDeTeste } = require("../../test/helpers/banco");
const { criarColetor, permitidoPeloRobots, USER_AGENT } = require("./coletor.service");

test("robots.txt: grupo do coletor ou *, a regra mais longa decide, Allow no empate, * e $", () => {
  const robots = ["User-agent: *", "Disallow: /privado/", "Allow: /privado/publico", "Disallow: /*.pdf$", "", "User-agent: Outro", "Disallow: /"].join("\n");
  assert.equal(permitidoPeloRobots(robots, "/ccivil_03/leis/l9099.htm"), true);
  assert.equal(permitidoPeloRobots(robots, "/privado/x"), false);
  assert.equal(permitidoPeloRobots(robots, "/privado/publico/x"), true);
  assert.equal(permitidoPeloRobots(robots, "/docs/lei.pdf"), false);
  assert.equal(permitidoPeloRobots(robots, "/docs/lei.pdf?x=1"), true);
  assert.equal(permitidoPeloRobots("", "/qualquer"), true);
  // "Disallow:" vazio não veda nada.
  assert.equal(permitidoPeloRobots("User-agent: *\nDisallow:", "/x"), true);
  // O grupo com o nome do coletor vale no lugar do *.
  assert.equal(permitidoPeloRobots("User-agent: *\nDisallow:\n\nUser-agent: EduMindBot\nDisallow: /", "/x"), false);
  assert.equal(permitidoPeloRobots("User-agent: EduMindBot\nUser-agent: Outro\nDisallow: /leis # comentário", "/leis/a"), false);
});

// Um fetch falso: `rotas` diz o que cada URL devolve ({ status, tipo, corpo, url }) ou lança (erro).
function fetchFalso(rotas, chamadas) {
  return async (url, opcoes) => {
    chamadas.push({ url, userAgent: opcoes.headers["user-agent"] });
    const rota = rotas[url];
    if (!rota) return new Response("", { status: 404 });
    if (rota.erro) throw rota.erro;
    const resposta = new Response(rota.corpo ?? "", { status: rota.status ?? 200, headers: { "content-type": rota.tipo ?? "text/html" } });
    Object.defineProperty(resposta, "url", { value: rota.url ?? url });
    return resposta;
  };
}

async function montar(t, rotas) {
  const sequelize = await abrirBancoDeTeste(t);
  const chamadas = [];
  const esperas = [];
  let relogio = Date.parse("2026-10-29T12:00:00Z");
  const coletor = criarColetor({
    sequelize,
    urlPermitida: (url) => new URL(url).hostname.endsWith(".gov.br"),
    fetchFn: fetchFalso(rotas, chamadas),
    esperar: async (ms) => {
      esperas.push(ms);
      relogio += ms;
    },
    agora: () => new Date(relogio)
  });
  const log = async () =>
    (await sequelize.models.FetchLog.findAll({ order: [["created_at", "ASC"]], raw: true })).map((l) => [l.url, l.status]);
  return { coletor, chamadas, esperas, log };
}

test("coleta: página HTML e PDF viram conteúdo; robots antes, 2 s entre requisições ao mesmo host, User-Agent", async (t) => {
  const PDF = "%PDF-1.4 lei";
  const { coletor, chamadas, esperas, log } = await montar(t, {
    "https://www.planalto.gov.br/robots.txt": { tipo: "text/plain", corpo: "User-agent: *\nDisallow: /privado/" },
    "https://www.planalto.gov.br/lei.htm": { tipo: "text/html; charset=windows-1252", corpo: "<html>Art. 1º</html>" },
    "https://www.planalto.gov.br/lei.pdf": { tipo: "application/octet-stream", corpo: PDF }
  });

  const html = await coletor.coletar("https://www.planalto.gov.br/lei.htm");
  assert.deepEqual([html.status, html.extensao, html.buffer.toString()], ["obtido", ".html", "<html>Art. 1º</html>"]);
  // O PDF é reconhecido pelo conteúdo, mesmo com o tipo genérico.
  const pdf = await coletor.coletar("https://www.planalto.gov.br/lei.pdf");
  assert.deepEqual([pdf.status, pdf.extensao], ["obtido", ".pdf"]);

  assert.deepEqual(
    chamadas.map((c) => c.url),
    [
      "https://www.planalto.gov.br/robots.txt",
      "https://www.planalto.gov.br/lei.htm",
      "https://www.planalto.gov.br/robots.txt",
      "https://www.planalto.gov.br/lei.pdf"
    ]
  );
  assert.ok(chamadas.every((c) => c.userAgent === USER_AGENT));
  assert.deepEqual(esperas, [2000, 2000, 2000]);
  assert.deepEqual(await log(), [
    ["https://www.planalto.gov.br/robots.txt", "obtido"],
    ["https://www.planalto.gov.br/lei.htm", "obtido"],
    ["https://www.planalto.gov.br/robots.txt", "obtido"],
    ["https://www.planalto.gov.br/lei.pdf", "obtido"]
  ]);
});

test("coleta: vedada pelo robots não acessa a página; erros viram status, sem retentativa", async (t) => {
  const { coletor, chamadas, log } = await montar(t, {
    "https://www.al.sp.gov.br/robots.txt": { tipo: "text/plain", corpo: "User-agent: *\nDisallow: /leis/" },
    "https://www.al.sp.gov.br/outra/lei.htm": { status: 403, corpo: "bloqueado" },
    "https://www.al.sp.gov.br/outra/vazia.htm": { corpo: "" },
    "https://www.al.sp.gov.br/outra/imagem": { tipo: "image/png", corpo: "png" },
    "https://www.al.sp.gov.br/outra/redireciona": { corpo: "<html></html>", url: "https://www.exemplo.com/x" },
    "https://www.al.sp.gov.br/outra/lei.pdf": { corpo: "<html><title>Verificação de segurança</title></html>" },
    "https://www.al.sp.gov.br/outra/rede": { erro: Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } }) },
    "https://www.tjsp.gov.br/robots.txt": { status: 503 }
  });

  const vedada = await coletor.coletar("https://www.al.sp.gov.br/leis/lei.htm");
  assert.equal(vedada.status, "vedado_robots");
  assert.ok(!chamadas.some((c) => c.url === "https://www.al.sp.gov.br/leis/lei.htm"));
  assert.deepEqual((await log()).at(-1), ["https://www.al.sp.gov.br/leis/lei.htm", "vedado_robots"]);

  assert.match((await coletor.coletar("https://www.al.sp.gov.br/outra/lei.htm")).mensagem, /status 403/);
  assert.equal((await coletor.coletar("https://www.al.sp.gov.br/outra/vazia.htm")).status, "vazio");
  assert.match((await coletor.coletar("https://www.al.sp.gov.br/outra/imagem")).mensagem, /nem um PDF/);
  assert.match((await coletor.coletar("https://www.al.sp.gov.br/outra/redireciona")).mensagem, /fora dos domínios oficiais/);
  // Pediu o PDF e veio uma página (verificação de segurança): falha, com o motivo.
  const verificacao = await coletor.coletar("https://www.al.sp.gov.br/outra/lei.pdf");
  assert.deepEqual([verificacao.status, (await log()).at(-1)], ["falhou", ["https://www.al.sp.gov.br/outra/lei.pdf", "falhou"]]);
  assert.match(verificacao.mensagem, /página em vez do PDF/);
  assert.match((await coletor.coletar("https://www.al.sp.gov.br/outra/rede")).mensagem, /ECONNRESET/);
  // robots.txt fora do ar: não acessa a página.
  const semRobots = await coletor.coletar("https://www.tjsp.gov.br/x");
  assert.deepEqual([semRobots.status, chamadas.at(-1).url], ["falhou", "https://www.tjsp.gov.br/robots.txt"]);
  // Domínio não oficial: nem tenta.
  const antes = chamadas.length;
  assert.equal((await coletor.coletar("https://www.jusbrasil.com.br/x")).status, "falhou");
  assert.equal(chamadas.length, antes);
  // Uma requisição por URL: sem retentativa.
  assert.equal(chamadas.filter((c) => c.url === "https://www.al.sp.gov.br/outra/rede").length, 1);
});
