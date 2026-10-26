"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { abrirBancoDeTeste, criarEquipe } = require("../../test/helpers/banco");
const { criarEditalService } = require("./edital.service");
const { criarExtracaoService } = require("./extracao.service");
const { criarRevisaoService } = require("./revisao.service");
const { criarFontesService } = require("./fontes.service");
const { criarCoberturaService } = require("./cobertura.service");
const { criarSimuladorService, chaveDoNome, disciplinaPeloNome, mudouDepoisDaProva, duracaoDoSimulado } = require("./simulador.service");

const PAGINAS = [{ numero: 1, texto: "Conteúdo programático" }];
const no = (texto, extras = {}) => ({ texto, pagina: 1, source_excerpt: "Conteúdo programático", ...extras });
const assunto = (texto, normas = []) => no(texto, { normas, subassuntos: [] });
const codigoPenal = (artigos_texto) => ({ tipo: "Código", numero: null, ano: null, nome: "Código Penal", artigos_texto });
const ARVORE = {
  blocos: [
    no("Conhecimentos", {
      disciplinas: [
        no("Língua Portuguesa", { assuntos: [assunto("Crase.")] }),
        no("Direito Penal", { assuntos: [assunto("Código Penal - artigos 312 a 313.", [codigoPenal("artigos 312 a 313")])] }),
        no("Direito Processual Penal", { assuntos: [assunto("Código Penal - artigo 1º.", [codigoPenal("artigo 1º")])] })
      ]
    })
  ]
};
const gerarJson = async ({ responseSchema }) => ({
  texto: JSON.stringify(responseSchema.properties.banca ? { banca: null } : ARVORE),
  modelo: "m",
  chave: "paga",
  tokens: 1
});
const ALTERNATIVAS = ["A", "B", "C", "D", "E"].map((letra) => ({ letra, texto: `Alternativa ${letra}` }));

async function montar(t) {
  const sequelize = await abrirBancoDeTeste(t);
  const equipeId = await criarEquipe(sequelize);
  const editais = criarEditalService({ sequelize, dirUploads: fs.mkdtempSync(path.join(os.tmpdir(), "edumind-")), lerPaginas: async () => PAGINAS });
  const { edital } = await editais.criarAPartirDoPdf({ equipeId, buffer: Buffer.from("%PDF-1.4 s"), nomeArquivo: "s.pdf" });
  await (await criarExtracaoService({ sequelize, gerarJson }).iniciar(edital.id)).concluida;
  const revisao = criarRevisaoService({ sequelize });
  for (const item of await editais.conteudo(edital.id)) await revisao.revisarItem(edital.id, item.id, { status: "aprovado" });

  // O Código Penal na biblioteca, com texto: o art. 312 foi alterado em 2023 (depois da prova de 2021).
  const fontes = criarFontesService({ sequelize, dirNormas: fs.mkdtempSync(path.join(os.tmpdir(), "edumind-normas-")) });
  const citacoes = (await fontes.listar(edital.id)).flatMap((f) => f.citacoes.map((c) => c.id));
  const cp = await fontes.confirmar(edital.id, { citacoes, jurisdicao: "BR", tipo: "Decreto-Lei", numero: "2.848", ano: "1940", nome: "Código Penal" });
  const { NormaVersao, NormaArtigo, Prova, ProvaQuestao, EditalProva, QuestaoArtigo, Resposta } = sequelize.models;
  const versao = randomUUID();
  await NormaVersao.create({ id: versao, norma_id: cp.id, origem: "upload", status: "upload_recebido", processada_em: new Date(), artigos_total: 3 });
  const nota2023 = [{ tipo: "redacao", texto: "(Redação dada pela Lei nº 14.000, de 2023)", alteracao: true, data: { valor: "2023", precisao: "ano" } }];
  for (const [ordem, numero, notas] of [[1, "1", []], [2, "312", nota2023], [3, "313", []]]) {
    await NormaArtigo.create({ id: randomUUID(), versao_id: versao, numero, ordem, notas, texto_bruto: `Art. ${numero} - texto do artigo ${numero}.` });
  }

  // A prova de 2021, escolhida para o edital.
  const prova = randomUUID();
  await Prova.create({ id: prova, equipe_id: equipeId, banca: "VUNESP", ano: 2021, gabarito_situacao: "nao_oficial", duracao_minutos: 70 });
  await EditalProva.create({ edital_id: edital.id, prova_id: prova });
  const questao = async (numero, disciplina, extras = {}, referencias = []) => {
    const id = randomUUID();
    await ProvaQuestao.create({ id, prova_id: prova, numero, disciplina, enunciado: `Questão ${numero}`, alternativas: ALTERNATIVAS, gabarito: "B", status: "valida", ...extras });
    for (const [artigo, papel] of referencias) await QuestaoArtigo.create({ id: randomUUID(), questao_id: id, norma_id: cp.id, artigo, papel });
    return id;
  };
  const q = {
    portugues: await questao(1, "LÍNgUA PORTUgUESA"),
    penal: await questao(2, "Penal", {}, [["312", "principal"], ["313", "relacionado"]]),
    // O nome diz Direito Penal, mas o artigo cobrado é o que o edital pede em Processo Penal.
    processo: await questao(3, "Direito Penal", {}, [["1", "principal"]]),
    outra: await questao(4, "Geografia"),
    anulada: await questao(5, "Língua Portuguesa", { anulada: true }),
    imagem: await questao(6, "Língua Portuguesa", { depende_de_imagem: true }),
    aRevisar: await questao(7, "Língua Portuguesa", { status: "a_revisar" })
  };
  const relogio = { agora: new Date("2026-10-26T10:00:00Z") };
  const service = criarSimuladorService({
    sequelize,
    coberturaService: criarCoberturaService({ sequelize }),
    embaralhar: (lista) => lista,
    agora: () => relogio.agora
  });
  const disciplinas = Object.fromEntries((await editais.conteudo(edital.id)).filter((i) => i.nivel === "disciplina").map((i) => [i.texto, i.id]));
  return { sequelize, service, edital, prova, q, disciplinas, Resposta, relogio };
}

