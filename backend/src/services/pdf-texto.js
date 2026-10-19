"use strict";

// Lê um PDF (Buffer) e devolve o texto de cada página, na ordem: [{ numero, texto }]. Mesma leitura
// por pdfjs-dist do FinMind (shared/utils/pdf-texto.js), aqui juntando os itens em texto corrido,
// com quebra de linha onde o próprio PDF marca fim de linha.
//
// PDF escaneado (só imagem) volta com páginas vazias: OCR está fora do escopo do MVP.

function textoDaPagina(itens) {
  let texto = "";
  for (const item of itens) {
    texto += item.str;
    if (item.hasEOL) texto += "\n";
  }
  return texto
    .split("\n")
    .map((linha) => linha.trimEnd())
    .join("\n")
    .trim();
}

async function lerPaginas(buffer) {
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");
  // verbosity 0: sem os avisos de fonte do pdfjs no log.
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0
  }).promise;
  const paginas = [];
  try {
    for (let numero = 1; numero <= doc.numPages; numero += 1) {
      const pagina = await doc.getPage(numero);
      const conteudo = await pagina.getTextContent();
      paginas.push({ numero, texto: textoDaPagina(conteudo.items) });
      pagina.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return paginas;
}

module.exports = { lerPaginas, textoDaPagina };
