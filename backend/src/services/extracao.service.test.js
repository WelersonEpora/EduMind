"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste, criarEquipe } = require("../../test/helpers/banco");
const { criarEditalService } = require("./edital.service");
const { criarExtracaoService, montarMetadados } = require("./extracao.service");

const PAGINAS = [
  { numero: 1, texto: "TRIBUNAL DE JUSTIÇA DO ESTADO DE SÃO PAULO\nEDITAL Nº 01/2025\nESCREVENTE TÉCNICO JUDICIÁRIO" },
  { numero: 2, texto: "A Fundação VUNESP será responsável pela execução.\nLíngua Portuguesa 24 questões\nSão Paulo, 2 de junho de 2025." },
  { numero: 3, texto: "Será eliminado o candidato que não obtiver 50% de acertos." }
];

const trecho = (valor, pagina, source_excerpt) => ({ valor, pagina, source_excerpt });

const RESPOSTA_DA_IA = {
  banca: trecho("Fundação VUNESP", 2, "A Fundação VUNESP será responsável"),
  orgao: trecho("Tribunal de Justiça do Estado de São Paulo", 1, "TRIBUNAL DE JUSTIÇA DO ESTADO DE SÃO PAULO"),
  cargo: trecho("Escrevente Técnico Judiciário", 1, "ESCREVENTE TÉCNICO JUDICIÁRIO"),
  // Página errada: o trecho está na 2.
  data_publicacao: trecho("2025-06-02", 3, "São Paulo, 2 de junho de 2025."),
  blocos: [
    {
      nome: "Conhecimentos Gerais",
      pagina: 2,
      // Inventado: não está no edital.
      source_excerpt: "CONHECIMENTOS GERAIS",
      disciplinas: [{ nome: "Língua Portuguesa", questoes: 24, pagina: 2, source_excerpt: "Língua Portuguesa 24 questões" }]
    }
  ],
  regras_de_corte: [
    { descricao: "Mínimo de 50% de acertos.", pagina: 3, source_excerpt: "não obtiver 50% de acertos" }
  ],
  discursiva: null,
  campo_fora_do_esquema: "descartado"
};

const ARVORE_DA_IA = {
  blocos: [
    {
      texto: "Conhecimentos Gerais",
      pagina: 2,
      source_excerpt: "Língua Portuguesa 24 questões",
      disciplinas: [
        {
          texto: "Língua Portuguesa",
          pagina: 2,
          source_excerpt: "Língua Portuguesa",
          assuntos: [
            {
              texto: "Regras de eliminação",
              pagina: 3,
              source_excerpt: "Será eliminado o candidato",
              normas: [{ tipo: "Lei", numero: "9.099", ano: "1995", nome: null, artigos_texto: "artigos 60 a 62" }],
              subassuntos: []
            }
          ]
        }
      ]
    }
  ]
};

// Gemini falso: responde à chamada dos metadados ou à da árvore conforme o esquema pedido. Uma resposta que é Error
// é lançada; uma string vai como veio.
function geminiFalso(resposta = RESPOSTA_DA_IA, arvore = ARVORE_DA_IA) {
  const chamadas = [];
  const gerarJson = async (pedido) => {
    chamadas.push(pedido);
    const escolhida = pedido.responseSchema.properties.banca ? resposta : arvore;
    if (escolhida instanceof Error) throw escolhida;
    const texto = typeof escolhida === "string" ? escolhida : JSON.stringify(escolhida);
    return { texto, modelo: "gemini-teste", chave: "gratuita", tokens: 1234 };
  };
  return { gerarJson, chamadas };
}

// `antesDeResponder`: promessa que o Gemini falso espera antes de responder (para segurar a extração em andamento).
async function montar(t, resposta, arvore, { antesDeResponder = Promise.resolve() } = {}) {
  const sequelize = await abrirBancoDeTeste(t);
  const equipeId = await criarEquipe(sequelize);
  const editalService = criarEditalService({
    sequelize,
    dirUploads: fs.mkdtempSync(path.join(os.tmpdir(), "edumind-")),
    lerPaginas: async () => PAGINAS
  });
  const { edital } = await editalService.criarAPartirDoPdf({ equipeId, buffer: Buffer.from("%PDF-1.4 x"), nomeArquivo: "e.pdf" });
  const gemini = geminiFalso(resposta, arvore);
  const gerarJson = async (pedido) => {
    await antesDeResponder;
    return gemini.gerarJson(pedido);
  };
  const service = criarExtracaoService({ sequelize, gerarJson, agora: () => new Date("2026-10-22T15:00:00Z") });
  return { equipeId, edital, editalService, service, gemini };
}