test("nome da disciplina: maiúsculas, acentos e espaços não importam; uma pode começar com a outra", () => {
  assert.equal(chaveDoNome("R aCIOCínIO lógICO"), chaveDoNome("Raciocínio Lógico"));
  const disciplinas = ["Língua Portuguesa", "Atualidades"].map((texto, i) => ({ id: i, texto, chave: chaveDoNome(texto) }));
  assert.equal(disciplinaPeloNome("LÍNgUA PORTUgUESA", disciplinas)?.id, 0);
  assert.equal(disciplinaPeloNome("Atualidades e Noções sobre Direitos das Pessoas com Deficiência", disciplinas)?.id, 1);
  assert.equal(disciplinaPeloNome("Geografia", disciplinas), null);
  assert.equal(disciplinaPeloNome("", disciplinas), null);
});

test("alteração do artigo em relação ao ano da prova", () => {
  const nota = (valor) => ({ alteracao: true, data: { valor, precisao: valor.length === 4 ? "ano" : "dia" } });
  assert.equal(mudouDepoisDaProva([nota("2023")], 2021), "depois");
  assert.equal(mudouDepoisDaProva([nota("2021-05-10")], 2021), "talvez");
  assert.equal(mudouDepoisDaProva([nota("2019")], 2021), null);
  assert.equal(mudouDepoisDaProva([{ alteracao: false, data: { valor: "2023" } }], 2021), null);
  assert.equal(mudouDepoisDaProva([nota("2023")], null), null);
});

test("resumo: só questões válidas, com gabarito, não anuladas e sem imagem; disciplina pelo artigo, pela norma ou pelo nome", async (t) => {
  const { service, edital, disciplinas } = await montar(t);
  const resumo = await service.resumo(edital.id);
  assert.equal(resumo.total, 4);
  assert.deepEqual(
    resumo.disciplinas.map((d) => [d.texto, d.questoes]),
    [["Língua Portuguesa", 1], ["Direito Penal", 1], ["Direito Processual Penal", 1], ["Outras", 1]]
  );
  assert.equal(resumo.disciplinas[1].id, disciplinas["Direito Penal"]);
  assert.deepEqual(resumo.provas.map((p) => [p.ano, p.questoes, p.gabarito_situacao]), [[2021, 4, "nao_oficial"]]);
});

