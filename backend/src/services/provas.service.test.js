"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste } = require("../../test/helpers/banco");
const { criarEditalService } = require("./edital.service");
const { criarProvasService, buscasDoEdital, nomeCurtoDaBanca, relevancia } = require("./provas.service");

const pdf = (conteudo) => Buffer.from(`%PDF-1.4 ${conteudo}`);

async function montar(t, { paginas = [{ numero: 1, texto: "1. Assinale a alternativa correta." }] } = {}) {
  const sequelize = await abrirBancoDeTeste(t);
  const dirProvas = fs.mkdtempSync(path.join(os.tmpdir(), "edumind-provas-"));
  const service = criarProvasService({ sequelize, dirProvas, lerPaginas: async () => paginas, agora: () => new Date("2026-10-22T12:00:00Z") });
  const editalService = criarEditalService({
    sequelize,
    dirUploads: fs.mkdtempSync(path.join(os.tmpdir(), "edumind-")),
    lerPaginas: async () => [{ numero: 1, texto: "Edital" }]
  });
  const { edital } = await editalService.criarAPartirDoPdf({ buffer: pdf("edital"), nomeArquivo: "edital.pdf" });
  await sequelize.models.Edital.update(
    { banca: "Fundação para o Vestibular da UNESP - VUNESP", orgao: "Tribunal de Justiça do Estado de São Paulo", cargo: "Escrevente Técnico Judiciário" },
    { where: { id: edital.id } }
  );
  return { sequelize, dirProvas, service, edital };
}

test("buscas sugeridas: links do Google restritos a cada fonte, montados a partir do edital", () => {
  assert.equal(nomeCurtoDaBanca("Fundação para o Vestibular da UNESP - VUNESP"), "VUNESP");
  assert.equal(nomeCurtoDaBanca("Fundação Getulio Vargas"), "Fundação Getulio Vargas");
  const buscas = buscasDoEdital(
    { banca: "Fundação para o Vestibular da UNESP - VUNESP", orgao: "TJSP", cargo: "Escrevente Técnico Judiciário" },
    ["Código de Processo Civil"]
  );
  assert.deepEqual(
    buscas.map((b) => [b.descricao, b.consulta]),
    [
      ["Mesmo concurso, outros anos", 'VUNESP prova "Escrevente Técnico Judiciário" TJSP gabarito'],
      ["Mesmo órgão, outros cargos", "VUNESP prova TJSP gabarito"],
      ["Mesmo cargo, outros órgãos", 'VUNESP prova "Escrevente Técnico Judiciário" gabarito'],
      ["VUNESP cobrando: Código de Processo Civil", 'VUNESP prova "Código de Processo Civil" gabarito']
    ]
  );
  assert.deepEqual(
    buscas[1].links.map((l) => [l.fonte, decodeURIComponent(l.url.split("q=")[1])]),
    [
      ["PCI Concursos", "site:pciconcursos.com.br VUNESP prova TJSP gabarito"],
      ["Estudegratis", "site:estudegratis.com.br VUNESP prova TJSP gabarito"],
      ["Google", "VUNESP prova TJSP gabarito pdf"]
    ]
  );
});

test("relevância: mesma banca pesa mais que órgão e cargo", () => {
  const edital = { banca: "Fundação para o Vestibular da UNESP - VUNESP", orgao: "Tribunal de Justiça do Estado de São Paulo", cargo: "Escrevente" };
  assert.equal(relevancia({ banca: "VUNESP", orgao: "Tribunal de Justiça do Estado de São Paulo", cargo: "escrevente" }, edital).pontos, 7);
  assert.equal(relevancia({ banca: "Vunesp", orgao: "TJ-RJ" }, edital).pontos, 4);
  assert.equal(relevancia({ banca: "FGV", orgao: "Tribunal de Justiça do Estado de São Paulo" }, edital).pontos, 2);
});