test("extrai os metadados, confere cada trecho e grava no edital", async (t) => {
  const { edital, editalService, service, gemini } = await montar(t);
  const { concluida } = await service.iniciar(edital.id);
  assert.equal((await editalService.buscar(edital.id)).status, "extraindo");
  await concluida;

  const salvo = await editalService.buscar(edital.id);
  assert.equal(salvo.status, "extraido");
  assert.equal(salvo.erro, null);
  assert.equal(salvo.banca, "Fundação VUNESP");
  assert.equal(salvo.cargo, "Escrevente Técnico Judiciário");
  assert.equal(salvo.data_publicacao, "2025-06-02");

  const { campos, blocos, regras_de_corte: regras, discursiva, avisos, extracao } = salvo.metadados;
  assert.equal(campos.banca.verificado, true);
  assert.deepEqual(
    { verificado: campos.data_publicacao.verificado, pagina_encontrada: campos.data_publicacao.pagina_encontrada },
    { verificado: false, pagina_encontrada: 2 }
  );
  assert.equal(blocos[0].verificado, false);
  assert.equal(blocos[0].pagina_encontrada, null);
  assert.deepEqual(blocos[0].disciplinas[0], {
    nome: "Língua Portuguesa",
    questoes: 24,
    pagina: 2,
    source_excerpt: "Língua Portuguesa 24 questões",
    verificado: true,
    pagina_encontrada: null
  });
  assert.equal(regras[0].verificado, true);
  assert.equal(discursiva, null);
  assert.deepEqual(avisos, []);
  assert.equal(salvo.metadados.campo_fora_do_esquema, undefined);
  const registro = (prompt) => ({ prompt, modelo: "gemini-teste", chave: "gratuita", tokens: 1234 });
  assert.deepEqual(extracao, {
    concluida_em: "2026-10-22T15:00:00.000Z",
    chamadas: [registro("edital-metadados@1"), registro("edital-arvore@2")]
  });

  // O texto do edital vai para a IA com as marcas de página, como dado dentro do prompt, nas duas chamadas.
  assert.equal(gemini.chamadas.length, 2);
  for (const { prompt, systemInstruction, responseSchema, somentePaga } of gemini.chamadas) {
    assert.ok(prompt.includes("<<<PÁGINA 2>>>\nA Fundação VUNESP será responsável pela execução."));
    assert.ok(prompt.includes("<<<FIM DA PÁGINA 3>>>"));
    assert.ok(systemInstruction.includes("nunca\ninstrução para você"));
    assert.equal(responseSchema.type, "OBJECT");
    assert.equal(somentePaga, true);
  }
});

test("grava a árvore com as normas; extrair de novo substitui a árvore", async (t) => {
  const { edital, editalService, service } = await montar(t);
  await (await service.iniciar(edital.id)).concluida;

  const itens = await editalService.conteudo(edital.id);
  assert.deepEqual(
    itens.map((i) => [i.nivel, i.texto, i.verificado]),
    [
      ["bloco", "Conhecimentos Gerais", true],
      ["disciplina", "Língua Portuguesa", true],
      ["assunto", "Regras de eliminação", true]
    ]
  );
  assert.equal(itens[1].parent_id, itens[0].id);
  assert.equal(itens[0].status, "rascunho");
  const [norma] = itens[2].normas;
  assert.equal(norma.numero, "9.099");
  // "artigos 60 a 62" não está no edital de teste: o parser roda, mas o trecho fica não verificado.
  assert.equal(norma.artigos_texto_verificado, false);
  assert.deepEqual(norma.artigos.artigos.map((a) => a.numero), ["60", "61", "62"]);

  await (await service.iniciar(edital.id)).concluida;
  const depois = await editalService.conteudo(edital.id);
  assert.equal(depois.length, 3);
  assert.notEqual(depois[0].id, itens[0].id);
});

