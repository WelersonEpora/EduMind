"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste, criarEquipe } = require("../../test/helpers/banco");
const { criarProvasService } = require("./provas.service");
const { criarLeituraService } = require("./leitura.service");

const PAGINAS_DA_PROVA = [{ numero: 1, texto: "01. Assinale a correta.\n(A) Um.\n(B) Dois.\n(C) Três.\n(D) Quatro.\n(E) Cinco.\n02. Outra questão.\n(A) A.\n(B) B.\n(C) C.\n(D) D.\n(E) E." }];
const PAGINAS_DO_GABARITO = [{ numero: 1, texto: "1 - C 2 - A" }];
const alternativas = (...t) => t.map((texto, i) => ({ letra: "ABCDE"[i], texto }));

// Gemini falso: responde conforme o esquema pedido (questões ou gabarito).
const gerarJson = async ({ responseSchema }) => ({
  texto: JSON.stringify(
    responseSchema.properties.questoes
      ? {
          versao: null,
          questoes: [
            { numero: 1, disciplina: "Direito", pagina: 1, apoio: null, enunciado: "Assinale a correta.", alternativas: alternativas("Um.", "Dois.", "Três.", "Quatro.", "Cinco."), depende_de_imagem: false },
            { numero: 2, disciplina: "Direito", pagina: 1, apoio: null, enunciado: "Outra questão inventada.", alternativas: alternativas("A.", "B.", "C.", "D.", "E."), depende_de_imagem: false }
          ]
        }
      : { versoes: [{ versao: null, respostas: [{ numero: 1, resposta: "C" }, { numero: 2, resposta: "A" }] }] }
  ),
  modelo: "m",
  chave: "paga",
  tokens: 1
});

async function montar(t, { paginasDoGabarito = PAGINAS_DO_GABARITO, gerar = gerarJson } = {}) {
  const sequelize = await abrirBancoDeTeste(t);
  const equipeId = await criarEquipe(sequelize);
  let paginas = PAGINAS_DA_PROVA;
  const dirProvas = fs.mkdtempSync(path.join(os.tmpdir(), "edumind-provas-"));
  const provas = criarProvasService({
    sequelize,
    dirProvas,
    lerPaginas: async () => paginas
  });
  const { prova } = await provas.enviarProva({ equipeId, buffer: Buffer.from("%PDF-1.4 prova"), nomeArquivo: "prova.pdf" });
  paginas = paginasDoGabarito;
  await provas.enviarGabarito(prova.id, { buffer: Buffer.from("%PDF-1.4 gab"), nomeArquivo: "gab.pdf", campos: { gabarito_situacao: "oficial_definitivo" } });
  return { equipeId, sequelize, prova, provas, leitura: criarLeituraService({ sequelize, dirProvas, gerarJson: gerar }) };
}

test("leitura: grava as questões conferidas; a inventada vai para revisão; a contagem aparece na biblioteca", async (t) => {
  const { equipeId, prova, provas, leitura } = await montar(t);
  await (await leitura.iniciar(prova.id)).concluida;
  const { prova: lida, questoes } = await leitura.questoes(prova.id);
  assert.equal(lida.leitura_status, "lida");
  assert.deepEqual(
    questoes.map((q) => [q.numero, q.gabarito, q.status, q.problemas]),
    [
      [1, "C", "valida", []],
      [2, "A", "a_revisar", ["Enunciado não encontrado no texto da prova."]]
    ]
  );
  const [naBiblioteca] = await provas.biblioteca(equipeId);
  assert.deepEqual(naBiblioteca.questoes, { valida: 1, a_revisar: 1, descartada: 0 });
});

test("revisar questão; ler de novo com revisão feita pede confirmação", async (t) => {
  const { prova, leitura } = await montar(t);
  await (await leitura.iniciar(prova.id)).concluida;
  const { questoes } = await leitura.questoes(prova.id);
  const revisada = await leitura.revisarQuestao(prova.id, questoes[1].id, { enunciado: "Outra questão.", status: "valida" });
  assert.deepEqual([revisada.status, revisada.editada, Boolean(revisada.revisada_em)], ["valida", true, true]);
  await assert.rejects(leitura.revisarQuestao(prova.id, questoes[1].id, { gabarito: "F" }), { status: 400 });
  await assert.rejects(leitura.revisarQuestao(prova.id, questoes[1].id, { numero: 3 }), { status: 400 });

  await assert.rejects(leitura.iniciar(prova.id), { status: 409, dados: { codigo: "revisao_sera_perdida", revisadas: 1 } });
  await (await leitura.iniciar(prova.id, { confirmarPerdaDaRevisao: true })).concluida;
  const depois = await leitura.questoes(prova.id);
  assert.equal(depois.questoes[1].editada, false);
});

