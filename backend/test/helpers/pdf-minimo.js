"use strict";

// Monta um PDF válido e mínimo, uma linha de texto ASCII por item, para testar a leitura por página
// sem depender de arquivo binário no repositório.
function pdfMinimo(paginas) {
  const objetos = [];
  const idPagina = (k) => 4 + k * 2;
  objetos[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objetos[2] = `<< /Type /Pages /Kids [${paginas.map((_, k) => `${idPagina(k)} 0 R`).join(" ")}] /Count ${paginas.length} >>`;
  objetos[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  paginas.forEach((linhas, k) => {
    const comandos = linhas
      .map((linha, i) => `BT /F1 12 Tf 72 ${720 - i * 20} Td (${linha.replace(/[()\\]/g, "\\$&")}) Tj ET`)
      .join("\n");
    objetos[idPagina(k)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${idPagina(k) + 1} 0 R >>`;
    objetos[idPagina(k) + 1] = `<< /Length ${Buffer.byteLength(comandos)} >>\nstream\n${comandos}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const posicoes = [];
  for (let id = 1; id < objetos.length; id += 1) {
    posicoes[id] = Buffer.byteLength(pdf);
    pdf += `${id} 0 obj\n${objetos[id]}\nendobj\n`;
  }
  const inicioXref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objetos.length; id += 1) pdf += `${String(posicoes[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

module.exports = { pdfMinimo };
