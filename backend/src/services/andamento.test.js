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
const { criarRevisaoService, itensDosMetadados } = require("./revisao.service");
const { criarFontesService } = require("./fontes.service");

const PAGINAS = [
  { numero: 1, texto: "TRIBUNAL DE JUSTIÇA\nFundação VUNESP\nLíngua Portuguesa 24 questões\nLei n.º 9.099 (artigos 60 a 62)." }
];
const trecho = (valor) => ({ valor, pagina: 1, source_excerpt: "TRIBUNAL DE JUSTIÇA" });
const METADADOS = {
  banca: trecho("Fundação VUNESP"),
  orgao: trecho("Tribunal de Justiça"),
  cargo: null,
  data_publicacao: null,
  blocos: [
    {
      nome: "Conhecimentos Gerais",
      pagina: 1,
      source_excerpt: "Língua Portuguesa",
      disciplinas: [{ nome: "Língua Portuguesa", questoes: 24, pagina: 1, source_excerpt: "Língua Portuguesa 24 questões" }]
    }
  ],
  regras_de_corte: [],
  discursiva: null
};
const ARVORE = {
  blocos: [
    {
      texto: "Conhecimentos Gerais",
      pagina: 1,
      source_excerpt: "Língua Portuguesa",
      disciplinas: [
        {
          texto: "Direito",
          pagina: 1,
          source_excerpt: "Lei n.º 9.099",
          assuntos: [
            {
              texto: "Lei n.º 9.099 (artigos 60 a 62).",
              pagina: 1,
              source_excerpt: "Lei n.º 9.099 (artigos 60 a 62).",
              normas: [{ tipo: "Lei", numero: "9.099", ano: "1995", nome: null, artigos_texto: "artigos 60 a 62" }],
              subassuntos: []
            }
          ]
        }
      ]
    }
  ]
};
const gerarJson = async ({ responseSchema }) => ({
  texto: JSON.stringify(responseSchema.properties.banca ? METADADOS : ARVORE),
  modelo: "m",
  chave: "paga",
  tokens: 1
});

async function montar(t) {
  const sequelize = await abrirBancoDeTeste(t);
  const equipeId = await criarEquipe(sequelize);
  const editais = criarEditalService({
    sequelize,
    dirUploads: fs.mkdtempSync(path.join(os.tmpdir(), "edumind-")),
    lerPaginas: async () => PAGINAS
  });
  const { edital } = await editais.criarAPartirDoPdf({ equipeId, buffer: Buffer.from("%PDF-1.4 a"), nomeArquivo: "a.pdf" });
  const andamento = async () => (await editais.listar(equipeId)).find((e) => e.id === edital.id).andamento;
  return { sequelize, editais, edital, andamento };
}

test("edital sem extração não tem andamento; a lista não devolve os metadados", async (t) => {
  const { editais, andamento, sequelize } = await montar(t);
  assert.equal(await andamento(), null);
  const { id: equipeId } = await sequelize.models.Equipe.findOne({ raw: true });
  assert.equal("metadados" in (await editais.listar(equipeId))[0], false);
});

test("o andamento segue revisão, fontes e cobertura", async (t) => {
  const { sequelize, editais, edital, andamento } = await montar(t);
  await (await criarExtracaoService({ sequelize, gerarJson }).iniciar(edital.id)).concluida;

  // Tudo em rascunho: 3 itens na árvore (bloco, disciplina, assunto) e 4 nos dados do concurso (banca, órgão, bloco,
  // disciplina). As normas só contam depois de aprovadas.
  assert.deepEqual(await andamento(), { etapa: "revisao", revisao_pendentes: 7, fontes_pendentes: 0 });

  const revisao = criarRevisaoService({ sequelize });
  const itens = await editais.conteudo(edital.id);
  for (const item of itens) await revisao.revisarItem(edital.id, item.id, { status: item.nivel === "bloco" ? "rejeitado" : "aprovado" });
  // O assunto que cita a Lei 9.099 foi aprovado: a norma já conta nas Fontes, mas a etapa ainda é a revisão.
  assert.deepEqual(await andamento(), { etapa: "revisao", revisao_pendentes: 4, fontes_pendentes: 1 });

  const { metadados } = await editais.buscar(edital.id);
  for (const { caminho } of itensDosMetadados(metadados)) await revisao.revisarMetadado(edital.id, { caminho, status: "aprovado" });
  // Revisão concluída; a Lei 9.099 ainda não teve a identidade confirmada.
  assert.deepEqual(await andamento(), { etapa: "fontes", revisao_pendentes: 0, fontes_pendentes: 1 });

  const fontes = criarFontesService({ sequelize, dirNormas: fs.mkdtempSync(path.join(os.tmpdir(), "edumind-normas-")) });
  const [grupo] = await fontes.listar(edital.id);
  const norma = await fontes.confirmar(edital.id, {
    citacoes: grupo.citacoes.map((c) => c.id),
    jurisdicao: "br",
    tipo: "Lei",
    numero: "9.099",
    ano: "1995",
    nome: "Juizados Especiais"
  });
  // Confirmada, mas sem texto: continua pendente.
  assert.deepEqual(await andamento(), { etapa: "fontes", revisao_pendentes: 0, fontes_pendentes: 1 });

  await sequelize.models.NormaVersao.create({ id: crypto.randomUUID(), norma_id: norma.id, origem: "upload", status: "upload_recebido" });
  assert.deepEqual(await andamento(), { etapa: "pronto", revisao_pendentes: 0, fontes_pendentes: 0 });
});