test("upload da prova: entra na biblioteca, fica escolhida para o edital; o mesmo PDF não duplica", async (t) => {
  const { service, edital, dirProvas } = await montar(t);
  const { prova, jaExistia } = await service.enviarProva({
    buffer: pdf("prova 2017"),
    nomeArquivo: "tjsp-2017.pdf",
    campos: { banca: "VUNESP", orgao: "TJSP", cargo: "Escrevente", ano: "2017", origem_url: "https://www.estudegratis.com.br/provas/x" },
    editalId: edital.id
  });
  assert.equal(jaExistia, false);
  assert.deepEqual(
    [prova.ano, prova.prova.nome, prova.prova.total_paginas, prova.prova.paginas_com_texto, prova.prova.origem_url, prova.gabarito, prova.editais],
    [2017, "tjsp-2017.pdf", 1, 1, "https://www.estudegratis.com.br/provas/x", null, [edital.id]]
  );
  assert.equal(fs.readdirSync(dirProvas).length, 1);

  const denovo = await service.enviarProva({ buffer: pdf("prova 2017"), nomeArquivo: "outro.pdf" });
  assert.deepEqual([denovo.jaExistia, denovo.prova.id], [true, prova.id]);
  assert.equal((await service.biblioteca()).length, 1);

  await assert.rejects(service.enviarProva({ buffer: Buffer.from("não é pdf"), nomeArquivo: "x.pdf" }), { status: 400 });
  await assert.rejects(service.enviarProva({ buffer: pdf("a"), nomeArquivo: "a.pdf", campos: { ano: "1500" } }), { status: 400 });
  await assert.rejects(service.enviarProva({ buffer: pdf("b"), nomeArquivo: "b.pdf", campos: { origem_url: "estudegratis" } }), { status: 400 });
  assert.equal((await service.biblioteca()).length, 1);
});

test("PDF escaneado entra, marcado sem texto", async (t) => {
  const { service } = await montar(t, { paginas: [{ numero: 1, texto: "" }, { numero: 2, texto: " " }] });
  const { prova } = await service.enviarProva({ buffer: pdf("escaneada"), nomeArquivo: "scan.pdf" });
  assert.deepEqual([prova.prova.total_paginas, prova.prova.paginas_com_texto], [2, 0]);
});

test("gabarito: exige a origem, substitui o anterior e não aceita o PDF da prova", async (t) => {
  const { service, dirProvas } = await montar(t);
  const { prova } = await service.enviarProva({ buffer: pdf("prova"), nomeArquivo: "prova.pdf" });
  await assert.rejects(service.enviarGabarito(prova.id, { buffer: pdf("gab"), nomeArquivo: "g.pdf", campos: {} }), { status: 400 });
  await assert.rejects(
    service.enviarGabarito(prova.id, { buffer: pdf("prova"), nomeArquivo: "g.pdf", campos: { gabarito_situacao: "nao_oficial" } }),
    { status: 409 }
  );

  let atual = await service.enviarGabarito(prova.id, { buffer: pdf("gab preliminar"), nomeArquivo: "g1.pdf", campos: { gabarito_situacao: "oficial_preliminar" } });
  assert.deepEqual([atual.gabarito_situacao, atual.gabarito.nome], ["oficial_preliminar", "g1.pdf"]);
  atual = await service.enviarGabarito(prova.id, { buffer: pdf("gab definitivo"), nomeArquivo: "g2.pdf", campos: { gabarito_situacao: "oficial_definitivo" } });
  assert.deepEqual([atual.gabarito_situacao, atual.gabarito.nome], ["oficial_definitivo", "g2.pdf"]);
  assert.equal(fs.readdirSync(dirProvas).length, 2);
  assert.equal(path.basename(await service.arquivo(prova.id, "gabarito")), `${atual.gabarito.id}.pdf`);
});

test("editar, escolher para o edital, desfazer e excluir", async (t) => {
  const { service, edital, dirProvas } = await montar(t);
  const { prova: escolhida } = await service.enviarProva({ buffer: pdf("1"), nomeArquivo: "1.pdf", campos: { banca: "FGV" }, editalId: edital.id });
  const { prova: outra } = await service.enviarProva({ buffer: pdf("2"), nomeArquivo: "2.pdf", campos: { banca: "VUNESP", ano: "2021" } });
  const { prova: terceira } = await service.enviarProva({ buffer: pdf("3"), nomeArquivo: "3.pdf", campos: { banca: "Cebraspe" } });

  let area = await service.doEdital(edital.id);
  assert.deepEqual(area.escolhidas.map((p) => p.id), [escolhida.id]);
  // A da mesma banca do edital vem primeiro.
  assert.deepEqual(area.outras.map((p) => p.id), [outra.id, terceira.id]);
  assert.equal(area.buscas.length, 3);

  area = await service.escolher(edital.id, outra.id);
  assert.deepEqual(area.escolhidas.map((p) => p.id), [outra.id, escolhida.id]);
  area = await service.desfazerEscolha(edital.id, escolhida.id);
  assert.deepEqual(area.escolhidas.map((p) => p.id), [outra.id]);

  const editada = await service.atualizar(terceira.id, { cargo: " Analista ", ano: "2019" });
  assert.deepEqual([editada.cargo, editada.ano], ["Analista", 2019]);
  await assert.rejects(service.atualizar(terceira.id, { prova_id: "x" }), { status: 400 });
  await assert.rejects(service.atualizar(crypto.randomUUID(), { ano: "2019" }), { status: 404 });

  await service.excluir(terceira.id);
  assert.equal((await service.biblioteca()).length, 2);
  assert.equal(fs.readdirSync(dirProvas).length, 2);
});
