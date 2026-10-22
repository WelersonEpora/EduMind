"use strict";

// Divide o texto de uma norma em artigos (etapa 2b). Recebe as linhas de parsers/texto-da-norma.js
// ([{ texto, tachado }]) e devolve, para cada artigo: número ("313-A"), caput, texto vigente inteiro (com §§, incisos
// e as notas como estão na página), notas de redação, se está revogado, onde está na estrutura da norma (livro,
// título, capítulo, seção) e a redação anterior tachada, quando a página mostra.
//
// É código, sem IA: nunca se inventa texto de lei. O que não se consegue ler com segurança vira aviso.

const NIVEIS = ["parte", "livro", "titulo", "capitulo", "secao", "subsecao"];
const ROTULOS_DOS_NIVEIS = { parte: "Parte", livro: "Livro", titulo: "Título", capitulo: "Capítulo", secao: "Seção", subsecao: "Subseção" };

// "Art. 1º", "Art. 3o", "Art. 1.072.", "Art. 3º-A.", "Art. 311-A", "Artigo 5º".
// A letra do artigo vem colada ao hífen ("Artigo 267-A - A autoridade"). Com espaço, é a primeira palavra do texto:
// a ALESP escreve "Artigo 14 - A nomeação", que não é o artigo 14-A.
const INICIO_DE_ARTIGO = /^Art(?:igo)?\.?\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:\s*[º°ªo](?![a-z]))?(?:-([A-Z])(?![a-zà-ú]))?\s*[.:–—-]?\s*/i;
const CABECALHO = /^(PARTE|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\s+([IVXLCDM]+|[ÚU]NIC[OA]|GERAL|ESPECIAL|PRELIMINAR)\b/i;
const NIVEL_DO_CABECALHO = { parte: "parte", livro: "livro", titulo: "titulo", capitulo: "capitulo", secao: "secao", subsecao: "subsecao" };
// Só a linha que é o título; artigos e notas citam "o art. 60 do Ato das Disposições Constitucionais Transitórias".
const ADCT = /^\s*(ATO DAS )?DISPOSI[ÇC][ÕO]ES CONSTITUCIONAIS TRANSIT[ÓO]RIAS\s*$/i;
// Depois do último artigo: local e data da assinatura, ou o aviso do Planalto.
const FIM_DO_TEXTO = /^((Rio de Janeiro|Bras[íi]lia|S[ãa]o Paulo|Pal[áa]cio[^,]*),\s*(em\s+)?\d{1,2}\b|Este texto n[ãa]o substitui)/i;

const NOTA = /\((Reda[çc][ãa]o dada|Inclu[íi]d[oa]|Revogad[oa]|Renumerad[oa]|Acrescid[oa]|Acrescentad[oa]|Vide|Vig[êe]ncia|Regulamento|Produ[çc][ãa]o de efeitos?|Promulga[çc][ãa]o|Convers[ãa]o|Express[ãa]o suprimida|VETADO|Vetad[oa])\b[^()]*(?:\([^()]*\)[^()]*)*\)/gi;
const TIPOS_DE_NOTA = [
  [/^reda[çc][ãa]o dada/i, "redacao"],
  [/^inclu[íi]d|^acrescid|^acrescentad/i, "inclusao"],
  [/^revogad/i, "revogacao"],
  [/^renumerad/i, "renumeracao"],
  [/^vide/i, "vide"],
  [/^vig[êe]ncia/i, "vigencia"],
  [/^vetad|^vetado/i, "veto"]
];
// Notas da ALESP: linha própria começando com traço, sem parênteses.
// "- Artigo 187 com redação dada pela Lei Complementar n° 1.361, de 21/10/2021."
const NOTA_ALESP = /^-\s+[^\n]*?\b(reda[çc][ãa]o dada|acrescentad[oa]s?|acrescid[oa]s?|inclu[íi]d[oa]s?|revogad[oa]s?|renumerad[oa]s?|reposicionad[oa]s?|vetad[oa]s?)\b[^\n]*$/gim;
const TIPOS_DE_NOTA_ALESP = [
  [/^reda/i, "redacao"],
  [/^acresc|^inclu/i, "inclusao"],
  [/^revogad/i, "revogacao"],
  [/^renumerad|^reposicionad/i, "renumeracao"],
  [/^vetad/i, "veto"]
];
// Mais de um artigo numa linha, como a ALESP mostra os revogados: "Artigos 188 e 189 - Revogados.", "Artigos 10 a 12 - ...".
const GRUPO_DE_ARTIGOS = /^Artigos\s+(\d+(?:-[A-Z])?(?:\s*(?:,|\be\b|\ba\b|\baté(?=\s))\s*\d+(?:-[A-Z])?)+)\s*[-–—.:]\s*/i;
// Notas que mudam o texto: entram na data da versão.
const ALTERACOES = new Set(["redacao", "inclusao", "revogacao", "renumeracao"]);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function doisDigitos(n) {
  return String(n).padStart(2, "0");
}

function anoCompleto(ano) {
  const n = Number(ano);
  if (ano.length === 4) return n;
  return n + (n > 30 ? 1900 : 2000);
}

// A data do ato citado na nota: "de 9.5.1995" e "de 24 de dezembro de 2019" (dia) ou "de 2019" (só o ano).
function dataDaNota(texto) {
  const numerica = /\bde\s+(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/i.exec(texto);
  if (numerica) {
    const [, dia, mes, ano] = numerica;
    return { valor: `${anoCompleto(ano)}-${doisDigitos(mes)}-${doisDigitos(dia)}`, precisao: "dia" };
  }
  const extenso = new RegExp(`\\bde\\s+(\\d{1,2})[º°o]?\\s+de\\s+(${MESES.join("|")})\\s+de\\s+(\\d{4})`, "i").exec(texto);
  if (extenso) {
    const [, dia, mes, ano] = extenso;
    return { valor: `${ano}-${doisDigitos(MESES.indexOf(mes.toLowerCase()) + 1)}-${doisDigitos(dia)}`, precisao: "dia" };
  }
  const anos = [...texto.matchAll(/\bde\s+(\d{4})\b/gi)];
  return anos.length ? { valor: anos.at(-1)[1], precisao: "ano" } : null;
}

function lerNota(texto) {
  const corpo = texto.slice(1, -1).trim();
  const tipo = TIPOS_DE_NOTA.find(([padrao]) => padrao.test(corpo))?.[1] || "outra";
  return { tipo, texto, alteracao: ALTERACOES.has(tipo), data: ALTERACOES.has(tipo) ? dataDaNota(corpo) : null };
}

function lerNotaAlesp(texto, palavra) {
  const tipo = TIPOS_DE_NOTA_ALESP.find(([padrao]) => padrao.test(palavra))?.[1] || "outra";
  return { tipo, texto, alteracao: ALTERACOES.has(tipo), data: ALTERACOES.has(tipo) ? dataDaNota(texto) : null };
}

function notasDe(texto) {
  return [...[...texto.matchAll(NOTA)].map((m) => lerNota(m[0])), ...[...texto.matchAll(NOTA_ALESP)].map((m) => lerNotaAlesp(m[0], m[1]))];
}

function semNotas(texto) {
  return texto.replace(NOTA, "").replace(NOTA_ALESP, "").replace(/\s+/g, " ").trim();
}

// "188 e 189" -> ["188", "189"]; "10 a 12" -> ["10", "11", "12"].
function numerosDoGrupo(lista) {
  const partes = lista.split(/\s*(,|\be\b|\ba\b|\baté(?=\s))\s*/i).filter((p) => p.trim() !== "");
  const numeros = [];
  for (let i = 0; i < partes.length; i += 1) {
    const parte = partes[i].toLowerCase();
    if (parte === "a" || parte === "até") {
      const de = Number(numeros[numeros.length - 1]);
      const ate = Number(partes[i + 1]);
      if (Number.isInteger(de) && Number.isInteger(ate) && ate > de && ate - de <= 200) {
        for (let n = de + 1; n < ate; n += 1) numeros.push(String(n));
      }
    } else if (parte !== "," && parte !== "e") {
      numeros.push(partes[i].toUpperCase());
    }
  }
  return [...new Set(numeros)];
}

function numeroDoArtigo(digitos, letra) {
  const numero = digitos.replace(/\./g, "");
  return letra ? `${numero}-${letra.toUpperCase()}` : numero;
}

// Epígrafe ("Juiz das Garantias", "Moeda Falsa") ou nome de capítulo ("DOS CRIMES CONTRA A FÉ PÚBLICA"): linha curta,
// sem pontuação no fim, que não é parágrafo, inciso nem alínea.
function pareceTitulo(texto) {
  const limpo = semNotas(texto);
  if (!limpo || limpo.length > 120) return false;
  if (/^(§|Par[áa]grafo|[IVXLCDM]+\s*[-–—.]|[a-z]\)|\()/.test(limpo)) return false;
  return !/[.;:,]$/.test(limpo);
}

function soNota(texto) {
  const inicio = texto.trim()[0];
  return (inicio === "(" || inicio === "-") && semNotas(texto) === "";
}

// Comparar a data de uma alteração com outra ({ valor, precisao }). Só o ano: conta como 1º de janeiro.
function chaveDaData(data) {
  return data.precisao === "ano" ? `${data.valor}-01-01` : data.valor;
}

// A alteração mais recente entre as notas: o ano mais recente e, nele, o dia mais recente, se alguma nota trouxer o dia.
function dataMaisRecente(notas) {
  const datas = notas.filter((n) => n.alteracao && n.data).map((n) => n.data);
  if (datas.length === 0) return null;
  const ano = Math.max(...datas.map((d) => Number(d.valor.slice(0, 4))));
  const comDia = datas.filter((d) => d.precisao === "dia" && d.valor.startsWith(String(ano)));
  if (comDia.length === 0) return { valor: `${ano}-01-01`, precisao: "ano" };
  return comDia.reduce((maior, d) => (d.valor > maior.valor ? d : maior));
}

// linhas -> { artigos, avisos, dataDaVersao }
function dividirEmArtigos(linhas) {
  const artigos = [];
  const avisos = [];
  const vistos = new Set();
  const estrutura = {};
  let atual = null;
  let prefixo = "";
  // Redação anterior tachada de um artigo que ainda vai começar ("<strike>Art. 33. ...</strike>" antes do novo).
  let tachadoPendente = null;
  let ultimoNivel = null;

  const fecharArtigo = () => {
    if (!atual) return;
    // Epígrafe e nome de capítulo que vêm antes do próximo artigo não são texto deste: sai da última linha que parece
    // título até o fim (com as notas dela).
    let corte = atual.linhas.length;
    for (let i = atual.linhas.length - 1; i >= 1; i -= 1) {
      if (soNota(atual.linhas[i])) continue;
      if (pareceTitulo(atual.linhas[i])) corte = i;
      break;
    }
    const linhas = atual.linhas.slice(0, corte);
    const texto = linhas.join("\n");
    const notas = notasDe(texto);
    const inicio = atual.grupo ? GRUPO_DE_ARTIGOS : INICIO_DE_ARTIGO;
    const caput = semNotas(linhas[0].replace(inicio, ""));
    // Linha a linha: as notas da ALESP ocupam a linha inteira.
    const corpo = linhas
      .map((l, i) => semNotas(i === 0 ? l.replace(inicio, "") : l))
      .filter(Boolean)
      .join(" ");
    const revogado =
      (atual.grupo && /^\(?revogad[oa]/i.test(corpo)) ||
      (notas.some((n) => n.tipo === "revogacao") && (corpo === "" || /^\(?revogad[oa]/i.test(corpo) || /^revogad[oa]\.?$/i.test(caput)));
    for (const numero of atual.grupo || [atual.numero]) {
      artigos.push({
        numero,
        ordem: artigos.length,
        caput,
        texto,
        notas,
        revogado,
        estrutura: atual.estrutura,
        redacao_anterior: atual.tachado.length ? atual.tachado.join("\n") : null
      });
    }
    atual = null;
  };

  // Depois da assinatura (fim do texto), só o título do ADCT retoma a leitura: na Constituição, o ADCT vem depois do
  // "Brasília, 5 de outubro de 1988." do texto principal.
  let encerrado = false;
  for (const linha of linhas) {
    const texto = linha.texto;
    const jaLeuArtigo = artigos.length + (atual ? 1 : 0) > 0;
    if (texto && FIM_DO_TEXTO.test(texto) && jaLeuArtigo) {
      fecharArtigo();
      encerrado = true;
      continue;
    }

    // Antes do primeiro artigo, a menção ao ADCT é o índice ou um link do cabeçalho da página (Planalto), não o início dele.
    if (texto && ADCT.test(texto) && jaLeuArtigo) {
      fecharArtigo();
      encerrado = false;
      prefixo = "ADCT ";
      for (const nivel of NIVEIS) delete estrutura[nivel];
      continue;
    }
    if (encerrado) continue;

    const cabecalho = texto && CABECALHO.exec(texto);
    if (cabecalho) {
      fecharArtigo();
      const nomeDoNivel = cabecalho[1].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const nivel = NIVEL_DO_CABECALHO[nomeDoNivel];
      const rotulo = `${ROTULOS_DOS_NIVEIS[nivel]} ${cabecalho[2].toUpperCase()}`;
      estrutura[nivel] = rotulo;
      delete estrutura[`${nivel}_nome`];
      for (const abaixo of NIVEIS.slice(NIVEIS.indexOf(nivel) + 1)) {
        delete estrutura[abaixo];
        delete estrutura[`${abaixo}_nome`];
      }
      ultimoNivel = nivel;
      continue;
    }

    // "Artigos 188 e 189 - Revogados.": um artigo para cada número, com o mesmo texto e as mesmas notas.
    const grupo = texto && GRUPO_DE_ARTIGOS.exec(texto);
    if (grupo) {
      const numeros = numerosDoGrupo(grupo[1])
        .map((n) => prefixo + n)
        .filter((n) => !vistos.has(n));
      if (numeros.length > 0) {
        fecharArtigo();
        for (const numero of numeros) vistos.add(numero);
        atual = { numero: numeros[0], grupo: numeros, linhas: [texto], tachado: [], estrutura: { ...estrutura } };
        tachadoPendente = null;
        ultimoNivel = null;
        continue;
      }
    }

    // Artigo revogado mostrado inteiro tachado, com só a nota vigente na linha: "(Revogado pela Lei nº 13.256, de 2016)"
    // + "<strike>Art. 945. ...</strike>". Começa o artigo pelo número do tachado; o texto vigente é só a nota.
    const inicio = (texto && INICIO_DE_ARTIGO.exec(texto)) || (texto && linha.tachado && soNota(texto) && INICIO_DE_ARTIGO.exec(linha.tachado));
    if (inicio) {
      const numero = prefixo + numeroDoArtigo(inicio[1], inicio[2]);
      if (vistos.has(numero)) {
        avisos.push(`O artigo ${numero} aparece mais de uma vez; a repetição ficou no texto do artigo anterior.`);
      } else {
        fecharArtigo();
        vistos.add(numero);
        atual = { numero, linhas: [texto], tachado: [], estrutura: { ...estrutura } };
        if (tachadoPendente?.numero === numero) atual.tachado.push(...tachadoPendente.linhas);
        tachadoPendente = null;
        ultimoNivel = null;
        if (linha.tachado) atual.tachado.push(linha.tachado);
        continue;
      }
    }

    // Linha só tachada que começa um artigo: redação anterior do artigo que vem a seguir.
    if (!texto && linha.tachado) {
      const inicioTachado = INICIO_DE_ARTIGO.exec(linha.tachado);
      if (inicioTachado) {
        const numero = prefixo + numeroDoArtigo(inicioTachado[1], inicioTachado[2]);
        if (!atual || numero !== atual.numero) {
          tachadoPendente = { numero, linhas: [linha.tachado] };
          continue;
        }
      }
      if (tachadoPendente) tachadoPendente.linhas.push(linha.tachado);
      else if (atual) atual.tachado.push(linha.tachado);
      continue;
    }

    // Nome do capítulo logo depois do cabeçalho ("CAPÍTULO I" / "DOS CRIMES ..."): não é texto de artigo.
    if (ultimoNivel && pareceTitulo(texto)) {
      estrutura[`${ultimoNivel}_nome`] = estrutura[`${ultimoNivel}_nome`] ? `${estrutura[`${ultimoNivel}_nome`]} ${semNotas(texto)}` : semNotas(texto);
      continue;
    }
    if (!atual) continue;
    atual.linhas.push(texto);
    if (linha.tachado) atual.tachado.push(linha.tachado);
  }
  fecharArtigo();

  // Números que faltam na sequência (sem contar os com letra): a página pode ter omitido artigos revogados há muito
  // tempo. Na cobertura, eles aparecem como não encontrados no texto.
  const inteiros = new Set(artigos.map((a) => a.numero).filter((n) => /^\d+$/.test(n)).map(Number));
  const faltando = [];
  for (let n = 1; n < Math.max(0, ...inteiros); n += 1) if (!inteiros.has(n)) faltando.push(n);
  if (faltando.length > 0) {
    const lista = faltando.length > 40 ? `${faltando.slice(0, 40).join(", ")} e mais ${faltando.length - 40}` : faltando.join(", ");
    avisos.push(`O texto não traz ${faltando.length === 1 ? "o artigo" : "os artigos"} ${lista}.`);
  }

  if (artigos.length === 0) {
    avisos.push(
      "Nenhum artigo encontrado. O arquivo pode estar vazio: página que depende de JavaScript salva como 'somente HTML'. Salve como 'Página da Web, completa' ou imprima em PDF."
    );
  }
  return { artigos, avisos, dataDaVersao: dataMaisRecente(artigos.flatMap((a) => a.notas)) };
}

module.exports = { dividirEmArtigos, dataDaNota, notasDe, dataMaisRecente, chaveDaData };
