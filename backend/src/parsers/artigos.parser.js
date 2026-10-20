"use strict";

// Expande a lista de artigos citada no edital ("artigos 293 a 305; 307; 311-A; 336 e 337") numa
// lista explícita. A leitura é feita caractere a caractere, sem regex e sem LLM (decisão do
// projeto): o resultado precisa ser determinístico e conferível por teste.
//
// O parser recebe só o trecho dos artigos (o nome da norma vem separado, extraído pela IA): um
// "Lei nº 9.099/1995" aqui seria lido como o artigo 9099.
//
// Artigos com letra que existem DENTRO de um intervalo (313-A em "312 a 317") não aparecem no
// texto do edital - só o texto da norma diz que eles existem. Por isso o parser devolve também os
// intervalos, e `incluirArtigosComLetra` completa a lista quando o texto da norma estiver baixado.

const PALAVRAS_IGNORADAS = new Set(["art", "arts", "artigo", "artigos", "do", "da", "dos", "das", "nº", "n"]);
const PALAVRAS_DE_INTERVALO = new Set(["a", "ao", "à", "até"]);
const PALAVRAS_SEPARADORAS = new Set(["e"]);
const MARCAS_DE_ORDINAL = new Set(["º", "°", "ª"]);
const TRACOS = new Set(["-", "–", "—"]);
const PONTUACAO_IGNORADA = new Set([".", ":", "(", ")"]);
// Proteção contra um intervalo absurdo vindo de erro de digitação no edital ("1 a 30000").
const MAXIMO_ARTIGOS_POR_INTERVALO = 2000;

function eDigito(c) {
  return c >= "0" && c <= "9";
}

function eLetra(c) {
  return c !== undefined && c.toLowerCase() !== c.toUpperCase();
}

function eEspaco(c) {
  return c === " " || c === "\t" || c === "\n" || c === "\r" || c === " ";
}

// "1.072" é o artigo 1072 (separador de milhar): ponto seguido de exatamente 3 dígitos.
function ePontoDeMilhar(texto, i) {
  return (
    texto[i] === "." &&
    eDigito(texto[i + 1]) &&
    eDigito(texto[i + 2]) &&
    eDigito(texto[i + 3]) &&
    !eDigito(texto[i + 4])
  );
}

function lerNumero(texto, inicio) {
  let i = inicio;
  let digitos = "";
  while (i < texto.length && (eDigito(texto[i]) || ePontoDeMilhar(texto, i))) {
    if (texto[i] !== ".") digitos += texto[i];
    i += 1;
  }
  // Ordinal: "1º", "2°", e também "1o" quando o "o" não começa uma palavra.
  if (MARCAS_DE_ORDINAL.has(texto[i]) || (texto[i] === "o" && !eLetra(texto[i + 1]))) i += 1;
  // Sufixo de letra: "311-A" (o traço seguido de UMA letra isolada; "312-317" é intervalo).
  let sufixo = "";
  if (TRACOS.has(texto[i]) && eLetra(texto[i + 1]) && !eLetra(texto[i + 2])) {
    sufixo = texto[i + 1].toUpperCase();
    i += 2;
  }
  return { token: { tipo: "numero", numero: Number(digitos), sufixo }, fim: i };
}

function lerPalavra(texto, inicio) {
  let i = inicio;
  let palavra = "";
  while (i < texto.length && (eLetra(texto[i]) || MARCAS_DE_ORDINAL.has(texto[i]))) {
    palavra += texto[i];
    i += 1;
  }
  return { palavra: palavra.toLowerCase(), fim: i };
}

function tokenizar(texto) {
  const tokens = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (eEspaco(c) || PONTUACAO_IGNORADA.has(c)) {
      i += 1;
    } else if (eDigito(c)) {
      const lido = lerNumero(texto, i);
      tokens.push(lido.token);
      i = lido.fim;
    } else if (c === ";" || c === ",") {
      tokens.push({ tipo: "separador" });
      i += 1;
    } else if (TRACOS.has(c)) {
      tokens.push({ tipo: "intervalo" });
      i += 1;
    } else if (eLetra(c)) {
      const { palavra, fim } = lerPalavra(texto, i);
      if (PALAVRAS_DE_INTERVALO.has(palavra)) tokens.push({ tipo: "intervalo" });
      else if (PALAVRAS_SEPARADORAS.has(palavra)) tokens.push({ tipo: "separador" });
      else if (!PALAVRAS_IGNORADAS.has(palavra)) tokens.push({ tipo: "desconhecido", valor: palavra });
      i = fim;
    } else {
      tokens.push({ tipo: "desconhecido", valor: c });
      i += 1;
    }
  }
  return tokens;
}

