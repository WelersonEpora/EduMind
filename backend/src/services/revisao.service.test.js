"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste, criarEquipe } = require("../../test/helpers/banco");
const { criarEditalService } = require("./edital.service");
const { criarExtracaoService } = require("./extracao.service");
const { criarRevisaoService } = require("./revisao.service");

const PAGINAS = [
  { numero: 1, texto: "EDITAL Nº 01/2025\nFundação VUNESP\nSão Paulo, 2 de junho de 2025." },
  {
    numero: 2,
    texto:
      "DIREITO PENAL\n1. Código Penal - artigos 293 a 295.\n2. Constituição Federal – Título II.\n3. Lei n.º 9.099 - artigos 60 a 62.\n4. Crimes em geral."
  }
];

const no = (texto, source_excerpt, extras = {}) => ({ texto, pagina: 2, source_excerpt, ...extras });
const norma = (campos) => ({ tipo: null, numero: null, ano: null, nome: null, artigos_texto: null, ...campos });

const METADADOS = {
  banca: { valor: "VUNESP", pagina: 1, source_excerpt: "Fundação VUNESP" },
  orgao: null,
  cargo: null,
  data_publicacao: { valor: "2025-06-02", pagina: 1, source_excerpt: "2 de junho de 2025" },
  blocos: [{ nome: "Direito", pagina: 2, source_excerpt: "DIREITO PENAL", disciplinas: [{ nome: "Penal", questoes: 10, pagina: 2, source_excerpt: "DIREITO PENAL" }] }],
  regras_de_corte: [],
  discursiva: null
};

const ARVORE = {
  blocos: [
    no("Direito", "DIREITO PENAL", {
      disciplinas: [
        no("DIREITO PENAL", "DIREITO PENAL", {
          assuntos: [
            // Verificado e com o trecho dos artigos no edital: entra no lote.
            no("Código Penal - artigos 293 a 295.", "1. Código Penal - artigos 293 a 295.", {
              normas: [norma({ nome: "Código Penal", artigos_texto: "artigos 293 a 295" })],
              subassuntos: []
            }),
            // Citação por título: o parser avisa, fica de fora do lote.
            no("Constituição Federal – Título II.", "2. Constituição Federal – Título II.", {
              normas: [norma({ nome: "Constituição Federal", artigos_texto: "Título II" })],
              subassuntos: []
            }),
            // Trecho dos artigos alterado ("60 a 65"): fica de fora do lote.
            no("Lei n.º 9.099 - artigos 60 a 62.", "3. Lei n.º 9.099 - artigos 60 a 62.", {
              normas: [norma({ tipo: "Lei", numero: "9.099", artigos_texto: "artigos 60 a 65" })],
              subassuntos: []
            }),
            // Trecho que não está no edital: fica de fora do lote.
            no("Crimes em geral.", "4. Crimes em espécie.", { normas: [], subassuntos: [] })
          ]
        })
      ]
    })
  ]
};

async function montar(t) {
  const sequelize = await abrirBancoDeTeste(t);
  const equipeId = await criarEquipe(sequelize);
  const editalService = criarEditalService({
    sequelize,
    dirUploads: fs.mkdtempSync(path.join(os.tmpdir(), "edumind-")),
    lerPaginas: async () => PAGINAS
  });
  const { edital } = await editalService.criarAPartirDoPdf({ equipeId, buffer: Buffer.from("%PDF-1.4 x"), nomeArquivo: "e.pdf" });
  const gerarJson = async ({ responseSchema }) => ({
    texto: JSON.stringify(responseSchema.properties.banca ? METADADOS : ARVORE),
    modelo: "m",
    chave: "paga",
    tokens: 1
  });
  const extracaoService = criarExtracaoService({ sequelize, gerarJson });
  await (await extracaoService.iniciar(edital.id)).concluida;
  const service = criarRevisaoService({ sequelize, agora: () => new Date("2026-10-22T20:00:00Z") });
  const itens = await editalService.conteudo(edital.id);
  const porTexto = (inicio) => itens.find((i) => i.texto.startsWith(inicio));
  return { equipeId, edital, editalService, extracaoService, service, itens, porTexto };
}

