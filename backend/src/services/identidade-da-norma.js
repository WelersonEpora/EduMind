"use strict";

// Identidade de uma norma citada no edital (etapa 2a-1), proposta por código e confirmada pelo orientador.
//
// A chave junta jurisdição, tipo, número e ano: "br:lei:9099:1995", "sp:lei:10261:1968", "tjsp:resolucao:850:2021",
// "br:constituicao:-:1988". É ela que junta as citações da mesma norma, inclusive entre editais.
//
// Os grandes códigos costumam vir sem número no edital ("Código Penal"): vêm deste catálogo fixo, conferido à mão.
// O que o código não sabe com segurança vira alerta para o orientador (ano com 2 dígitos, jurisdição suposta).

const CATALOGO = [
  { nomes: ["constituicao federal", "constituicao da republica federativa do brasil", "constituicao"], tipo: "constituicao", numero: null, ano: "1988", nome: "Constituição da República Federativa do Brasil de 1988" },
  { nomes: ["codigo penal"], tipo: "decreto-lei", numero: "2.848", ano: "1940", nome: "Código Penal" },
  { nomes: ["codigo de processo penal"], tipo: "decreto-lei", numero: "3.689", ano: "1941", nome: "Código de Processo Penal" },
  { nomes: ["codigo de processo civil"], tipo: "lei", numero: "13.105", ano: "2015", nome: "Código de Processo Civil" },
  { nomes: ["codigo civil"], tipo: "lei", numero: "10.406", ano: "2002", nome: "Código Civil" },
  { nomes: ["consolidacao das leis do trabalho", "clt"], tipo: "decreto-lei", numero: "5.452", ano: "1943", nome: "Consolidação das Leis do Trabalho" },
  { nomes: ["codigo tributario nacional"], tipo: "lei", numero: "5.172", ano: "1966", nome: "Código Tributário Nacional" },
  { nomes: ["codigo de defesa do consumidor"], tipo: "lei", numero: "8.078", ano: "1990", nome: "Código de Defesa do Consumidor" },
  { nomes: ["estatuto da crianca e do adolescente"], tipo: "lei", numero: "8.069", ano: "1990", nome: "Estatuto da Criança e do Adolescente" },
  { nomes: ["codigo eleitoral"], tipo: "lei", numero: "4.737", ano: "1965", nome: "Código Eleitoral" },
  { nomes: ["codigo de transito brasileiro"], tipo: "lei", numero: "9.503", ano: "1997", nome: "Código de Trânsito Brasileiro" },
  { nomes: ["codigo penal militar"], tipo: "decreto-lei", numero: "1.001", ano: "1969", nome: "Código Penal Militar" },
  { nomes: ["codigo de processo penal militar"], tipo: "decreto-lei", numero: "1.002", ano: "1969", nome: "Código de Processo Penal Militar" }
];

// tipo normalizado -> tipo canônico. O que não está aqui vira um "slug" do próprio texto.
const TIPOS = {
  lei: "lei",
  "lei federal": "lei",
  "lei ordinaria": "lei",
  "lei estadual": "lei",
  "lei complementar": "lei-complementar",
  "lei complementar federal": "lei-complementar",
  "lei complementar estadual": "lei-complementar",
  "decreto-lei": "decreto-lei",
  "decreto lei": "decreto-lei",
  decreto: "decreto",
  "decreto estadual": "decreto",
  resolucao: "resolucao",
  "resolucao tjsp": "resolucao",
  provimento: "provimento",
  "provimento cgj": "provimento",
  constituicao: "constituicao",
  "constituicao federal": "constituicao",
  "emenda constitucional": "emenda-constitucional",
  "regimento interno": "regimento-interno"
};
const ROTULOS = {
  lei: "Lei",
  "lei-complementar": "Lei Complementar",
  "decreto-lei": "Decreto-Lei",
  decreto: "Decreto",
  resolucao: "Resolução",
  provimento: "Provimento",
  constituicao: "Constituição",
  "emenda-constitucional": "Emenda Constitucional",
  "regimento-interno": "Regimento Interno"
};
// Tipos de ato que um tribunal edita (para propor a jurisdição do tribunal).
const TIPOS_DE_TRIBUNAL = new Set(["resolucao", "provimento", "regimento-interno"]);

