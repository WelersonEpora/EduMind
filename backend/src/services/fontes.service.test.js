"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste } = require("../../test/helpers/banco");
const { criarEditalService } = require("./edital.service");
const { criarExtracaoService } = require("./extracao.service");
const { criarRevisaoService } = require("./revisao.service");
const { criarFontesService, urlOficial, urlDaResposta } = require("./fontes.service");

const PAGINAS = [
  {
    numero: 1,
    texto:
      "1. Código Penal - artigos 293 a 295.\n2. Lei n.º 9.099 de 26.09.1995 (artigos 60 a 62).\n3. Estatuto dos Funcionários Públicos Civis do Estado de São Paulo (Lei n.º 10.261/68)."
  }
];
const no = (texto, source_excerpt, extras = {}) => ({ texto, pagina: 1, source_excerpt, ...extras });
const norma = (campos) => ({ tipo: null, numero: null, ano: null, nome: null, artigos_texto: null, ...campos });

const ARVORE = {
  blocos: [
    no("Direito", "1. Código Penal", {
      disciplinas: [
        no("Direito", "1. Código Penal", {
          assuntos: [
            no("Código Penal - artigos 293 a 295.", "1. Código Penal - artigos 293 a 295.", {
              normas: [norma({ tipo: "Código", nome: "Código Penal", artigos_texto: "artigos 293 a 295" })],
              subassuntos: []
            }),
            no("Lei n.º 9.099 de 26.09.1995 (artigos 60 a 62).", "2. Lei n.º 9.099", {
              normas: [norma({ tipo: "Lei", numero: "9.099", ano: "1995", artigos_texto: "artigos 60 a 62" })],
              subassuntos: []
            }),
            no("Estatuto dos Funcionários Públicos Civis do Estado de São Paulo (Lei n.º 10.261/68).", "3. Estatuto", {
              normas: [norma({ tipo: "Lei", numero: "10.261", ano: "68", nome: "Estatuto dos Funcionários Públicos Civis do Estado de São Paulo" })],
              subassuntos: []
            })
          ]
        })
      ]
    })
  ]
};

// Edital extraído (Gemini falso) com os itens que citam normas, aprovados ou não.
async function criarEdital(sequelize, nomeArquivo, { aprovar = true } = {}) {
  const editalService = criarEditalService({
    sequelize,
    dirUploads: fs.mkdtempSync(path.join(os.tmpdir(), "edumind-")),
    lerPaginas: async () => PAGINAS
  });
  const { edital } = await editalService.criarAPartirDoPdf({ buffer: Buffer.from(`%PDF-1.4 ${nomeArquivo}`), nomeArquivo });
  const gerarJson = async ({ responseSchema }) => ({
    texto: JSON.stringify(responseSchema.properties.banca ? { banca: null } : ARVORE),
    modelo: "m",
    chave: "paga",
    tokens: 1
  });
  await (await criarExtracaoService({ sequelize, gerarJson }).iniciar(edital.id)).concluida;
  const itens = await editalService.conteudo(edital.id);
  if (aprovar) {
    const revisao = criarRevisaoService({ sequelize });
    for (const item of itens.filter((i) => i.normas.length > 0)) await revisao.revisarItem(edital.id, item.id, { status: "aprovado" });
  }
  return { edital, itens };
}

async function montar(t, { pesquisarNaWeb } = {}) {
  const sequelize = await abrirBancoDeTeste(t);
  const dirNormas = fs.mkdtempSync(path.join(os.tmpdir(), "edumind-normas-"));
  const service = criarFontesService({ sequelize, dirNormas, pesquisarNaWeb, agora: () => new Date("2026-10-22T21:00:00Z") });
  return { sequelize, dirNormas, service };
}

test("lista só as normas de itens aprovados, com a identidade proposta", async (t) => {
  const { sequelize, service } = await montar(t);
  const { edital, itens } = await criarEdital(sequelize, "a.pdf");
  // Desfaz a aprovação do item da Lei 9.099: some das fontes.
  const lei = itens.find((i) => i.texto.startsWith("Lei n.º 9.099"));
  await criarRevisaoService({ sequelize }).revisarItem(edital.id, lei.id, { status: "rascunho" });

  const fontes = await service.listar(edital.id);
  assert.deepEqual(
    fontes.map((f) => [f.confirmada, f.proposta.chave, f.proposta.alertas.length, f.citacoes.length]),
    [
      [false, "br:decreto-lei:2848:1940", 0, 1],
      [false, "sp:lei:10261:1968", 1, 1]
    ]
  );
  assert.equal(fontes[0].norma, null);
});