test("gabarito só com marca d'água: a IA lê o PDF; o orientador confere o gabarito inteiro", async (t) => {
  const marca = "pcimarkpci MjgwNDowMTRj:VGh1LCAy\nwww.pciconcursos.com.br";
  const anexos = [];
  // O gabarito traz duas versões e o caderno (versao: null) não diz qual é a dele.
  const gerar = async (pedido) => {
    if (!pedido.arquivos.length) return gerarJson(pedido);
    anexos.push(pedido.arquivos[0].mimeType);
    const versoes = [
      { versao: "Versão 1", respostas: [{ numero: 1, resposta: "D" }, { numero: 2, resposta: "D" }] },
      { versao: "Versão 2", respostas: [{ numero: 1, resposta: "C" }, { numero: 2, resposta: "A" }] }
    ];
    return { texto: JSON.stringify({ versoes }), modelo: "m", chave: "paga", tokens: 1 };
  };
  const { equipeId, prova, provas, leitura } = await montar(t, { paginasDoGabarito: [{ numero: 1, texto: marca }, { numero: 2, texto: marca }], gerar });
  const [naBiblioteca] = await provas.biblioteca(equipeId);
  assert.equal(naBiblioteca.gabarito.paginas_com_texto, 0);

  await (await leitura.iniciar(prova.id)).concluida;
  assert.deepEqual(anexos, ["application/pdf"]);
  let lida = await leitura.questoes(prova.id);
  assert.deepEqual([lida.prova.leitura.gabarito.lido_de, lida.prova.leitura.gabarito.versao_escolhida], ["imagem", null]);
  assert.deepEqual(lida.questoes.map((q) => [q.gabarito, q.problemas.at(-1)]), [[null, "Escolha a versão do gabarito."], [null, "Escolha a versão do gabarito."]]);
  await assert.rejects(leitura.conferirGabarito(prova.id, { respostas: [] }), { status: 400 });

  // O orientador escolhe a versão 2: as respostas dela vão para as questões, sem problema de "não encontrada no PDF".
  await assert.rejects(leitura.escolherVersaoDoGabarito(prova.id, { versao: 5 }), { status: 400 });
  lida = await leitura.escolherVersaoDoGabarito(prova.id, { versao: 1 });
  assert.deepEqual([lida.prova.leitura.gabarito.versao_escolhida, lida.prova.leitura.gabarito.conferido_em, lida.prova.leitura.versoes.gabarito], [1, null, "Versão 2"]);
  assert.equal(lida.prova.leitura.avisos.some((a) => a.includes("escolha a versão")), false);
  assert.deepEqual(lida.questoes.map((q) => [q.gabarito, q.status]), [["C", "valida"], ["A", "a_revisar"]]);

  await assert.rejects(leitura.conferirGabarito(prova.id, { respostas: [{ numero: 1, resposta: "F" }] }), { status: 400 });
  lida = await leitura.conferirGabarito(prova.id, { respostas: [{ numero: 1, resposta: "ANULADA" }, { numero: 2, resposta: "B" }] });
  assert.ok(lida.prova.leitura.gabarito.conferido_em);
  assert.deepEqual(
    lida.questoes.map((q) => [q.gabarito, q.anulada, q.status, q.problemas]),
    [
      [null, true, "a_revisar", ["Anulada no gabarito."]],
      ["B", false, "a_revisar", ["Enunciado não encontrado no texto da prova."]]
    ]
  );
});

test("várias versões sem a do caderno: a resolução da IA indica a versão quando a diferença é grande", async (t) => {
  const marca = "pcimarkpci x\nwww.pciconcursos.com.br";
  const prompts = [];
  const gerar = async (pedido) => {
    if (pedido.responseSchema.properties.versoes) {
      const versoes = [
        { versao: "Versão 1", respostas: [{ numero: 1, resposta: "D" }, { numero: 2, resposta: "D" }] },
        { versao: "Versão 2", respostas: [{ numero: 1, resposta: "C" }, { numero: 2, resposta: "A" }] }
      ];
      return { texto: JSON.stringify({ versoes }), modelo: "m", chave: "paga", tokens: 1 };
    }
    if (pedido.responseSchema.properties.respostas) {
      prompts.push(pedido.prompt);
      return { texto: JSON.stringify({ respostas: [{ numero: 1, resposta: "C" }, { numero: 2, resposta: "A" }] }), modelo: "m", chave: "paga", tokens: 1 };
    }
    return gerarJson(pedido);
  };
  const { prova, leitura } = await montar(t, { paginasDoGabarito: [{ numero: 1, texto: marca }], gerar });
  await (await leitura.iniciar(prova.id)).concluida;
  const lida = await leitura.questoes(prova.id);
  assert.match(prompts[0], /<<<QUESTÃO 1>>>\nAssinale a correta\./);
  assert.deepEqual(lida.prova.leitura.gabarito.indicacao, { consideradas: 2, batem: [0, 2], indice: 1 });
  assert.equal(lida.prova.leitura.gabarito.versao_escolhida, 1);
  assert.deepEqual(lida.questoes.map((q) => q.gabarito), ["C", "A"]);
  assert.equal(lida.prova.leitura.chamadas.length, 3);
});

test("leitura que falha grava o erro; reinício marca as interrompidas", async (t) => {
  const sequelize = await abrirBancoDeTeste(t);
  const equipeId = await criarEquipe(sequelize);
  const provas = criarProvasService({ sequelize, dirProvas: fs.mkdtempSync(path.join(os.tmpdir(), "edumind-provas-")), lerPaginas: async () => PAGINAS_DA_PROVA });
  const { prova } = await provas.enviarProva({ equipeId, buffer: Buffer.from("%PDF-1.4 x"), nomeArquivo: "x.pdf" });
  const falha = criarLeituraService({ sequelize, gerarJson: async () => ({ texto: JSON.stringify({ versao: null, questoes: [] }) }) });
  await (await falha.iniciar(prova.id)).concluida;
  const { prova: comErro } = await falha.questoes(prova.id);
  assert.deepEqual([comErro.leitura_status, comErro.leitura_erro], ["erro", "A leitura não encontrou nenhuma questão no PDF da prova."]);

  await sequelize.models.Prova.update({ leitura_status: "lendo" }, { where: { id: prova.id } });
  assert.equal(await falha.marcarInterrompidas(), 1);
});
