"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { abrirBancoDeTeste, criarEquipe } = require("../../test/helpers/banco");
const { criarEditalService } = require("./edital.service");
const { criarExtracaoService } = require("./extracao.service");
const { criarRevisaoService } = require("./revisao.service");
const { criarFontesService } = require("./fontes.service");
const { criarCoberturaService, abrangenciaDe, versaoDoEdital } = require("./cobertura.service");

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

async function montar(t) {
  const sequelize = await abrirBancoDeTeste(t);
  const equipeId = await criarEquipe(sequelize);
  const editalService = criarEditalService({
    sequelize,
    dirUploads: fs.mkdtempSync(path.join(os.tmpdir(), "edumind-")),
    lerPaginas: async () => PAGINAS
  });
  const { edital } = await editalService.criarAPartirDoPdf({ equipeId, buffer: Buffer.from("%PDF-1.4 cobertura"), nomeArquivo: "a.pdf" });
  const gerarJson = async ({ responseSchema }) => ({
    texto: JSON.stringify(responseSchema.properties.banca ? { banca: null } : ARVORE),
    modelo: "m",
    chave: "paga",
    tokens: 1
  });
  await (await criarExtracaoService({ sequelize, gerarJson }).iniciar(edital.id)).concluida;
  const revisao = criarRevisaoService({ sequelize });
  for (const item of (await editalService.conteudo(edital.id)).filter((i) => i.normas.length > 0)) {
    await revisao.revisarItem(edital.id, item.id, { status: "aprovado" });
  }
  await sequelize.models.Edital.update({ data_publicacao: "2025-07-29" }, { where: { id: edital.id } });
  const fontes = criarFontesService({
    sequelize,
    dirNormas: fs.mkdtempSync(path.join(os.tmpdir(), "edumind-normas-")),
    agora: () => new Date("2026-10-22T21:00:00Z")
  });
  return { equipeId, sequelize, edital, fontes, service: criarCoberturaService({ sequelize }) };
}

async function confirmar(fontes, edital, chave, identidade) {
  const fonte = (await fontes.listar(edital.id)).find((f) => f.proposta?.chave === chave);
  return fontes.confirmar(edital.id, { citacoes: fonte.citacoes.map((c) => c.id), ...identidade });
}

test("abrangência da citação: artigos, norma inteira ou estrutura", () => {
  const artigos = { artigos: [{ numero: "1", origem: "explicito" }] };
  assert.equal(abrangenciaDe({ artigos_texto: "artigos 1 a 5", artigos }), "artigos");
  assert.equal(abrangenciaDe({ artigos_texto: null, artigos: null }), "norma_inteira");
  assert.equal(abrangenciaDe({ artigos_texto: "  ", artigos: null }), "norma_inteira");
  assert.equal(abrangenciaDe({ artigos_texto: "Título II - Capítulos I e II; e o artigo 92", artigos }), "estrutura");
  assert.equal(abrangenciaDe({ artigos_texto: "Tomo I – Capítulo II: Seção I", artigos: { artigos: [] } }), "estrutura");
});

test("versão do edital: a mais recente até a data do edital; sem nenhuma, a mais antiga depois", () => {
  const v = (id, data_versao) => ({ id, data_versao });
  assert.equal(versaoDoEdital([], "2025-07-29"), null);
  assert.deepEqual(versaoDoEdital([v("a", "2020-01-01"), v("b", "2024-05-02"), v("c", "2026-01-01")], "2025-07-29"), {
    versao: v("b", "2024-05-02"),
    criterio: "anterior"
  });
  assert.deepEqual(versaoDoEdital([v("c", "2026-03-01"), v("d", null), v("e", "2025-09-01")], "2025-07-29"), {
    versao: v("e", "2025-09-01"),
    criterio: "posterior"
  });
  assert.equal(versaoDoEdital([v("a", "2020-01-01"), v("c", "2026-01-01")], null).versao.id, "c");
});