test("confirmar cria a norma na biblioteca e liga as citações; outro edital reaproveita a mesma norma", async (t) => {
  const { sequelize, service } = await montar(t);
  const { edital } = await criarEdital(sequelize, "a.pdf");
  const [cp] = await service.listar(edital.id);

  const norma = await service.confirmar(edital.id, {
    citacoes: cp.citacoes.map((c) => c.id),
    jurisdicao: "br",
    tipo: "Decreto-Lei",
    numero: "2.848",
    ano: "1940",
    nome: "Código Penal"
  });
  assert.deepEqual(
    { chave: norma.chave, jurisdicao: norma.jurisdicao, esfera: norma.esfera, versoes: norma.versoes },
    { chave: "br:decreto-lei:2848:1940", jurisdicao: "BR", esfera: "federal", versoes: [] }
  );
  const depois = await service.listar(edital.id);
  assert.deepEqual([depois[0].confirmada, depois[0].norma.id], [true, norma.id]);

  // Outro edital: a proposta já aponta a norma da biblioteca, e confirmar não cria outra.
  const outro = await criarEdital(sequelize, "b.pdf");
  const [cpDoOutro] = await service.listar(outro.edital.id);
  assert.equal(cpDoOutro.norma.id, norma.id);
  const mesma = await service.confirmar(outro.edital.id, {
    citacoes: cpDoOutro.citacoes.map((c) => c.id),
    jurisdicao: "BR",
    tipo: "Decreto-Lei",
    numero: "2848",
    ano: "1940",
    nome: "Código Penal"
  });
  assert.equal(mesma.id, norma.id);
  assert.equal((await service.biblioteca()).length, 1);

  // Desligar devolve a citação para "a confirmar"; a norma fica na biblioteca.
  assert.deepEqual(await service.desligar(edital.id, { citacoes: cp.citacoes.map((c) => c.id) }), { desligadas: 1 });
  assert.equal((await service.listar(edital.id))[0].confirmada, false);
});

test("confirmar valida a identidade e as citações", async (t) => {
  const { sequelize, service } = await montar(t);
  const { edital } = await criarEdital(sequelize, "a.pdf");
  const [cp] = await service.listar(edital.id);
  const base = { citacoes: cp.citacoes.map((c) => c.id), jurisdicao: "BR", tipo: "Decreto-Lei", numero: "2.848", ano: "1940", nome: "Código Penal" };
  await assert.rejects(service.confirmar(edital.id, { ...base, ano: "40" }), { status: 400, message: /4 dígitos/ });
  await assert.rejects(service.confirmar(edital.id, { ...base, jurisdicao: "São Paulo" }), { status: 400 });
  await assert.rejects(service.confirmar(edital.id, { ...base, nome: " " }), { status: 400 });
  await assert.rejects(service.confirmar(edital.id, { ...base, citacoes: [] }), { status: 400 });
  await assert.rejects(service.confirmar(edital.id, { ...base, citacoes: [crypto.randomUUID()] }), { status: 404 });

  // Citação de outro edital não serve.
  const outro = await criarEdital(sequelize, "b.pdf");
  const [cpDoOutro] = await service.listar(outro.edital.id);
  await assert.rejects(service.confirmar(edital.id, { ...base, citacoes: cpDoOutro.citacoes.map((c) => c.id) }), { status: 404 });
});

test("só aceita URL de domínio oficial", () => {
  assert.equal(urlOficial("https://www.planalto.gov.br/ccivil_03/leis/l9099.htm"), "https://www.planalto.gov.br/ccivil_03/leis/l9099.htm");
  assert.equal(urlOficial("https://www.al.sp.gov.br/repositorio/legislacao/lei/1968/lei-10261-28.10.1968.html") !== null, true);
  assert.equal(urlOficial("https://www.tjsp.jus.br/x"), "https://www.tjsp.jus.br/x");
  assert.equal(urlOficial("https://www.jusbrasil.com.br/legislacao/x"), null);
  assert.equal(urlOficial("https://gov.br.exemplo.com/x"), null);
  assert.equal(urlOficial("ftp://www.planalto.gov.br/x"), null);
  assert.equal(urlOficial("não é url"), null);

  assert.equal(urlDaResposta("Achei.\nURL: https://www.planalto.gov.br/ccivil_03/leis/l9099.htm"), "https://www.planalto.gov.br/ccivil_03/leis/l9099.htm");
  assert.equal(urlDaResposta("URL: <https://www.planalto.gov.br/a.htm>"), "https://www.planalto.gov.br/a.htm");
  assert.equal(urlDaResposta("URL: NENHUMA"), null);
  assert.equal(urlDaResposta("URL: https://www.jusbrasil.com.br/x"), null);
});

