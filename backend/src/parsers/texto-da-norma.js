"use strict";

const path = require("node:path");
const pdfTexto = require("../services/pdf-texto");

// Converte o arquivo de uma norma (a página HTML salva do Planalto ou da Alesp, um PDF ou um .txt) em linhas de texto,
// cada uma com a parte vigente e a parte tachada (`<strike>`, `<s>`, `<del>`: a redação antiga que o Planalto mostra
// junto da nova). Quem divide em artigos é parsers/artigos-da-norma.js.
//
// Sem biblioteca de HTML: as páginas de lei são HTML simples, e aqui só importa o texto, onde cada bloco quebra a
// linha e o que está tachado.

const BLOCOS = new Set(["p", "br", "div", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "blockquote", "center", "hr", "dt", "dd"]);
const TACHADOS = new Set(["strike", "s", "del"]);
const IGNORADOS = new Set(["script", "style", "head", "title"]);
// Tags sem fechamento: não entram na pilha de tags abertas.
const VAZIAS = new Set(["br", "hr", "img", "meta", "link", "input", "col", "area", "base", "wbr"]);
// O Planalto também tacha por estilo: <span style="text-decoration:line-through">.
const ESTILO_TACHADO = /text-decoration\s*:[^;"']*line-through/i;

const ENTIDADES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ordm: "º", ordf: "ª", sect: "§", deg: "°", para: "¶",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  bdquo: "„", middot: "·", bull: "•", shy: "", copy: "©", reg: "®", sup1: "¹", sup2: "²", sup3: "³", frac12: "½",
  ccedil: "ç", Ccedil: "Ç", ntilde: "ñ", Ntilde: "Ñ", szlig: "ß"
};
const ACENTOS = { acute: "́", grave: "̀", circ: "̂", tilde: "̃", uml: "̈" };
for (const letra of "aeiouAEIOUcCnNyY") {
  for (const [nome, combinante] of Object.entries(ACENTOS)) {
    const composta = (letra + combinante).normalize("NFC");
    if (composta.length === 1) ENTIDADES[`${letra}${nome}`] = composta;
  }
}
const WINDOWS_1252 = new TextDecoder("windows-1252");

function decodificarEntidades(texto) {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (inteira, nome) => {
    if (nome[0] === "#") {
      const codigo = nome[1].toLowerCase() === "x" ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10);
      // 128 a 159 em página antiga quer dizer o caractere do windows-1252 (&#150; é o travessão).
      if (codigo >= 128 && codigo <= 159) return WINDOWS_1252.decode(Buffer.from([codigo]));
      return Number.isFinite(codigo) && codigo > 0 ? String.fromCodePoint(codigo) : "";
    }
    return ENTIDADES[nome] ?? inteira;
  });
}

// O charset declarado na página; sem declaração, UTF-8 se for válido, senão windows-1252 (o das páginas do Planalto).
function decodificarHtml(buffer) {
  const inicio = buffer.subarray(0, 4096).toString("latin1");
  const declarado = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(inicio)?.[1]?.toLowerCase();
  const charset = declarado && ["iso-8859-1", "latin1", "windows-1252", "cp1252"].includes(declarado) ? "windows-1252" : declarado;
  if (charset && charset !== "utf-8" && charset !== "utf8") {
    try {
      return new TextDecoder(charset).decode(buffer);
    } catch {
      return WINDOWS_1252.decode(buffer);
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return WINDOWS_1252.decode(buffer);
  }
}

function limpar(texto) {
  return texto.replace(/[\s ]+/g, " ").trim();
}

// HTML -> [{ texto, tachado }]: uma entrada por linha (bloco), sem as vazias.
function linhasDoHtml(html) {
  const semRuido = html.replace(/<!--[\s\S]*?-->/g, "");
  const linhas = [];
  let vigente = "";
  let tachado = "";
  let profundidadeTachado = 0;
  let ignorando = null;
  // Tags abertas, para fechar o tachado no lugar certo (o </span> que fecha o <span> que tachou).
  const abertas = [];

  const fecharLinha = () => {
    const linha = { texto: limpar(vigente), tachado: limpar(tachado) };
    if (linha.texto || linha.tachado) linhas.push(linha);
    vigente = "";
    tachado = "";
  };

  for (const pedaco of semRuido.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|[^<]+|</g)) {
    const [inteiro, fechamento, nomeDaTag, atributos] = pedaco;
    if (!nomeDaTag) {
      if (ignorando) continue;
      const texto = decodificarEntidades(inteiro === "<" ? "<" : inteiro);
      if (profundidadeTachado > 0) tachado += texto;
      else vigente += texto;
      continue;
    }
    const tag = nomeDaTag.toLowerCase();
    if (IGNORADOS.has(tag)) {
      if (!fechamento) ignorando = tag;
      else if (ignorando === tag) ignorando = null;
      continue;
    }
    if (ignorando) continue;
    if (fechamento) {
      const posicao = abertas.map((aberta) => aberta.tag).lastIndexOf(tag);
      if (posicao >= 0) {
        for (const fechada of abertas.splice(posicao)) {
          if (fechada.tachou) profundidadeTachado = Math.max(0, profundidadeTachado - 1);
        }
      }
    } else if (!VAZIAS.has(tag) && !atributos.trimEnd().endsWith("/")) {
      const tachou = TACHADOS.has(tag) || ESTILO_TACHADO.test(atributos);
      if (tachou) profundidadeTachado += 1;
      abertas.push({ tag, tachou });
    }
    if (TACHADOS.has(tag)) continue;
    if (BLOCOS.has(tag)) fecharLinha();
    else if (tag === "td" || tag === "th") {
      if (profundidadeTachado > 0) tachado += " ";
      else vigente += " ";
    }
  }
  fecharLinha();
  return linhas;
}

function linhasDoTexto(texto) {
  return texto
    .split(/\r?\n/)
    .map((linha) => ({ texto: limpar(linha), tachado: "" }))
    .filter((linha) => linha.texto);
}

// buffer + nome do arquivo (pela extensão) -> [{ texto, tachado }].
async function linhasDoArquivo(buffer, nomeArquivo, { lerPaginas = pdfTexto.lerPaginas } = {}) {
  const extensao = path.extname(nomeArquivo).toLowerCase();
  if (extensao === ".html" || extensao === ".htm") return linhasDoHtml(decodificarHtml(buffer));
  if (extensao === ".pdf") {
    const paginas = await lerPaginas(buffer);
    return linhasDoTexto(paginas.map((p) => p.texto).join("\n"));
  }
  return linhasDoTexto(decodificarHtml(buffer));
}

module.exports = { linhasDoArquivo, linhasDoHtml, decodificarEntidades, decodificarHtml };