test("cobertura: encontrado, revogado, faltando, letra no intervalo, vigência e norma inteira", async (t) => {
  const { equipeId, edital, fontes, service } = await montar(t);
  const cp = await confirmar(fontes, edital, "br:decreto-lei:2848:1940", {
    jurisdicao: "BR",
    tipo: "Decreto-Lei",
    numero: "2.848",
    ano: "1940",
    nome: "Código Penal"
  });
  const html = `<html><head><meta charset="utf-8"></head><body>
<p>Art. 293. Falsificar papéis públicos. (Redação dada pela Lei nº 15.100, de 10.3.2026)</p>
<p>Art. 294. (Revogado pela Lei nº 11.111, de 10.1.2019)</p>
<p>Art. 295-A. Novo crime. (Incluído pela Lei nº 12.000, de 2.2.2012)</p>
<p>Art. 296. Fora do edital.</p>
</body></html>`;
  await fontes.enviarVersao(cp.id, { buffer: Buffer.from(html), nomeArquivo: "cp.html" });
  await confirmar(fontes, edital, "sp:lei:10261:1968", { jurisdicao: "SP", tipo: "Lei", numero: "10.261", ano: "1968", nome: "Estatuto" });

  const { disciplinas, resumo } = await service.cobertura(edital.id);
  assert.equal(disciplinas.length, 1);
  const [cpItem, leiItem, estatutoItem] = disciplinas[0].itens.map((i) => i.citacoes[0]);

  assert.equal(cpItem.situacao, "com_texto");
  assert.equal(cpItem.versao.criterio, "posterior");
  assert.deepEqual(
    cpItem.artigos.map((a) => [a.numero, a.origem, a.situacao, a.vigencia]),
    [
      ["293", "intervalo", "encontrado", "depois"],
      ["294", "intervalo", "revogado", null],
      ["295", "intervalo", "faltando", null],
      ["295-A", "letra_no_intervalo", "encontrado", null]
    ]
  );
  assert.equal(leiItem.situacao, "sem_identidade");
  assert.deepEqual([estatutoItem.situacao, estatutoItem.abrangencia], ["sem_texto", "norma_inteira"]);
  assert.deepEqual(resumo, {
    citacoes: 3,
    sem_identidade: 1,
    sem_texto: 1,
    estrutura_pendente: 0,
    artigos: 4,
    encontrados: 2,
    revogados: 1,
    faltando: 1,
    alterados_depois: 1,
    talvez_alterados_depois: 0,
    artigos_com_questoes: 0,
    questoes: 0
  });

  // Norma inteira com texto: todos os artigos da versão entram.
  const estatuto = (await fontes.biblioteca(equipeId)).find((n) => n.chave === "sp:lei:10261:1968");
  await fontes.enviarVersao(estatuto.id, { buffer: Buffer.from("<p>Art. 1º Primeiro.</p><p>Art. 2º Segundo.</p>"), nomeArquivo: "e.html" });
  const depois = await service.cobertura(edital.id);
  assert.deepEqual(
    depois.disciplinas[0].itens[2].citacoes[0].artigos.map((a) => [a.numero, a.origem, a.situacao]),
    [
      ["1", "norma_inteira", "encontrado"],
      ["2", "norma_inteira", "encontrado"]
    ]
  );
});

test("cobertura de edital inexistente é 404", async (t) => {
  const sequelize = await abrirBancoDeTeste(t);
  const equipeId = await criarEquipe(sequelize);
  await assert.rejects(criarCoberturaService({ sequelize }).cobertura("nao-e-uuid"), { status: 404 });
});

