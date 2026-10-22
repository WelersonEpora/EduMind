"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { linhasDoArquivo, linhasDoHtml, decodificarEntidades } = require("./texto-da-norma");
const { dividirEmArtigos, dataDaNota, dataMaisRecente } = require("./artigos-da-norma");

// Trechos no formato das páginas do Planalto (texto compilado), com os casos que apareceram no CPP e no CPC reais.
const PAGINA = `<html><head><title>DEL3689</title><style>p {margin:0}</style>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>
<p>Presidência da República</p>
<p>DECRETO-LEI Nº 3.689, DE 3 DE OUTUBRO DE 1941.</p>
<p>O PRESIDENTE DA REPÚBLICA decreta a seguinte Lei:</p>
<p>LIVRO I</p><p>DO PROCESSO EM GERAL</p>
<p>TÍTULO I</p><p>DISPOSIÇÕES PRELIMINARES</p>
<p><font>Art.&nbsp;1<sup><u>o</u></sup>&nbsp; O processo penal reger-se-á por este Código, ressalvados:</font></p>
<p>I - os tratados; (Redação dada pela Lei nº 9.043, de 9.5.1995)</p>
<p>Parágrafo único. Aplicar-se-á este Código aos processos referidos nos n<sup>os</sup>. IV e V.</p>
<p>Juiz das Garantias</p>
<p>(Incluído pela Lei nº 13.964, de 2019) (Vigência)</p>
<p>Art. 3º-A. O processo penal terá estrutura acusatória. (Incluído pela Lei nº 13.964, de 2019) (Vide ADI 6.298)</p>
<p>CAPÍTULO II</p><p>DA AÇÃO</p>
<p><span style="font-weight: normal; text-decoration:line-through"><a name="art4"></a>Art. 4º Texto antigo do artigo quatro.</span></p>
<p>Art. 4º Texto novo do artigo quatro. (Redação dada pela Lei nº 15.358, de 12 de março de 2026)</p>
<p>(Revogado pela Lei nº 13.256, de 2016) <strike>Art. 5º Artigo inteiro revogado.</strike></p>
<p>(Revogado pela Lei nº 13.256, de 2016) <strike>§ 1º Parágrafo também revogado.</strike></p>
<p>Art. 7º Sétimo artigo, &#150; com travessão antigo &amp; entidade.</p>
<p>Art. 7º Repetição indevida do número.</p>
<p>Art. 1.072. Artigo com ponto de milhar.</p>
<p>Rio de Janeiro, em 3 de outubro de 1941; 120o da Independência.</p>
<p>GETÚLIO VARGAS</p>
<p>Este texto não substitui o publicado no DOU</p>
</body></html>`;

async function dividirPagina(html = PAGINA) {
  const linhas = await linhasDoArquivo(Buffer.from(new TextEncoder().encode(html)), "cpp.htm");
  return dividirEmArtigos(linhas);
}

test("separa os artigos com número, letra, ordinal e ponto de milhar", async () => {
  const { artigos } = await dividirPagina();
  assert.deepEqual(
    artigos.map((a) => a.numero),
    ["1", "3-A", "4", "5", "7", "1072"]
  );
  assert.equal(artigos[0].caput, "O processo penal reger-se-á por este Código, ressalvados:");
  assert.equal(artigos[5].caput, "Artigo com ponto de milhar.");
});

test("o artigo traz §§ e incisos; a epígrafe e a nota dela não entram no artigo anterior", async () => {
  const { artigos } = await dividirPagina();
  assert.equal(
    artigos[0].texto,
    "Art. 1o O processo penal reger-se-á por este Código, ressalvados:\nI - os tratados; (Redação dada pela Lei nº 9.043, de 9.5.1995)\nParágrafo único. Aplicar-se-á este Código aos processos referidos nos nos. IV e V."
  );
});