test("busca da URL: grava a URL oficial; resposta fora dos domínios oficiais vira erro claro", async (t) => {
  const respostas = ["URL: https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm", "URL: https://www.jusbrasil.com.br/x"];
  const pedidos = [];
  const pesquisarNaWeb = async (pedido) => {
    pedidos.push(pedido);
    return { texto: respostas.shift(), chave: "paga" };
  };
  const { sequelize, service } = await montar(t, { pesquisarNaWeb });
  const { edital } = await criarEdital(sequelize, "a.pdf");
  const [cp] = await service.listar(edital.id);
  const norma = await service.confirmar(edital.id, {
    citacoes: cp.citacoes.map((c) => c.id),
    jurisdicao: "BR",
    tipo: "Decreto-Lei",
    numero: "2.848",
    ano: "1940",
    nome: "Código Penal"
  });

  const comUrl = await service.buscarUrl(norma.id);
  assert.deepEqual([comUrl.url_oficial, comUrl.url_fonte], ["https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm", "busca_ia"]);
  assert.match(pedidos[0].prompt, /Código Penal — Decreto-Lei nº 2\.848, de 1940 — norma federal/);
  assert.equal(pedidos[0].somentePaga, true);

  await assert.rejects(service.buscarUrl(norma.id), { status: 422, message: /domínio oficial/ });

  const manual = await service.definirUrl(norma.id, { url: "https://www.planalto.gov.br/outra.htm" });
  assert.deepEqual([manual.url_oficial, manual.url_fonte], ["https://www.planalto.gov.br/outra.htm", "orientador"]);
  await assert.rejects(service.definirUrl(norma.id, { url: "https://www.jusbrasil.com.br/x" }), { status: 400 });
});

test("upload manual: cada conteúdo novo é uma versão; o mesmo arquivo não duplica", async (t) => {
  const { sequelize, dirNormas, service } = await montar(t);
  const { edital } = await criarEdital(sequelize, "a.pdf");
  const [cp] = await service.listar(edital.id);
  const norma = await service.confirmar(edital.id, {
    citacoes: cp.citacoes.map((c) => c.id),
    jurisdicao: "BR",
    tipo: "Decreto-Lei",
    numero: "2.848",
    ano: "1940",
    nome: "Código Penal"
  });

  const html = Buffer.from("<html><body>Art. 293. Falsificar...</body></html>");
  const primeira = await service.enviarVersao(norma.id, { buffer: html, nomeArquivo: "Código Penal.html" });
  assert.equal(primeira.jaExistia, false);
  const [versao] = primeira.norma.versoes;
  assert.deepEqual(
    { origem: versao.origem, status: versao.status, acessado_em: new Date(versao.acessado_em).toISOString(), arquivo: versao.arquivo_caminho },
    { origem: "upload", status: "upload_recebido", acessado_em: "2026-10-22T21:00:00.000Z", arquivo: undefined }
  );
  const { caminho, tipo } = await service.arquivoDaVersao(norma.id, versao.id);
  assert.equal(tipo, "text/html");
  assert.ok(caminho.startsWith(dirNormas));
  assert.deepEqual(fs.readFileSync(caminho), html);

  assert.equal((await service.enviarVersao(norma.id, { buffer: html, nomeArquivo: "de-novo.htm" })).jaExistia, true);
  const segunda = await service.enviarVersao(norma.id, { buffer: Buffer.from("<html>outra</html>"), nomeArquivo: "cp.htm" });
  assert.equal(segunda.norma.versoes.length, 2);

  await assert.rejects(service.enviarVersao(norma.id, { buffer: html, nomeArquivo: "cp.docx" }), { status: 400, message: /\.html/ });
  await assert.rejects(service.enviarVersao(norma.id, { buffer: html, nomeArquivo: "cp.pdf" }), { status: 400, message: /não é um PDF/ });
  await assert.rejects(service.enviarVersao(crypto.randomUUID(), { buffer: html, nomeArquivo: "cp.html" }), { status: 404 });
});