test("estrutura: o código acha os artigos; só entram depois da conferência, que cai se o trecho mudar", async (t) => {
  const { sequelize, edital, fontes, service } = await montar(t);
  const cp = await confirmar(fontes, edital, "br:decreto-lei:2848:1940", {
    jurisdicao: "BR",
    tipo: "Decreto-Lei",
    numero: "2.848",
    ano: "1940",
    nome: "Código Penal"
  });
  const html = `<html><head><meta charset="utf-8"></head><body>
<p>TÍTULO I</p><p>Art. 1º Primeiro.</p>
<p>TÍTULO II</p><p>CAPÍTULO I</p><p>Art. 2º Segundo.</p><p>Art. 3º Terceiro.</p>
<p>CAPÍTULO II</p><p>Art. 4º (Revogado pela Lei nº 1, de 2.1.2000)</p>
<p>CAPÍTULO III</p><p>Art. 5º Quinto.</p>
</body></html>`;
  await fontes.enviarVersao(cp.id, { buffer: Buffer.from(html), nomeArquivo: "cp.html" });
  const citacao = await sequelize.models.ItemNorma.findOne({ where: { norma_id: cp.id } });
  const revisao = criarRevisaoService({ sequelize });
  await revisao.revisarNorma(edital.id, citacao.id, { artigos_texto: "Título II - Capítulos I e II; Capítulo IV; e também o artigo 1" });

  const citacaoDaCobertura = async () => (await service.cobertura(edital.id)).disciplinas[0].itens[0].citacoes[0];
  let coberta = await citacaoDaCobertura();
  assert.equal(coberta.abrangencia, "estrutura");
  assert.deepEqual(
    coberta.estrutura.partes.map((p) => [p.descricao, p.artigos.map((a) => `${a.numero}:${a.situacao}`)]),
    [
      ["Título II › Capítulos I e II", ["2:encontrado", "3:encontrado", "4:revogado"]],
      ["Título II › Capítulo IV", []]
    ]
  );
  assert.deepEqual(coberta.estrutura.avisos, ["Título II › Capítulo IV: não achado no texto da norma."]);
  // Antes da conferência, só o artigo citado pelo número conta.
  assert.deepEqual([coberta.estrutura.conferida, coberta.artigos.map((a) => a.numero)], [false, ["1"]]);
  assert.equal((await service.cobertura(edital.id)).resumo.estrutura_pendente, 1);

  coberta = await service.conferirEstrutura(edital.id, citacao.id, { conferida: true });
  assert.equal(coberta.estrutura.conferida, true);
  assert.deepEqual(coberta.artigos.map((a) => [a.numero, a.origem]), [
    ["1", "explicito"],
    ["2", "estrutura"],
    ["3", "estrutura"],
    ["4", "estrutura"]
  ]);
  assert.equal((await service.cobertura(edital.id)).resumo.estrutura_pendente, 0);

  // Corrigir o trecho na revisão derruba a conferência.
  await revisao.revisarNorma(edital.id, citacao.id, { artigos_texto: "Título II - Capítulo III" });
  coberta = await citacaoDaCobertura();
  assert.deepEqual([coberta.estrutura.conferida, coberta.estrutura.mudou, coberta.artigos.length], [false, true, 0]);

  // Desfazer; validações.
  coberta = await service.conferirEstrutura(edital.id, citacao.id, { conferida: false });
  assert.deepEqual([coberta.estrutura.conferida, coberta.estrutura.mudou], [false, false]);
  await assert.rejects(service.conferirEstrutura(edital.id, citacao.id, {}), { status: 400 });
  await revisao.revisarNorma(edital.id, citacao.id, { artigos_texto: "Título IX" });
  await assert.rejects(service.conferirEstrutura(edital.id, citacao.id, { conferida: true }), { status: 409 });
  await revisao.revisarNorma(edital.id, citacao.id, { artigos_texto: "artigos 1 a 3" });
  await assert.rejects(service.conferirEstrutura(edital.id, citacao.id, { conferida: true }), { status: 400 });
});

test("incidência: principal e relacionado separados, só as provas do edital, sem descartadas nem não jurídicas", async (t) => {
  const { equipeId, sequelize, edital, fontes, service } = await montar(t);
  const cp = await confirmar(fontes, edital, "br:decreto-lei:2848:1940", {
    jurisdicao: "BR",
    tipo: "Decreto-Lei",
    numero: "2.848",
    ano: "1940",
    nome: "Código Penal"
  });
  const html = "<p>Art. 293. Um.</p><p>Art. 294. Dois.</p><p>Art. 295. Três.</p><p>Art. 296. Fora do edital.</p>";
  await fontes.enviarVersao(cp.id, { buffer: Buffer.from(html), nomeArquivo: "cp.html" });

  const { Prova, ProvaQuestao, EditalProva, QuestaoArtigo } = sequelize.models;
  const alternativas = ["A", "B", "C", "D", "E"].map((letra) => ({ letra, texto: letra }));
  const prova = async (ano, doEdital, classificacao_status = "classificada") => {
    const id = randomUUID();
    await Prova.create({ id, equipe_id: equipeId, banca: "VUNESP", ano, classificacao_status });
    if (doEdital) await EditalProva.create({ edital_id: edital.id, prova_id: id });
    return id;
  };
  let numero = 0;
  const questao = async (provaId, referencias, extras = {}) => {
    const id = randomUUID();
    numero += 1;
    await ProvaQuestao.create({ id, prova_id: provaId, numero, enunciado: "?", alternativas, status: "valida", classificacao_status: "classificada", ...extras });
    for (const [artigo, papel] of referencias) await QuestaoArtigo.create({ id: randomUUID(), questao_id: id, norma_id: cp.id, artigo, papel });
  };
  const p2021 = await prova(2021, true);
  const p2023 = await prova(2023, true);
  const deOutroEdital = await prova(2024, false);
  await prova(2025, true, null);

  await questao(p2021, [["293", "principal"], ["294", "relacionado"]]);
  await questao(p2021, [["293", "principal"]], { classificacao_status: "a_revisar" });
  await questao(p2023, [["293", "relacionado"], ["296", "principal"]]);
  await questao(p2023, [["294", "principal"]], { status: "descartada" });
  await questao(p2023, [["294", "principal"]], { classificacao_status: "nao_juridica" });
  await questao(deOutroEdital, [["293", "principal"]]);

  const { provas, resumo, disciplinas } = await service.cobertura(edital.id);
  assert.deepEqual(provas.map((p) => [p.ano, p.classificacao_status]), [[2025, null], [2023, "classificada"], [2021, "classificada"]]);
  const artigos = disciplinas[0].itens[0].citacoes[0].artigos;
  assert.deepEqual(
    artigos.map((a) => [a.numero, a.incidencia]),
    [
      ["293", { principal: 2, relacionado: 1, provas: 2, ultimo_ano: 2023 }],
      ["294", { principal: 0, relacionado: 1, provas: 1, ultimo_ano: 2021 }],
      ["295", { principal: 0, relacionado: 0, provas: 0, ultimo_ano: null }]
    ]
  );
  assert.deepEqual([resumo.artigos_com_questoes, resumo.questoes], [2, 3]);

  // Totais por item e por disciplina: questões distintas; a principal num artigo e relacionada em outro conta uma vez,
  // como principal.
  assert.deepEqual(disciplinas[0].itens[0].incidencia, { questoes: 3, principal: 2, relacionado: 1, provas: 2 });
  assert.deepEqual(disciplinas[0].incidencia, { questoes: 3, principal: 2, relacionado: 1, provas: 2 });
});