function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tipoCanonico(tipo) {
  const normalizado = normalizar(tipo);
  return TIPOS[normalizado] || normalizado.replace(/ /g, "-") || "norma";
}

function rotuloDoTipo(tipoCanonicoDaNorma) {
  return ROTULOS[tipoCanonicoDaNorma] || tipoCanonicoDaNorma.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function soDigitos(texto) {
  return String(texto ?? "").replace(/\D/g, "");
}

// "9.099" fica como está (é como o orientador lê); a chave usa só os dígitos.
function chaveDe({ jurisdicao, tipo, numero, ano }) {
  return [normalizar(jurisdicao) || "br", tipoCanonico(tipo), soDigitos(numero) || "-", soDigitos(ano) || "-"].join(":");
}

// Ano de 2 dígitos ("68") vira 1968 ou 20xx, o mais próximo sem passar do ano atual. Sempre com alerta.
function anoCompleto(ano, anoAtual) {
  const digitos = soDigitos(ano);
  if (digitos.length !== 2) return { ano: digitos || null, alerta: null };
  const seculo = Number(digitos) > anoAtual % 100 ? "19" : "20";
  return { ano: `${seculo}${digitos}`, alerta: `O edital traz o ano com 2 dígitos (${digitos}); confirme ${seculo}${digitos}.` };
}

function jurisdicaoProvavel(tipo, textos) {
  const texto = normalizar(textos.join(" "));
  if (TIPOS_DE_TRIBUNAL.has(tipo) && /\btjsp\b|tribunal de justica do estado de sao paulo|corregedoria geral da justica/.test(texto)) {
    return { jurisdicao: "TJSP", alerta: null };
  }
  if (/\bfederal\b/.test(normalizar(textos[0]))) return { jurisdicao: "BR", alerta: null };
  if (/estado de sao paulo|\bpaulista\b|\bsp\b/.test(texto)) return { jurisdicao: "SP", alerta: null };
  return { jurisdicao: "BR", alerta: "Jurisdição suposta: federal. Confirme." };
}

// citacao: { tipo, numero, ano, nome } como a IA extraiu (item_norma); textoDoItem: o texto do item do edital, que
// ajuda a ver a jurisdição ("... do Estado de São Paulo (Lei n.º 10.261/68)").
function proporIdentidade(citacao, textoDoItem = "", { anoAtual = new Date().getFullYear() } = {}) {
  const nomeNormalizado = normalizar(citacao.nome || citacao.tipo);
  const doCatalogo = CATALOGO.find((entrada) => entrada.nomes.includes(nomeNormalizado));
  if (doCatalogo && !soDigitos(citacao.numero)) {
    const identidade = { jurisdicao: "BR", tipo: doCatalogo.tipo, numero: doCatalogo.numero, ano: doCatalogo.ano };
    return {
      ...identidade,
      tipo: rotuloDoTipo(doCatalogo.tipo),
      nome: doCatalogo.nome,
      chave: chaveDe(identidade),
      doCatalogo: true,
      alertas: []
    };
  }

  const tipo = tipoCanonico(citacao.tipo || citacao.nome);
  const alertas = [];
  const { ano, alerta: alertaDoAno } = anoCompleto(citacao.ano, anoAtual);
  if (alertaDoAno) alertas.push(alertaDoAno);
  const { jurisdicao, alerta: alertaDaJurisdicao } = jurisdicaoProvavel(tipo, [citacao.tipo, citacao.nome, textoDoItem]);
  if (alertaDaJurisdicao) alertas.push(alertaDaJurisdicao);
  if (!soDigitos(citacao.numero) && !TIPOS_DE_TRIBUNAL.has(tipo)) alertas.push("Sem número no edital. Confirme a identidade da norma.");

  const numero = citacao.numero ? String(citacao.numero).replace(/\s+/g, "") : null;
  const rotulo = rotuloDoTipo(tipo);
  const nome = citacao.nome || [rotulo, numero && `nº ${numero}`, ano && `/${ano}`].filter(Boolean).join(" ").replace(" /", "/");
  return { jurisdicao, tipo: rotulo, numero, ano, nome, chave: chaveDe({ jurisdicao, tipo, numero, ano }), doCatalogo: false, alertas };
}

module.exports = { proporIdentidade, chaveDe, tipoCanonico, normalizar, CATALOGO };