test("treino: as questões das disciplinas escolhidas, sem o gabarito, na quantidade pedida", async (t) => {
  const { service, edital, q, disciplinas } = await montar(t);
  const questoes = await service.treino(edital.id, { disciplinas: [disciplinas["Direito Processual Penal"], "outras"] });
  assert.deepEqual(questoes.map((x) => x.id).sort(), [q.processo, q.outra].sort());
  assert.equal(questoes.some((x) => "gabarito" in x), false);
  assert.deepEqual(questoes.find((x) => x.id === q.processo).disciplina.texto, "Direito Processual Penal");
  assert.equal(questoes[0].prova.gabarito_oficial, false);

  assert.equal((await service.treino(edital.id, { disciplinas: Object.values(disciplinas), quantidade: 2 })).length, 2);
  await assert.rejects(service.treino(edital.id, { disciplinas: [] }), { status: 400 });
  await assert.rejects(service.treino(edital.id, { disciplinas: ["outras"], quantidade: 0 }), { status: 400 });
});

test("responder: corrige no servidor, guarda a resposta e devolve os artigos com o aviso de alteração", async (t) => {
  const { sequelize, service, edital, q, Resposta } = await montar(t);
  const usuario = randomUUID();
  await sequelize.models.Usuario.create({ id: usuario, nome: "Aluno", email: "aluno@teste.br", senha_hash: "x" });

  const errada = await service.responder(edital.id, usuario, { questao_id: q.penal, resposta: "c" });
  assert.equal(errada.acertou, false);
  assert.equal(errada.gabarito, "B");
  assert.deepEqual(
    errada.artigos.map((a) => [a.numero, a.papel, a.texto, a.mudou_depois_da_prova]),
    [["312", "principal", "Art. 312 - texto do artigo 312.", "depois"], ["313", "relacionado", "Art. 313 - texto do artigo 313.", null]]
  );
  assert.equal(errada.artigos[0].norma.nome, "Código Penal");

  assert.equal((await service.responder(edital.id, usuario, { questao_id: q.portugues, resposta: "B" })).acertou, true);
  assert.deepEqual(
    (await Resposta.findAll({ where: { usuario_id: usuario }, order: [["created_at", "ASC"]], raw: true })).map((r) => [r.resposta, r.acertou]),
    [["C", false], ["B", true]]
  );

  await assert.rejects(service.responder(edital.id, usuario, { questao_id: q.penal, resposta: "Z" }), { status: 400 });
  await assert.rejects(service.responder(edital.id, usuario, { questao_id: q.anulada, resposta: "B" }), { status: 404 });
  await assert.rejects(service.responder(edital.id, usuario, { questao_id: "x", resposta: "B" }), { status: 400 });
});

test("tempo da prova completa: o da prova real, proporcional às questões disponíveis; sem ele, 3 minutos por questão", () => {
  assert.deepEqual(duracaoDoSimulado({ duracaoDaProva: 240, disponiveis: 70, total: 100 }), { minutos: 168, estimada: false });
  assert.deepEqual(duracaoDoSimulado({ duracaoDaProva: null, disponiveis: 70, total: 100 }), { minutos: 210, estimada: true });
});

async function usuario(sequelize, email = "aluno@teste.br") {
  const id = randomUUID();
  await sequelize.models.Usuario.create({ id, nome: "Aluno", email, senha_hash: "x" });
  return id;
}

