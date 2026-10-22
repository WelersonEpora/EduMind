"use strict";

// Leitura das citações por estrutura do edital (etapa 2c-2), por código e sem IA, no mesmo espírito do
// artigos.parser.js: "Título II - Capítulos I, II e III; e Título III - Capítulo VII com Seções I e II" vira a lista
// de caminhos
//   [{ titulo: [II], capitulo: [I, II, III] }, { titulo: [III], capitulo: [VII], secao: [I, II] }]
// que a cobertura casa com a estrutura guardada em cada artigo da norma (parsers/artigos-da-norma.js).
//
// - ";" separa partes independentes. Uma parte que começa num nível mais baixo ("; Capítulo IV") herda os níveis de
//   cima da parte anterior.
// - Um nível igual ou acima do último, dentro da mesma parte ("Capítulo I e Capítulo III"), abre um caminho novo
//   com os mesmos níveis de cima.
// - "Seções IX a XIX" expande o intervalo de romanos.
// - Ao chegar em "artigo"/"art.", a parte acaba: os artigos pelo número são lidos pelo artigos.parser.js.

// Do mais alto ao mais baixo. "tomo" não é marcado pela divisão em artigos; fica aqui para virar aviso claro.
const NIVEIS = ["tomo", "parte", "livro", "titulo", "capitulo", "secao", "subsecao"];
const ROTULOS = { tomo: "Tomo", parte: "Parte", livro: "Livro", titulo: "Título", capitulo: "Capítulo", secao: "Seção", subsecao: "Subseção" };
const PALAVRAS_DE_NIVEL = {
  tomo: "tomo",
  tomos: "tomo",
  parte: "parte",
  partes: "parte",
  livro: "livro",
  livros: "livro",
  titulo: "titulo",
  titulos: "titulo",
  capitulo: "capitulo",
  capitulos: "capitulo",
  secao: "secao",
  secoes: "secao",
  subsecao: "subsecao",
  subsecoes: "subsecao"
};
const PALAVRAS_DE_ARTIGO = new Set(["art", "arts", "artigo", "artigos"]);
const PALAVRAS_DE_INTERVALO = new Set(["a", "ao", "ate"]);
const PALAVRAS_IGNORADAS = new Set(["e", "com", "o", "os", "do", "da", "dos", "das", "de", "tambem", "suas", "seus", "respectivas", "respectivos"]);
const NOMES_ESPECIAIS = new Set(["unico", "unica", "geral", "especial", "preliminar"]);
const SEPARADORES = new Set([",", ":", "-", "–", "—", "(", ")", ".", "/"]);
const MAXIMO_NO_INTERVALO = 200;

const VALOR_ROMANO = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

function semAcento(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function eRomano(palavra) {
  return palavra.length > 0 && [...palavra.toUpperCase()].every((c) => VALOR_ROMANO[c]);
}

function deRomano(romano) {
  const valores = [...romano.toUpperCase()].map((c) => VALOR_ROMANO[c]);
  return valores.reduce((total, valor, i) => total + (valor < (valores[i + 1] || 0) ? -valor : valor), 0);
}

function paraRomano(numero) {
  const tabela = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"]
  ];
  let resto = numero;
  let romano = "";
  for (const [valor, letras] of tabela) {
    while (resto >= valor) {
      romano += letras;
      resto -= valor;
    }
  }
  return romano;
}

function eNumero(palavra) {
  return palavra.length > 0 && [...palavra].every((c) => c >= "0" && c <= "9");
}

// Texto -> [{ tipo: "palavra" | "ponto-e-virgula", valor }]. Palavras em minúsculas e sem acento; romanos ficam
// com o valor original para a mensagem.
function tokenizar(texto) {
  const tokens = [];
  let palavra = "";
  const fechar = () => {
    if (palavra) tokens.push({ tipo: "palavra", valor: palavra });
    palavra = "";
  };
  for (const c of String(texto ?? "")) {
    if (c === ";") {
      fechar();
      tokens.push({ tipo: "ponto-e-virgula" });
    } else if (SEPARADORES.has(c) || c.trim() === "" || c === "º" || c === "°" || c === "ª") {
      fechar();
    } else {
      palavra += c;
    }
  }
  fechar();
  return tokens;
}

// Rótulo de um valor como a divisão guarda: "II", "ÚNICO" vira "UNICO" (comparação sem acento).
function valorNormalizado(palavra) {
  if (eNumero(palavra)) return paraRomano(Number(palavra));
  return semAcento(palavra).toUpperCase();
}