test("aprova, rejeita e volta a rascunho um item da árvore", async (t) => {
  const { edital, service, porTexto } = await montar(t);
  const item = porTexto("Crimes");

  const aprovado = await service.revisarItem(edital.id, item.id, { status: "aprovado" });
  assert.equal(aprovado.status, "aprovado");
  assert.equal(new Date(aprovado.status_em).toISOString(), "2026-10-22T20:00:00.000Z");
  assert.equal(aprovado.editado, false);

  assert.equal((await service.revisarItem(edital.id, item.id, { status: "rejeitado" })).status, "rejeitado");
  const rascunho = await service.revisarItem(edital.id, item.id, { status: "rascunho" });
  assert.deepEqual([rascunho.status, rascunho.status_em], ["rascunho", null]);
});

test("editar o texto marca o item como editado; texto igual não marca", async (t) => {
  const { edital, service, porTexto } = await montar(t);
  const item = porTexto("Crimes");
  assert.equal((await service.revisarItem(edital.id, item.id, { texto: "Crimes em geral." })).editado, false);
  const editado = await service.revisarItem(edital.id, item.id, { texto: "  Crimes em espécie.  " });
  assert.deepEqual([editado.texto, editado.editado], ["Crimes em espécie.", true]);
  // O trecho literal do edital não muda com a edição.
  assert.equal(editado.source_excerpt, "4. Crimes em espécie.");
});

test("valida o que chega: status, texto vazio, campo não editável, item de outro edital", async (t) => {
  const { edital, service, porTexto } = await montar(t);
  const item = porTexto("Crimes");
  await assert.rejects(service.revisarItem(edital.id, item.id, { status: "talvez" }), { status: 400 });
  await assert.rejects(service.revisarItem(edital.id, item.id, { texto: "  " }), { status: 400, message: /vazio/ });
  await assert.rejects(service.revisarItem(edital.id, item.id, { pagina: 3 }), { status: 400, message: /"pagina"/ });
  await assert.rejects(service.revisarItem(edital.id, item.id, {}), { status: 400, message: /Nada para alterar/ });
  await assert.rejects(service.revisarItem(crypto.randomUUID(), item.id, { status: "aprovado" }), { status: 404 });
  await assert.rejects(service.revisarItem(edital.id, crypto.randomUUID(), { status: "aprovado" }), { status: 404 });
});

test("corrigir o trecho dos artigos expande de novo e confere de novo no edital", async (t) => {
  const { edital, service, porTexto } = await montar(t);
  const item = porTexto("Lei n.º 9.099");
  const [lei] = item.normas;
  assert.equal(lei.artigos_texto_verificado, false);
  assert.equal(lei.artigos.artigos.length, 6);

  const corrigido = await service.revisarNorma(edital.id, lei.id, { artigos_texto: "artigos 60 a 62", ano: "1995" });
  assert.equal(corrigido.editado, true);
  assert.deepEqual(
    { ano: corrigido.normas[0].ano, verificado: corrigido.normas[0].artigos_texto_verificado, artigos: corrigido.normas[0].artigos.artigos.map((a) => a.numero) },
    { ano: "1995", verificado: true, artigos: ["60", "61", "62"] }
  );

  // Sem trecho: a norma inteira.
  const inteira = await service.revisarNorma(edital.id, lei.id, { artigos_texto: "" });
  assert.deepEqual([inteira.normas[0].artigos_texto, inteira.normas[0].artigos], [null, null]);
  await assert.rejects(service.revisarNorma(edital.id, lei.id, { pagina: 1 }), { status: 400 });
  await assert.rejects(service.revisarNorma(edital.id, crypto.randomUUID(), { nome: "x" }), { status: 404 });
});