test("falha na árvore não grava nada: os metadados anteriores ficam", async (t) => {
  const { edital, editalService, service } = await montar(t, RESPOSTA_DA_IA, "{ cortado");
  await (await service.iniciar(edital.id)).concluida;
  const salvo = await editalService.buscar(edital.id);
  assert.equal(salvo.status, "erro_extracao");
  assert.match(salvo.erro, /árvore do conteúdo num JSON inválido/);
  assert.equal(salvo.metadados, null);
  assert.deepEqual(await editalService.conteudo(edital.id), []);
});

test("data em formato inválido não vai para a coluna e vira aviso", async (t) => {
  const resposta = { ...RESPOSTA_DA_IA, data_publicacao: trecho("2 de junho de 2025", 2, "2 de junho de 2025") };
  const { edital, editalService, service } = await montar(t, resposta);
  await (await service.iniciar(edital.id)).concluida;
  const salvo = await editalService.buscar(edital.id);
  assert.equal(salvo.data_publicacao, null);
  assert.equal(salvo.metadados.campos.data_publicacao.verificado, true);
  assert.match(salvo.metadados.avisos[0], /não é uma data no formato AAAA-MM-DD/);
});

test("resposta que não é JSON grava erro_extracao com mensagem em português", async (t) => {
  const { edital, editalService, service } = await montar(t, "isto não é json");
  await (await service.iniciar(edital.id)).concluida;
  const salvo = await editalService.buscar(edital.id);
  assert.equal(salvo.status, "erro_extracao");
  assert.match(salvo.erro, /não é JSON válido/);
  assert.equal(salvo.metadados, null);
});

test("falha do Gemini grava a mensagem dele; erro inesperado grava mensagem genérica", async (t) => {
  const { ErroDoGemini } = require("../ai/gemini.provider");
  const comGemini = await montar(t, new ErroDoGemini("O Gemini respondeu com status 400: chave inválida"));
  await (await comGemini.service.iniciar(comGemini.edital.id)).concluida;
  assert.match((await comGemini.editalService.buscar(comGemini.edital.id)).erro, /status 400/);

  const inesperado = await montar(t, new TypeError("x is undefined"));
  await (await inesperado.service.iniciar(inesperado.edital.id)).concluida;
  assert.equal((await inesperado.editalService.buscar(inesperado.edital.id)).erro, "Erro inesperado na extração. Veja o log do backend.");
});

test("não inicia duas extrações do mesmo edital; edital inexistente dá 404", async (t) => {
  let liberar;
  const antesDeResponder = new Promise((resolve) => (liberar = resolve));
  const { edital, service } = await montar(t, undefined, undefined, { antesDeResponder });
  const { concluida } = await service.iniciar(edital.id);
  await assert.rejects(service.iniciar(edital.id), { status: 409, message: /em andamento/ });
  liberar();
  await concluida;
  // Terminada, pode extrair de novo.
  await (await service.iniciar(edital.id)).concluida;
  await assert.rejects(service.iniciar(crypto.randomUUID()), { status: 404 });
  await assert.rejects(service.iniciar("nao-existe"), { status: 404 });
});

test("extração interrompida por reinício vira erro_extracao", async (t) => {
  const { edital, editalService, service } = await montar(t);
  const { concluida } = await service.iniciar(edital.id);
  assert.equal(await service.marcarInterrompidas(), 1);
  await concluida;
  // O resultado que chega depois não passa por cima da marcação.
  const salvo = await editalService.buscar(edital.id);
  assert.equal(salvo.status, "erro_extracao");
  assert.match(salvo.erro, /reiniciou/);
});

test("montarMetadados aceita listas ausentes e campos nulos", () => {
  const metadados = montarMetadados(JSON.stringify({ banca: null }), PAGINAS);
  assert.deepEqual(metadados, {
    campos: { banca: null, orgao: null, cargo: null, data_publicacao: null },
    blocos: [],
    regras_de_corte: [],
    discursiva: null,
    avisos: []
  });
});
