"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { montarArvore } = require("./arvore-do-edital");

const PAGINAS = [
  {
    numero: 42,
    texto:
      "BLOCO II: Conhecimentos em Direito\n(30) questões:\n1. DIREITO PENAL: Código Penal - artigos 293 a 305; 307; 308; 311-A; 312 a 317; 319 a 333;"
  },
  {
    numero: 43,
    texto:
      "336 e 337; 339 a 347; 357 e 359.\n2. DIREITO PROCESSUAL PENAL: Código de Processo Penal - artigos 251 a 258; e Lei n.º 9.099 de 26.09.1995 (artigos\n60 a 83; 88 e 89).\n3. DIREITO PROCESSUAL CIVIL:\n3.1. Código de Processo Civil - artigos 144 a 155;"
  }
];

const norma = (campos) => ({ tipo: null, numero: null, ano: null, nome: null, artigos_texto: null, ...campos });

const RESPOSTA = {
  blocos: [
    {
      texto: "BLOCO II: Conhecimentos em Direito",
      pagina: 42,
      source_excerpt: "BLOCO II: Conhecimentos em Direito",
      disciplinas: [
        {
          texto: "DIREITO PENAL",
          pagina: 42,
          source_excerpt: "1. DIREITO PENAL",
          assuntos: [
            {
              texto: "Código Penal - artigos 293 a 305; 307; 308; 311-A; 312 a 317; 319 a 333; 336 e 337; 339 a 347; 357 e 359.",
              pagina: 42,
              source_excerpt: "Código Penal - artigos 293 a 305; 307; 308; 311-A; 312 a 317; 319 a 333;",
              normas: [
                norma({
                  tipo: "Código",
                  nome: "Código Penal",
                  // Continua na página 43: ainda conta como achado no edital.
                  artigos_texto: "artigos 293 a 305; 307; 308; 311-A; 312 a 317; 319 a 333; 336 e 337; 339 a 347; 357 e 359"
                })
              ],
              subassuntos: []
            }
          ]
        },
        {
          texto: "DIREITO PROCESSUAL PENAL",
          pagina: 43,
          source_excerpt: "2. DIREITO PROCESSUAL PENAL",
          assuntos: [
            {
              texto: "Código de Processo Penal - artigos 251 a 258; e Lei n.º 9.099 de 26.09.1995 (artigos 60 a 83; 88 e 89).",
              pagina: 43,
              source_excerpt: "Código de Processo Penal - artigos 251 a 258;",
              normas: [
                norma({ tipo: "Código", nome: "Código de Processo Penal", artigos_texto: "artigos 251 a 258" }),
                // Alterado pela IA ("60 a 85"): não está no edital.
                norma({ tipo: "Lei", numero: "9.099", ano: "1995", artigos_texto: "artigos 60 a 85; 88 e 89" })
              ],
              subassuntos: []
            }
          ]
        },
        {
          texto: "DIREITO PROCESSUAL CIVIL",
          pagina: 43,
          source_excerpt: "3. DIREITO PROCESSUAL CIVIL:",
          assuntos: [
            {
              texto: "DIREITO PROCESSUAL CIVIL",
              pagina: 43,
              source_excerpt: "3. DIREITO PROCESSUAL CIVIL:",
              normas: [],
              subassuntos: [
                {
                  texto: "Código de Processo Civil - artigos 144 a 155;",
                  pagina: 99,
                  source_excerpt: "3.1. Código de Processo Civil - artigos 144 a 155;",
                  normas: [norma({ nome: "Código de Processo Civil", artigos_texto: "artigos 144 a 155" })]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

function idsEmSequencia() {
  let n = 0;
  return () => `id-${(n += 1)}`;
}

test("monta os itens em ordem, com nível, pai e ordem entre irmãos", () => {
  const { itens } = montarArvore(JSON.stringify(RESPOSTA), PAGINAS, { novoId: idsEmSequencia() });
  assert.deepEqual(
    itens.map((i) => [i.nivel, i.texto.slice(0, 24), i.parent_id, i.ordem]),
    [
      ["bloco", "BLOCO II: Conhecimentos ", null, 0],
      ["disciplina", "DIREITO PENAL", "id-1", 0],
      ["assunto", "Código Penal - artigos 2", "id-2", 0],
      ["disciplina", "DIREITO PROCESSUAL PENAL", "id-1", 1],
      ["assunto", "Código de Processo Penal", "id-5", 0],
      ["disciplina", "DIREITO PROCESSUAL CIVIL", "id-1", 2],
      ["assunto", "DIREITO PROCESSUAL CIVIL", "id-9", 0],
      ["subassunto", "Código de Processo Civil", "id-10", 0]
    ]
  );
});

test("confere o trecho de cada item na página citada", () => {
  const { itens } = montarArvore(JSON.stringify(RESPOSTA), PAGINAS);
  assert.deepEqual(
    itens.map((i) => [i.verificado, i.pagina_encontrada]),
    [[true, null], [true, null], [true, null], [true, null], [true, null], [true, null], [true, null], [false, 43]]
  );
});

test("expande os artigos pelo parser e confere o trecho dos artigos no edital", () => {
  const { itens, normas } = montarArvore(JSON.stringify(RESPOSTA), PAGINAS);
  const [penal, cpp, lei9099, cpc] = normas;

  assert.equal(penal.item_id, itens[2].id);
  assert.equal(penal.nome, "Código Penal");
  assert.equal(penal.numero, null);
  assert.equal(penal.artigos_texto_verificado, true);
  assert.equal(penal.artigos.artigos.length, 50);

  assert.deepEqual([cpp.ordem, lei9099.ordem], [0, 1]);
  assert.equal(cpp.artigos_texto_verificado, true);
  assert.equal(lei9099.artigos_texto_verificado, false);
  // Mesmo não verificado, o parser roda: a tela mostra os dois fatos.
  assert.equal(lei9099.artigos.artigos.length, 28);

  // O item está na página 43, mas a IA disse 99: o trecho dos artigos não conta como achado.
  assert.equal(cpc.artigos_texto_verificado, false);
});

test("norma sem trecho de artigos é a norma inteira: sem parser", () => {
  const resposta = {
    blocos: [
      {
        texto: "B",
        pagina: 42,
        source_excerpt: "BLOCO II",
        disciplinas: [
          {
            texto: "D",
            pagina: 42,
            source_excerpt: "DIREITO PENAL",
            assuntos: [{ texto: "A", pagina: 42, source_excerpt: "Código Penal", normas: [norma({ nome: "Código Penal" })], subassuntos: [] }]
          }
        ]
      }
    ]
  };
  const { normas } = montarArvore(JSON.stringify(resposta), PAGINAS);
  assert.deepEqual(
    { artigos_texto: normas[0].artigos_texto, artigos: normas[0].artigos, verificado: normas[0].artigos_texto_verificado },
    { artigos_texto: null, artigos: null, verificado: false }
  );
});

test("resposta inválida ou fora do formato vira erro em português", () => {
  assert.throws(() => montarArvore("não é json", PAGINAS), { status: 502, message: /JSON inválido/ });
  assert.throws(() => montarArvore(JSON.stringify({ itens: [] }), PAGINAS), { status: 502, message: /fora do formato/ });
  assert.deepEqual(montarArvore(JSON.stringify({ blocos: [] }), PAGINAS), { itens: [], normas: [] });
});