test("aprovar verificados da disciplina deixa de fora o não verificado e as normas com pendência", async (t) => {
  const { edital, editalService, service, porTexto } = await montar(t);
  const disciplina = porTexto("DIREITO PENAL");
  // Já rejeitado antes: o lote não mexe.
  await service.revisarItem(edital.id, porTexto("Crimes").id, { status: "rejeitado" });

  assert.deepEqual(await service.aprovarVerificados(edital.id, disciplina.id), { aprovados: 2, pendentes: 2 });
  const depois = await editalService.conteudo(edital.id);
  const status = Object.fromEntries(depois.map((i) => [i.texto.slice(0, 14), i.status]));
  assert.deepEqual(status, {
    Direito: "rascunho",
    "DIREITO PENAL": "aprovado",
    "Código Penal -": "aprovado",
    "Constituição F": "rascunho",
    "Lei n.º 9.099 ": "rascunho",
    "Crimes em gera": "rejeitado"
  });
  await assert.rejects(service.aprovarVerificados(edital.id, porTexto("Direito").id), { status: 400, message: /por disciplina/ });
});

test("revisa os metadados: status, edição, data validada e colunas do edital", async (t) => {
  const { edital, editalService, service } = await montar(t);

  const metadados = await service.revisarMetadado(edital.id, { caminho: "campos.banca", status: "aprovado", valor: "Fundação VUNESP" });
  assert.deepEqual(
    { status: metadados.campos.banca.status, editado: metadados.campos.banca.editado, valor: metadados.campos.banca.valor },
    { status: "aprovado", editado: true, valor: "Fundação VUNESP" }
  );
  assert.equal((await editalService.buscar(edital.id)).banca, "Fundação VUNESP");

  await assert.rejects(service.revisarMetadado(edital.id, { caminho: "campos.data_publicacao", valor: "02/06/2025" }), {
    status: 400,
    message: /AAAA-MM-DD/
  });
  await service.revisarMetadado(edital.id, { caminho: "campos.data_publicacao", valor: "2025-07-29" });
  assert.equal((await editalService.buscar(edital.id)).data_publicacao, "2025-07-29");

  const disciplina = await service.revisarMetadado(edital.id, { caminho: "blocos.0.disciplinas.0", questoes: 12 });
  assert.equal(disciplina.blocos[0].disciplinas[0].questoes, 12);
  await assert.rejects(service.revisarMetadado(edital.id, { caminho: "blocos.0.disciplinas.0", questoes: -1 }), { status: 400 });
  await assert.rejects(service.revisarMetadado(edital.id, { caminho: "blocos.0", valor: "x" }), { status: 400, message: /"valor"/ });
  await assert.rejects(service.revisarMetadado(edital.id, { caminho: "campos.orgao", status: "aprovado" }), { status: 404 });
  await assert.rejects(service.revisarMetadado(edital.id, { caminho: "blocos.7", status: "aprovado" }), { status: 404 });
});

test("extrair de novo com revisão feita exige confirmação e então substitui tudo", async (t) => {
  const { edital, editalService, extracaoService, service, porTexto } = await montar(t);
  await service.revisarItem(edital.id, porTexto("Crimes").id, { status: "aprovado" });
  await service.revisarMetadado(edital.id, { caminho: "campos.banca", status: "rejeitado" });

  await assert.rejects(extracaoService.iniciar(edital.id), {
    status: 409,
    dados: { codigo: "revisao_sera_perdida", revisados: 2 }
  });
  assert.equal((await editalService.buscar(edital.id)).status, "extraido");

  await (await extracaoService.iniciar(edital.id, { confirmarPerdaDaRevisao: true })).concluida;
  const depois = await editalService.conteudo(edital.id);
  assert.ok(depois.every((i) => i.status === "rascunho"));
  assert.equal((await editalService.buscar(edital.id)).metadados.campos.banca.status, undefined);
});

test("a revisão só acontece com a extração concluída", async (t) => {
  const { edital, extracaoService, service, porTexto } = await montar(t);
  const item = porTexto("Crimes");
  const { concluida } = await extracaoService.iniciar(edital.id);
  await assert.rejects(service.revisarItem(edital.id, item.id, { status: "aprovado" }), { status: 409 });
  await concluida;
});