// texto -> { caminhos: [[{ nivel, valores: ["II"] }]], avisos: [] }
function lerEstrutura(texto) {
  const avisos = [];
  const caminhos = [];
  let atual = [];
  let ultimoEmitido = [];
  let inicioDaParte = true;
  let dentroDeArtigos = false;
  let intervaloPendente = false;

  const rank = (nivel) => NIVEIS.indexOf(nivel);
  const emitir = () => {
    if (atual.length === 0) return;
    const vazio = atual.find((c) => c.valores.length === 0);
    if (vazio) {
      avisos.push(`${ROTULOS[vazio.nivel]} sem número.`);
    } else {
      caminhos.push(atual);
      ultimoEmitido = atual;
    }
  };

  for (const token of tokenizar(texto)) {
    if (token.tipo === "ponto-e-virgula") {
      emitir();
      atual = [];
      inicioDaParte = true;
      dentroDeArtigos = false;
      intervaloPendente = false;
      continue;
    }
    if (dentroDeArtigos) continue;

    const original = token.valor;
    const palavra = semAcento(original).toLowerCase();
    const nivel = PALAVRAS_DE_NIVEL[palavra];

    if (nivel) {
      const ultimo = atual[atual.length - 1];
      if (ultimo && rank(nivel) <= rank(ultimo.nivel)) {
        emitir();
        atual = atual.filter((c) => rank(c.nivel) < rank(nivel));
      } else if (!ultimo && inicioDaParte) {
        // Parte que começa num nível mais baixo herda os de cima da parte anterior.
        atual = ultimoEmitido.filter((c) => rank(c.nivel) < rank(nivel));
      }
      atual = [...atual, { nivel, valores: [] }];
      inicioDaParte = false;
      intervaloPendente = false;
      continue;
    }

    if (PALAVRAS_DE_ARTIGO.has(palavra)) {
      dentroDeArtigos = true;
      continue;
    }

    const ultimo = atual[atual.length - 1];
    const eValor = eRomano(original) || eNumero(original) || NOMES_ESPECIAIS.has(palavra);
    if (eValor && ultimo) {
      const valor = valorNormalizado(original);
      if (intervaloPendente) {
        intervaloPendente = false;
        const inicio = ultimo.valores[ultimo.valores.length - 1];
        const de = deRomano(inicio);
        const ate = eRomano(valor) ? deRomano(valor) : NaN;
        if (!eRomano(inicio) || !(ate > de) || ate - de > MAXIMO_NO_INTERVALO) {
          avisos.push(`Intervalo não reconhecido: ${inicio} a ${valor}.`);
          continue;
        }
        for (let n = de + 1; n <= ate; n += 1) ultimo.valores.push(paraRomano(n));
        continue;
      }
      if (!ultimo.valores.includes(valor)) ultimo.valores.push(valor);
      continue;
    }

    if (PALAVRAS_DE_INTERVALO.has(palavra) && ultimo && ultimo.valores.length > 0) {
      intervaloPendente = true;
      continue;
    }
    if (PALAVRAS_IGNORADAS.has(palavra)) continue;
    avisos.push(`Trecho não reconhecido: “${original}”.`);
  }
  emitir();
  return { caminhos, avisos };
}

// "Título III › Capítulo VII › Seções I e II"
function descreverCaminho(caminho) {
  return caminho
    .map(({ nivel, valores }) => {
      const rotulo = ROTULOS[nivel];
      if (valores.length === 1) return `${rotulo} ${valores[0]}`;
      const plural = { Seção: "Seções", Subseção: "Subseções" }[rotulo] || `${rotulo}s`;
      return `${plural} ${valores.slice(0, -1).join(", ")} e ${valores[valores.length - 1]}`;
    })
    .join(" › ");
}

// O artigo está no caminho? A estrutura do artigo vem da divisão: { titulo: "Título II", capitulo: "Capítulo I" }.
function artigoNoCaminho(estrutura, caminho) {
  return caminho.every(({ nivel, valores }) => {
    const rotulo = estrutura?.[nivel];
    if (!rotulo) return false;
    const valor = semAcento(rotulo.slice(rotulo.indexOf(" ") + 1)).toUpperCase().trim();
    return valores.includes(valor);
  });
}

module.exports = { lerEstrutura, descreverCaminho, artigoNoCaminho, tokenizar };