test("guarda onde o artigo está: livro, título, capítulo e os nomes", async () => {
  const { artigos } = await dividirPagina();
  assert.deepEqual(artigos[0].estrutura, {
    livro: "Livro I",
    livro_nome: "DO PROCESSO EM GERAL",
    titulo: "Título I",
    titulo_nome: "DISPOSIÇÕES PRELIMINARES"
  });
  assert.equal(artigos[2].estrutura.capitulo, "Capítulo II");
  assert.equal(artigos[2].estrutura.capitulo_nome, "DA AÇÃO");
});

test("o texto tachado (por <strike> ou por estilo) fica como redação anterior, fora do texto vigente", async () => {
  const { artigos } = await dividirPagina();
  const quatro = artigos.find((a) => a.numero === "4");
  assert.equal(quatro.texto, "Art. 4º Texto novo do artigo quatro. (Redação dada pela Lei nº 15.358, de 12 de março de 2026)");
  assert.equal(quatro.redacao_anterior, "Art. 4º Texto antigo do artigo quatro.");
});

test("artigo inteiro tachado com a nota de revogação é revogado, não faltando", async () => {
  const { artigos } = await dividirPagina();
  const cinco = artigos.find((a) => a.numero === "5");
  assert.deepEqual(
    { revogado: cinco.revogado, caput: cinco.caput, anterior: cinco.redacao_anterior },
    { revogado: true, caput: "", anterior: "Art. 5º Artigo inteiro revogado.\n§ 1º Parágrafo também revogado." }
  );
  assert.equal(artigos.find((a) => a.numero === "4").revogado, false);
});

test("as notas de redação são lidas com tipo e data; Vide e Vigência não contam como alteração", async () => {
  const { artigos } = await dividirPagina();
  assert.deepEqual(
    artigos[1].notas.map((n) => [n.tipo, n.alteracao, n.data]),
    [
      ["inclusao", true, { valor: "2019", precisao: "ano" }],
      ["vide", false, null]
    ]
  );
  assert.deepEqual(dataDaNota("Redação dada pela Lei nº 9.043, de 9.5.1995"), { valor: "1995-05-09", precisao: "dia" });
  assert.deepEqual(dataDaNota("Redação dada pela Lei nº 15.358, de 12 de março de 2026"), { valor: "2026-03-12", precisao: "dia" });
  assert.deepEqual(dataDaNota("Incluído pela Emenda Constitucional nº 45, de 2004"), { valor: "2004", precisao: "ano" });
});

test("a data da versão é a alteração mais recente das notas", async () => {
  const { dataDaVersao } = await dividirPagina();
  assert.deepEqual(dataDaVersao, { valor: "2026-03-12", precisao: "dia" });
  assert.deepEqual(
    dataMaisRecente([
      { alteracao: true, data: { valor: "2019", precisao: "ano" } },
      { alteracao: true, data: { valor: "2016-04-10", precisao: "dia" } },
      { alteracao: false, data: null }
    ]),
    { valor: "2019-01-01", precisao: "ano" }
  );
  assert.equal(dataMaisRecente([]), null);
});

test("para no fim do texto e avisa números repetidos e que faltam na sequência", async () => {
  const { artigos, avisos } = await dividirPagina();
  const ultimo = artigos.at(-1);
  assert.equal(ultimo.texto, "Art. 1.072. Artigo com ponto de milhar.");
  assert.equal(artigos.find((a) => a.numero === "7").texto, "Art. 7º Sétimo artigo, – com travessão antigo & entidade.\nArt. 7º Repetição indevida do número.");
  assert.equal(avisos[0], "O artigo 7 aparece mais de uma vez; a repetição ficou no texto do artigo anterior.");
  assert.match(avisos[1], /^O texto não traz os artigos 2, 3, 6, 8, 9,/);
});

