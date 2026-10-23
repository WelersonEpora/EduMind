"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { textoCorrido, localizar, recortar } = require("./texto-da-prova");
const { montarQuestoes, respostaNoGabarito } = require("./leitura-da-prova");

const CABECALHO = (n) => `www.pciconcursos.com.br${n}tjsp2503 / 001-escreventetécnicojudiciário confidencial até o momento da aplicação.`;
const MARCA = "pcimarkpci MjgwNDowMTRj";

const PAGINAS = [
  { numero: 1, texto: `${MARCA}\n${CABECALHO(1)}\nLÍNGUA PORTUGUESA\nLeia o texto para responder às questões 01 e 02.\nO teletrabalho mudou a rotina dos tribu-\nnais paulistas desde 2020.\nHoje, metade dos servidores trabalha de casa.` },
  { numero: 2, texto: `${MARCA}\n${CABECALHO(2)}\n01. De acordo com o texto, o tele-\ntrabalho\n(A) acabou.\n(B) mudou a rotina dos tribunais.\n(C) é proibido.\n(D) começou em 2010.\n(E) não existe.\n02. Assinale a alternativa correta.\n(A) Um.\n(B) Dois.` },
  { numero: 3, texto: `${MARCA}\n${CABECALHO(3)}\n(C) Três.\n(D) Quatro.\n(E) Cinco.\nDIREITO PENAL\n03. Sobre o Código Penal, assinale a correta.\n(A) Alfa.\n(B) Beta.\n(C) Gama.\n(D) Delta.` }
];
const GABARITO = [{ numero: 1, texto: "Versão 1\n1 - B 2 - E 3 - *" }];

const alternativas = (...textos) => textos.map((texto, i) => ({ letra: "ABCDE"[i], texto }));
const APOIO = { inicio: "O teletrabalho mudou a rotina dos tribunais", fim: "metade dos servidores trabalha de casa." };

function resposta(questoes, versao = "Versão 1") {
  return JSON.stringify({ versao, questoes });
}
const gabarito = (versoes) => JSON.stringify({ versoes });

test("texto corrido: cabeçalho e marca d'água repetidos saem; a questão atravessa a quebra de página", () => {
  const texto = textoCorrido(PAGINAS);
  assert.doesNotMatch(texto, /pciconcursos|pcimarkpci/);
  assert.ok(localizar(texto, "02. Assinale a alternativa correta. (A) Um. (B) Dois. (C) Três."));
  assert.ok(localizar(texto, "De acordo com o texto, o teletrabalho"));
  assert.equal(
    recortar(texto, APOIO.inicio, APOIO.fim),
    "O teletrabalho mudou a rotina dos tribunais paulistas desde 2020.\nHoje, metade dos servidores trabalha de casa."
  );
  assert.equal(recortar(texto, "texto que não existe", APOIO.fim), null);
});

test("gabarito: confere o par número-resposta no PDF", () => {
  const texto = "1 - B 2 - E 13 - C 3 - *  04. A  5) ANULADA";
  assert.equal(respostaNoGabarito(texto, 1, "B"), true);
  assert.equal(respostaNoGabarito(texto, 3, "C"), false);
  assert.equal(respostaNoGabarito(texto, 13, "C"), true);
  assert.equal(respostaNoGabarito(texto, 3, "ANULADA"), true);
  assert.equal(respostaNoGabarito(texto, 4, "A"), true);
  assert.equal(respostaNoGabarito(texto, 5, "ANULADA"), true);
});

test("montar questões: conferidas valem direto; as com problema vão para revisão", () => {
  const { questoes, avisos } = montarQuestoes(
    {
      respostaQuestoes: resposta([
        {
          numero: 1,
          disciplina: "LÍNGUA PORTUGUESA",
          pagina: 2,
          apoio: APOIO,
          enunciado: "De acordo com o texto, o teletrabalho",
          alternativas: alternativas("acabou.", "mudou a rotina dos tribunais.", "é proibido.", "começou em 2010.", "não existe."),
          depende_de_imagem: false
        },
        {
          numero: 2,
          disciplina: "LÍNGUA PORTUGUESA",
          pagina: 2,
          apoio: null,
          enunciado: "Assinale a alternativa correta.",
          alternativas: alternativas("Um.", "Dois.", "Três.", "Quatro.", "Seis."),
          depende_de_imagem: false
        },
        {
          numero: 3,
          disciplina: "DIREITO PENAL",
          pagina: 3,
          apoio: null,
          enunciado: "Sobre o Código Penal, assinale a correta.",
          alternativas: alternativas("Alfa.", "Beta.", "Gama.", "Delta."),
          depende_de_imagem: false
        }
      ]),
      respostaGabarito: gabarito([{ versao: "Versão 1", respostas: [{ numero: 1, resposta: "B" }, { numero: 2, resposta: "E" }, { numero: 3, resposta: "ANULADA" }, { numero: 4, resposta: "A" }] }]),
      paginasDaProva: PAGINAS,
      paginasDoGabarito: GABARITO
    },
    { novoId: (() => { let n = 0; return () => `id-${(n += 1)}`; })() }
  );

  assert.deepEqual(
    questoes.map((q) => [q.numero, q.status, q.gabarito, q.anulada, q.problemas]),
    [
      [1, "valida", "B", false, []],
      [2, "a_revisar", "E", false, ["Alternativa (E) não encontrada no texto da prova."]],
      [3, "a_revisar", null, true, ["Tem 4 alternativas; as outras questões têm 5.", "Anulada no gabarito."]]
    ]
  );
  assert.equal(questoes[0].texto_apoio.startsWith("O teletrabalho mudou"), true);
  assert.deepEqual(avisos, ["O gabarito tem a questão 4, que não veio na leitura da prova."]);
});