test("prova completa: questões na ordem da prova, sem gabarito; respostas guardadas sem corrigir; a entrega corrige", async (t) => {
  const { sequelize, service, edital, prova, q, Resposta } = await montar(t);
  const aluno = await usuario(sequelize);

  const simulado = await service.iniciarProva(edital.id, aluno, { prova_id: prova });
  assert.deepEqual(simulado.questoes.map((x) => x.id), [q.portugues, q.penal, q.processo, q.outra]);
  assert.equal(simulado.questoes.some((x) => "gabarito" in x), false);
  // 4 das 7 questões da prova (as descartadas não contam), 70 minutos na prova real: 40 minutos.
  assert.deepEqual([simulado.prova.total, simulado.duracao_minutos, simulado.duracao_estimada, simulado.restante_segundos], [7, 40, false, 2400]);
  assert.equal("resultado" in simulado, false);
  await assert.rejects(service.iniciarProva(edital.id, aluno, { prova_id: prova }), { status: 409 });
  assert.equal((await service.resumo(edital.id, aluno)).em_andamento.id, simulado.id);

  await service.marcar(edital.id, aluno, simulado.id, q.penal, { resposta: "a" });
  await service.marcar(edital.id, aluno, simulado.id, q.portugues, { resposta: "B", marcada: true });
  await service.marcar(edital.id, aluno, simulado.id, q.outra, { resposta: "C" });
  let guardado = await service.marcar(edital.id, aluno, simulado.id, q.outra, { resposta: null });
  assert.deepEqual(guardado.respostas, { [q.penal]: "A", [q.portugues]: "B" });
  assert.deepEqual(guardado.marcadas, [q.portugues]);
  guardado = await service.marcar(edital.id, aluno, simulado.id, q.portugues, { marcada: false });
  assert.deepEqual(guardado.marcadas, []);
  assert.equal(await Resposta.count(), 0);
  await assert.rejects(service.marcar(edital.id, aluno, simulado.id, q.penal, { resposta: "Z" }), { status: 400 });
  await assert.rejects(service.marcar(edital.id, aluno, simulado.id, q.anulada, { resposta: "B" }), { status: 404 });

  // Outro usuário não vê nem altera a prova.
  const outro = await usuario(sequelize, "outro@teste.br");
  await assert.rejects(service.prova(edital.id, outro, simulado.id), { status: 404 });

  const entregue = await service.entregar(edital.id, aluno, simulado.id);
  assert.deepEqual([entregue.resultado.acertos, entregue.resultado.total, entregue.resultado.em_branco], [1, 4, 2]);
  assert.deepEqual(
    entregue.questoes.map((x) => [x.resposta, x.gabarito, x.acertou]),
    [["B", "B", true], ["A", "B", false], [null, "B", false], [null, "B", false]]
  );
  assert.equal(entregue.questoes[1].artigos[0].mudou_depois_da_prova, "depois");
  assert.deepEqual(entregue.resultado.por_disciplina.find((d) => d.disciplina === "Língua Portuguesa"), { disciplina: "Língua Portuguesa", total: 1, acertos: 1, em_branco: 0 });
  assert.deepEqual(
    (await Resposta.findAll({ where: { simulado_id: simulado.id }, raw: true })).map((r) => [r.questao_id, r.acertou]).sort(),
    [[q.penal, false], [q.portugues, true]].sort()
  );
  // Entregar de novo não grava outra vez; depois de entregue, nada muda.
  await service.entregar(edital.id, aluno, simulado.id);
  assert.equal(await Resposta.count(), 2);
  await assert.rejects(service.marcar(edital.id, aluno, simulado.id, q.penal, { resposta: "B" }), { status: 409 });
  await assert.rejects(service.desistir(edital.id, aluno, simulado.id), { status: 409 });
  assert.equal((await service.resumo(edital.id, aluno)).em_andamento, null);
});

test("prova completa: quando o tempo acaba, a prova é entregue com o que foi respondido; desistir apaga", async (t) => {
  const { sequelize, service, edital, prova, q, relogio } = await montar(t);
  const aluno = await usuario(sequelize);

  const simulado = await service.iniciarProva(edital.id, aluno, { prova_id: prova });
  await service.marcar(edital.id, aluno, simulado.id, q.portugues, { resposta: "B" });
  relogio.agora = new Date(relogio.agora.getTime() + 41 * 60 * 1000);
  await assert.rejects(service.marcar(edital.id, aluno, simulado.id, q.penal, { resposta: "B" }), { status: 409 });
  const entregue = await service.prova(edital.id, aluno, simulado.id);
  assert.ok(entregue.entregue_em);
  assert.equal(entregue.resultado.acertos, 1);

  const outra = await service.iniciarProva(edital.id, aluno, { prova_id: prova });
  await service.desistir(edital.id, aluno, outra.id);
  await assert.rejects(service.prova(edital.id, aluno, outra.id), { status: 404 });
  await assert.rejects(service.iniciarProva(edital.id, aluno, { prova_id: randomUUID() }), { status: 404 });
});