function rotulo(numero, sufixo = "") {
  return sufixo ? `${numero}-${sufixo}` : String(numero);
}

// Chave de ordenação: 313 < 313-A < 313-B < 314.
function chaveDeOrdem(artigo) {
  const [numero, sufixo = ""] = artigo.split("-");
  return Number(numero) * 100 + (sufixo ? sufixo.charCodeAt(0) - 64 : 0);
}

function compararArtigos(a, b) {
  return chaveDeOrdem(a) - chaveDeOrdem(b);
}

function expandirIntervalo(inicio, fim) {
  const artigos = [];
  let primeiro = inicio.numero;
  if (inicio.sufixo) {
    artigos.push(rotulo(inicio.numero, inicio.sufixo));
    primeiro += 1;
  }
  for (let n = primeiro; n <= fim.numero; n += 1) artigos.push(String(n));
  if (fim.sufixo) artigos.push(rotulo(fim.numero, fim.sufixo));
  return artigos;
}

// texto -> { artigos: [{ numero: "311-A", origem: "explicito" | "intervalo" }], intervalos: [{ inicio, fim }], avisos: [] }
// `avisos` lista o que não foi entendido (ex.: "caput", "incisos"): o item fica para o orientador conferir.
function expandirArtigos(texto) {
  const tokens = tokenizar(String(texto ?? ""));
  const encontrados = new Map();
  const intervalos = [];
  const avisos = [];

  const adicionar = (numero, origem) => {
    if (!encontrados.has(numero)) encontrados.set(numero, origem);
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.tipo === "numero") {
      const proximo = tokens[i + 1];
      const fim = tokens[i + 2];
      if (proximo?.tipo === "intervalo" && fim?.tipo === "numero") {
        const inicioRotulo = rotulo(token.numero, token.sufixo);
        const fimRotulo = rotulo(fim.numero, fim.sufixo);
        if (compararArtigos(fimRotulo, inicioRotulo) <= 0) {
          avisos.push(`Intervalo invertido ou vazio: ${inicioRotulo} a ${fimRotulo}.`);
        } else if (fim.numero - token.numero > MAXIMO_ARTIGOS_POR_INTERVALO) {
          avisos.push(`Intervalo grande demais para ser verdade: ${inicioRotulo} a ${fimRotulo}.`);
        } else {
          intervalos.push({ inicio: inicioRotulo, fim: fimRotulo });
          for (const artigo of expandirIntervalo(token, fim)) adicionar(artigo, "intervalo");
        }
        i += 2;
      } else {
        adicionar(rotulo(token.numero, token.sufixo), "explicito");
      }
    } else if (token.tipo === "intervalo") {
      avisos.push("Indicação de intervalo sem os dois números (ex.: “a 15”).");
    } else if (token.tipo === "desconhecido") {
      avisos.push(`Trecho não reconhecido: “${token.valor}”.`);
    }
  }

  const artigos = [...encontrados.entries()]
    .map(([numero, origem]) => ({ numero, origem }))
    .sort((a, b) => compararArtigos(a.numero, b.numero));
  return { artigos, intervalos, avisos };
}

// Completa a lista com os artigos com letra que existem no texto da norma e caem dentro de um dos
// intervalos do edital (313-A em "312 a 317"). Decisão do orientador: o artigo com letra logo depois
// da ponta final também entra, então "312 a 317" inclui 317-A e 317-B. Já 311-B, antes da ponta
// inicial, fica fora. Se a ponta final tem letra ("312 a 317-A"), ela é o limite exato: 317-B fica
// fora. Marcados com origem "letra_no_intervalo" para a tela de revisão mostrar que vieram do texto
// da norma, não do edital.
function numeroSemLetra(artigo) {
  return Number(artigo.split("-")[0]);
}

function dentroDoIntervalo(artigo, { inicio, fim }) {
  if (compararArtigos(artigo, inicio) <= 0) return false;
  if (fim.includes("-")) return compararArtigos(artigo, fim) < 0;
  return numeroSemLetra(artigo) <= numeroSemLetra(fim);
}

function incluirArtigosComLetra(resultado, artigosDaNorma) {
  const jaTem = new Set(resultado.artigos.map((a) => a.numero));
  const extras = artigosDaNorma
    .filter((artigo) => artigo.includes("-") && !jaTem.has(artigo))
    .filter((artigo) => resultado.intervalos.some((intervalo) => dentroDoIntervalo(artigo, intervalo)))
    .map((numero) => ({ numero, origem: "letra_no_intervalo" }));
  const artigos = [...resultado.artigos, ...extras].sort((a, b) => compararArtigos(a.numero, b.numero));
  return { ...resultado, artigos };
}

module.exports = { expandirArtigos, incluirArtigosComLetra, compararArtigos, tokenizar };