test("o upload divide o texto em artigos e alerta os artigos cobrados alterados depois do edital", async (t) => {
  const { sequelize, service } = await montar(t);
  const { edital } = await criarEdital(sequelize, "a.pdf");
  await sequelize.models.Edital.update({ data_publicacao: "2025-07-29" }, { where: { id: edital.id } });
  const [cp] = await service.listar(edital.id);
  const norma = await service.confirmar(edital.id, {
    citacoes: cp.citacoes.map((c) => c.id),
    jurisdicao: "BR",
    tipo: "Decreto-Lei",
    numero: "2.848",
    ano: "1940",
    nome: "Código Penal"
  });

  const html = `<html><head><meta charset="utf-8"></head><body>
<p>Art. 293. Falsificar papéis públicos. (Redação dada pela Lei nº 15.100, de 2026)</p>
<p>Art. 294. Fabricar objeto. (Redação dada pela Lei nº 11.111, de 10.1.2019)</p>
<p>Art. 295. Se o agente é funcionário. (Redação dada pela Lei nº 15.000, de 2025)</p>
<p>Art. 296. Fora do edital. (Incluído pela Lei nº 15.200, de 3.2.2026)</p>
</body></html>`;
  const { norma: comTexto } = await service.enviarVersao(norma.id, { buffer: Buffer.from(html), nomeArquivo: "cp.html" });
  const [versao] = comTexto.versoes;
  assert.deepEqual(
    { artigos: versao.artigos_total, data: versao.data_versao, precisao: versao.data_versao_precisao, avisos: versao.avisos },
    { artigos: 4, data: "2026-02-03", precisao: "dia", avisos: ["O texto não traz os artigos 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40 e mais 252."] }
  );

  const [fonte] = await service.listar(edital.id);
  assert.deepEqual(fonte.citacoes[0].artigos, ["293", "294", "295"]);
  assert.deepEqual(fonte.vigencia, {
    dataDoEdital: "2025-07-29",
    alteradosDepois: 2,
    talvezDepois: 1,
    citadosAlteradosDepois: ["293"],
    citadosTalvezDepois: ["295"]
  });

  // Processar de novo devolve o mesmo resultado (substitui os artigos da versão, não duplica).
  const reprocessada = await service.processarVersao(norma.id, versao.id);
  assert.equal(reprocessada.versoes[0].artigos_total, 4);
  assert.equal(await sequelize.models.NormaArtigo.count(), 4);
  await assert.rejects(service.processarVersao(norma.id, crypto.randomUUID()), { status: 404 });
});

test("biblioteca: a norma com os editais que a citam e os artigos de cada versão", async (t) => {
  const { sequelize, service } = await montar(t);
  const { edital } = await criarEdital(sequelize, "a.pdf");
  const [cp] = await service.listar(edital.id);
  const norma = await service.confirmar(edital.id, {
    citacoes: cp.citacoes.map((c) => c.id),
    jurisdicao: "BR",
    tipo: "Decreto-Lei",
    numero: "2.848",
    ano: "1940",
    nome: "Código Penal"
  });
  const html = "<p>TÍTULO X</p><p>Art. 293. Falsificar. (Redação dada pela Lei nº 1, de 2020)</p><p>Art. 294. Fabricar.</p>";
  const { norma: comTexto } = await service.enviarVersao(norma.id, { buffer: Buffer.from(html), nomeArquivo: "cp.html" });

  const [naBiblioteca] = await service.biblioteca();
  assert.deepEqual(naBiblioteca.editais.map((e) => e.id), [edital.id]);
  assert.equal((await service.detalharNorma(norma.id)).editais[0].arquivo_nome, "a.pdf");

  const artigos = await service.artigosDaVersao(norma.id, comTexto.versoes[0].id);
  assert.deepEqual(
    artigos.map((a) => [a.numero, a.caput, a.estrutura.titulo]),
    [
      ["293", "Falsificar.", "Título X"],
      ["294", "Fabricar.", "Título X"]
    ]
  );
  await assert.rejects(service.artigosDaVersao(norma.id, crypto.randomUUID()), { status: 404 });
  await assert.rejects(service.detalharNorma(crypto.randomUUID()), { status: 404 });
});