test("versões diferentes de caderno e gabarito: tudo vai para revisão, com aviso", () => {
  const { questoes, avisos } = montarQuestoes({
    respostaQuestoes: resposta(
      [{ numero: 2, disciplina: null, pagina: 2, apoio: null, enunciado: "Assinale a alternativa correta.", alternativas: alternativas("Um.", "Dois.", "Três.", "Quatro.", "Cinco."), depende_de_imagem: false }],
      "Versão 2"
    ),
    respostaGabarito: gabarito([{ versao: "Versão 1", respostas: [{ numero: 2, resposta: "E" }] }]),
    paginasDaProva: PAGINAS,
    paginasDoGabarito: GABARITO
  });
  assert.deepEqual(questoes[0].problemas, ["O gabarito é de outra versão do caderno."]);
  assert.deepEqual(avisos, [
    "A leitura não trouxe a questão 1.",
    'O caderno é "Versão 2" e o gabarito é de "Versão 1": as respostas podem estar trocadas. Envie o gabarito da mesma versão.'
  ]);
});

test("gabarito com várias versões: vale a do caderno; sem a do caderno, o orientador escolhe", () => {
  const questao = { numero: 2, disciplina: null, pagina: 2, apoio: null, enunciado: "Assinale a alternativa correta.", alternativas: alternativas("Um.", "Dois.", "Três.", "Quatro.", "Cinco."), depende_de_imagem: false };
  const versoes = gabarito([
    { versao: "Versão 1", respostas: [{ numero: 2, resposta: "E" }] },
    { versao: "Versão 2", respostas: [{ numero: 2, resposta: "B" }] }
  ]);
  const paginasDoGabarito = [{ numero: 1, texto: "Versão 1\n2 - E\nVersão 2\n2 - B" }];

  const doCaderno = montarQuestoes({ respostaQuestoes: resposta([questao], "VERSÃO 2"), respostaGabarito: versoes, paginasDaProva: PAGINAS, paginasDoGabarito });
  assert.deepEqual([doCaderno.questoes[0].gabarito, doCaderno.questoes[0].problemas], ["B", []]);
  assert.equal(doCaderno.gabarito.versao_escolhida, 1);
  assert.equal(doCaderno.versoes.gabarito, "Versão 2");

  const semVersao = montarQuestoes({ respostaQuestoes: resposta([questao], null), respostaGabarito: versoes, paginasDaProva: PAGINAS, paginasDoGabarito });
  assert.deepEqual([semVersao.questoes[0].gabarito, semVersao.questoes[0].status, semVersao.questoes[0].problemas], [null, "a_revisar", ["Escolha a versão do gabarito."]]);
  assert.equal(semVersao.gabarito.versao_escolhida, null);
  assert.deepEqual(semVersao.gabarito.versoes.map((v) => [v.versao, v.respostas[2]]), [
    ["Versão 1", { resposta: "E", valida: true, conferida: true }],
    ["Versão 2", { resposta: "B", valida: true, conferida: true }]
  ]);
  assert.ok(semVersao.avisos.includes("O gabarito tem 2 versões (Versão 1, Versão 2) e o caderno não diz qual é a dele: escolha a versão na tela das questões."));
});

test("sem gabarito: as questões ficam para revisão; JSON inválido vira erro claro", () => {
  const { questoes } = montarQuestoes({
    respostaQuestoes: resposta([{ numero: 1, disciplina: null, pagina: 2, apoio: null, enunciado: "Assinale a alternativa correta.", alternativas: alternativas("Um.", "Dois.", "Três.", "Quatro.", "Cinco."), depende_de_imagem: true }]),
    respostaGabarito: null,
    paginasDaProva: PAGINAS,
    paginasDoGabarito: []
  });
  assert.deepEqual(questoes[0].problemas, ["Depende de figura, gráfico ou tabela que não está no texto.", "A prova ainda não tem gabarito."]);
  assert.throws(() => montarQuestoes({ respostaQuestoes: "{", respostaGabarito: null, paginasDaProva: PAGINAS, paginasDoGabarito: [] }), { status: 502 });
});