test("fora do edital: artigo não pedido, norma não citada e norma citada sem texto", async (t) => {
  const { equipeId, sequelize, edital, fontes, service } = await montar(t);
  const cp = await confirmar(fontes, edital, "br:decreto-lei:2848:1940", {
    jurisdicao: "BR",
    tipo: "Decreto-Lei",
    numero: "2.848",
    ano: "1940",
    nome: "Código Penal"
  });
  await fontes.enviarVersao(cp.id, { buffer: Buffer.from("<p>Art. 293. Um.</p><p>Art. 296. Fora.</p>"), nomeArquivo: "cp.html" });
  // O Estatuto é citado no edital, mas sem texto; a CF não é citada.
  const estatuto = await confirmar(fontes, edital, "sp:lei:10261:1968", { jurisdicao: "SP", tipo: "Lei", numero: "10.261", ano: "1968", nome: "Estatuto" });
  const { Norma, Prova, ProvaQuestao, EditalProva, QuestaoArtigo } = sequelize.models;
  const cf = randomUUID();
  await Norma.create({ id: cf, chave: "br:constituicao:1988", nome: "Constituição Federal", jurisdicao: "BR", tipo: "Constituição", ano: "1988" });

  const prova = randomUUID();
  await Prova.create({ id: prova, equipe_id: equipeId, banca: "VUNESP", ano: 2023, classificacao_status: "classificada" });
  await EditalProva.create({ edital_id: edital.id, prova_id: prova });
  const alternativas = ["A", "B"].map((letra) => ({ letra, texto: letra }));
  const questao = async (numero, referencias) => {
    const id = randomUUID();
    await ProvaQuestao.create({ id, prova_id: prova, numero, disciplina: "Direito", enunciado: "?", alternativas, status: "valida", classificacao_status: "classificada" });
    for (const [norma_id, artigo, papel] of referencias) await QuestaoArtigo.create({ id: randomUUID(), questao_id: id, norma_id, artigo, papel });
  };
  await questao(1, [[cp.id, "293", "principal"]]);
  await questao(2, [[cp.id, "296", "principal"], [cp.id, "293", "relacionado"]]);
  await questao(3, [[cf, "5", "principal"]]);
  await questao(4, [[estatuto.id, "10", "principal"]]);

  const { fora_do_edital } = await service.cobertura(edital.id);
  assert.deepEqual(
    fora_do_edital.map((q) => [q.numero, q.motivo, q.referencias.map((r) => `${r.norma} ${r.artigo} ${r.papel}`)]),
    [
      [2, "artigo_nao_pedido", ["Código Penal 296 principal", "Código Penal 293 relacionado"]],
      [3, "norma_nao_citada", ["Constituição Federal 5 principal"]],
      [4, "norma_sem_texto", ["Estatuto 10 principal"]]
    ]
  );
});