test("ADCT: os artigos das disposições transitórias ganham o prefixo e não colidem", async () => {
  // O link "Ato das Disposições..." no cabeçalho da página do Planalto vem antes do Art. 1º e não é o ADCT.
  const html = `<p><a href="#adct">Ato das Disposições Constitucionais Transitórias</a></p>
<p>TÍTULO I</p><p>Art. 1º A República.</p><p>Art. 2º Os Poderes, como prevê o art. 3º do Ato das Disposições Constitucionais Transitórias.</p>
<p>Brasília, 5 de outubro de 1988.</p><p>ULYSSES GUIMARÃES</p>
<p>ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS</p><p>Art. 1º O Presidente prestará compromisso.</p>`;
  const { artigos } = dividirEmArtigos(linhasDoHtml(html));
  assert.deepEqual(artigos.map((a) => a.numero), ["1", "2", "ADCT 1"]);
});

test("arquivo sem artigos (página salva sem o texto) vira aviso claro", async () => {
  const { artigos, avisos } = dividirEmArtigos(linhasDoHtml("<html><body><noscript>Please enable JavaScript</noscript></body></html>"));
  assert.equal(artigos.length, 0);
  assert.match(avisos[0], /Nenhum artigo encontrado/);
});

test("lê windows-1252 declarado na página e entidades HTML", async () => {
  const bytes = Buffer.concat([
    Buffer.from('<meta charset="iso-8859-1"><p>Art. 1', "latin1"),
    Buffer.from([0xba]),
    Buffer.from(" Disposi", "latin1"),
    Buffer.from([0xe7, 0xe3]),
    Buffer.from("o.</p>", "latin1")
  ]);
  const [linha] = await linhasDoArquivo(bytes, "lei.html");
  assert.equal(linha.texto, "Art. 1º Disposição.");
  assert.equal(decodificarEntidades("&sect; 1&ordm; &aacute;&ccedil;&#233;&#x2014;"), "§ 1º áçé—");
});

test("texto puro (.txt) também é dividido", async () => {
  const { artigos } = dividirEmArtigos(await linhasDoArquivo(Buffer.from("Art. 1º Primeiro.\nArt. 2º Segundo.\n"), "lei.txt"));
  assert.deepEqual(artigos.map((a) => [a.numero, a.caput]), [["1", "Primeiro."], ["2", "Segundo."]]);
});

test("ALESP: 'Artigo 14 - A nomeação' não é o 14-A; notas com traço; revogados em grupo", async () => {
  const html = `<p>Artigo 14 - A nomeação será precedida de concurso.</p>
<p>Artigo 26 - O funcionário poderá ser transferido.</p>
<p>- Artigo 26 com redação dada pela Lei Complementar n° 1.361, de 21/10/2021.</p>
<p><strike>Artigo 188 — O funcionário licenciado.</strike></p>
<p><strike>Artigo 189 — O órgão médico.</strike></p>
<p>Artigos 188 e 189 - Revogados.</p>
<p>- Artigos 188 e 189 revogados pela Lei Complementar n° 1.123, de 01/07/2010.</p>
<p>Artigo 267-A - A autoridade competente.</p>
<p>- Artigo 267-A acrescentado pela Lei Complementar n° 1.400, de 05/03/2024.</p>`;
  const { artigos, dataDaVersao } = dividirEmArtigos(linhasDoHtml(html));
  assert.deepEqual(
    artigos.map((a) => [a.numero, a.revogado, a.caput, a.notas.map((n) => [n.tipo, n.data?.valor])]),
    [
      ["14", false, "A nomeação será precedida de concurso.", []],
      ["26", false, "O funcionário poderá ser transferido.", [["redacao", "2021-10-21"]]],
      ["188", true, "Revogados.", [["revogacao", "2010-07-01"]]],
      ["189", true, "Revogados.", [["revogacao", "2010-07-01"]]],
      ["267-A", false, "A autoridade competente.", [["inclusao", "2024-03-05"]]]
    ]
  );
  assert.deepEqual(dataDaVersao, { valor: "2024-03-05", precisao: "dia" });
});
