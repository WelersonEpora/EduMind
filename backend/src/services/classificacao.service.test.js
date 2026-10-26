"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste, criarEquipe } = require("../../test/helpers/banco");
const { criarProvasService } = require("./provas.service");
const { criarLeituraService } = require("./leitura.service");
const { criarClassificacaoService } = require("./classificacao.service");

const TEXTO = "01. Sobre o teletrabalho, é correto.\n(A) Um.\n(B) Dois.\n(C) Três.\n(D) Quatro.\n(E) Cinco.\n02. Quanto é 2 + 2?\n(A) 1.\n(B) 2.\n(C) 3.\n(D) 4.\n(E) 5.";
const alternativas = (...t) => t.map((texto, i) => ({ letra: "ABCDE"[i], texto }));
const leituraFalsa = async () => ({
  texto: JSON.stringify({
    versao: null,
    questoes: [
      { numero: 1, disciplina: "Legislação", pagina: 1, apoio: null, enunciado: "Sobre o teletrabalho, é correto.", alternativas: alternativas("Um.", "Dois.", "Três.", "Quatro.", "Cinco."), depende_de_imagem: false },
      { numero: 2, disciplina: "Matemática", pagina: 1, apoio: null, enunciado: "Quanto é 2 + 2?", alternativas: alternativas("1.", "2.", "3.", "4.", "5."), depende_de_imagem: false }
    ]
  })
});

async function montar(t, resposta) {
  const sequelize = await abrirBancoDeTeste(t);
  const equipeId = await criarEquipe(sequelize);
  const { Norma, NormaVersao, NormaArtigo } = sequelize.models;
  const norma = await Norma.create({ id: crypto.randomUUID(), chave: "tjsp:resolucao:850:2021", tipo: "Resolução", numero: "850", ano: "2021", nome: "Resolução nº 850/2021", jurisdicao: "TJSP", esfera: "tribunal" });
  const versao = await NormaVersao.create({ id: crypto.randomUUID(), norma_id: norma.id, origem: "upload", status: "upload_recebido", processada_em: new Date() });
  for (const [ordem, numero] of ["7", "8"].entries()) {
    await NormaArtigo.create({ id: crypto.randomUUID(), versao_id: versao.id, numero, ordem, texto_bruto: `Art. ${numero}. Texto.`, revogado: false, notas: [] });
  }
  const provas = criarProvasService({ sequelize, dirProvas: fs.mkdtempSync(path.join(os.tmpdir(), "edumind-provas-")), lerPaginas: async () => [{ numero: 1, texto: TEXTO }] });
  const { prova } = await provas.enviarProva({ equipeId, buffer: Buffer.from("%PDF-1.4 p"), nomeArquivo: "p.pdf", campos: { ano: "2025" } });
  const leitura = criarLeituraService({ sequelize, gerarJson: leituraFalsa });
  const classificacao = criarClassificacaoService({ sequelize, gerarJson: async () => ({ texto: JSON.stringify(resposta) }) });
  return { equipeId, sequelize, norma, prova, provas, leitura, classificacao };
}

const RESPOSTA = {
  questoes: [
    { numero: 1, juridica: true, referencias: [{ norma: "tjsp:resolucao:850:2021", norma_citada: "Resolução 850", artigo: "7º", papel: "principal" }] },
    { numero: 2, juridica: false, referencias: [] }
  ]
};

test("classificar exige a leitura; grava referências e contagem; revisão do orientador é mantida ao classificar de novo", async (t) => {
  const { equipeId, norma, prova, provas, leitura, classificacao } = await montar(t, RESPOSTA);
  await assert.rejects(classificacao.iniciar(prova.id), { status: 400 });
  await (await leitura.iniciar(prova.id)).concluida;
  await (await classificacao.iniciar(prova.id)).concluida;

  let { prova: lida, questoes } = await leitura.questoes(prova.id);
  assert.equal(lida.classificacao_status, "classificada");
  assert.deepEqual(
    questoes.map((q) => [q.numero, q.classificacao_status, q.referencias.map((r) => `${r.norma}:${r.artigo}:${r.papel}`)]),
    [
      [1, "classificada", ["Resolução nº 850/2021:7:principal"]],
      [2, "nao_juridica", []]
    ]
  );
  assert.deepEqual((await provas.biblioteca(equipeId))[0].classificadas, { classificada: 1, a_revisar: 0, nao_juridica: 1 });

  // O orientador troca para o art. 99 (não existe) e o 8 relacionado: o código confere de novo.
  const revisada = await classificacao.revisar(prova.id, questoes[0].id, {
    referencias: [{ norma_id: norma.id, artigo: "99", papel: "principal" }, { norma_id: norma.id, artigo: "8", papel: "relacionado" }]
  });
  assert.equal(revisada.classificacao_status, "a_revisar");
  assert.deepEqual(revisada.classificacao_problemas, ["Art. 99 (Resolução nº 850/2021) não existe no texto da biblioteca."]);
  await assert.rejects(classificacao.revisar(prova.id, questoes[0].id, { referencias: [{ norma_id: crypto.randomUUID(), artigo: "1", papel: "principal" }] }), { status: 400 });

  // Classificar de novo mantém a questão revisada.
  await (await classificacao.iniciar(prova.id)).concluida;
  ({ questoes } = await leitura.questoes(prova.id));
  assert.deepEqual(questoes[0].referencias.map((r) => r.artigo), ["99", "8"]);

  // Ler de novo a prova apaga a classificação.
  await (await leitura.iniciar(prova.id, { confirmarPerdaDaRevisao: true })).concluida;
  ({ prova: lida, questoes } = await leitura.questoes(prova.id));
  assert.deepEqual([lida.classificacao_status, questoes[0].referencias], [null, []]);
});
