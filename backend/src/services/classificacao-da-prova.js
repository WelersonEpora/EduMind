"use strict";

const { AppError } = require("../shared/errors");

// Classificação das questões (etapa 3c): o esquema da resposta da IA e a conferência por código de cada referência
// (norma da biblioteca, artigo existente no texto, revogado, alterado depois da prova).

const TEXTO_NULO = { type: "STRING", nullable: true };
const ESQUEMA_CLASSIFICACAO = {
  type: "OBJECT",
  properties: {
    questoes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          numero: { type: "INTEGER" },
          juridica: { type: "BOOLEAN" },
          referencias: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                norma: TEXTO_NULO,
                norma_citada: { type: "STRING" },
                artigo: { type: "STRING" },
                papel: { type: "STRING", enum: ["principal", "relacionado"] }
              },
              required: ["norma", "norma_citada", "artigo", "papel"]
            }
          }
        },
        required: ["numero", "juridica", "referencias"]
      }
    }
  },
  required: ["questoes"]
};

const MAXIMO_RELACIONADOS = 3;

// "art. 7º" -> "7"; "1.072" -> "1072"; "313-a" -> "313-A"; "ADCT 8º" -> "ADCT 8".
function normalizarArtigo(texto) {
  let artigo = String(texto ?? "")
    .trim()
    .replace(/^art(igo)?s?\.?\s*/i, "")
    .replace(/[º°]/g, "")
    .replace(/(\d)o\b/gi, "$1");
  const adct = /^adct\s*/i.test(artigo);
  artigo = artigo.replace(/^adct\s*/i, "");
  artigo = artigo.replace(/(\d)\.(\d{3})/g, "$1$2").replace(/\s*[-–—]\s*/g, "-").toUpperCase().trim();
  if (!/^\d+(-[A-Z]){0,2}$/.test(artigo)) return null;
  return adct ? `ADCT ${artigo}` : artigo;
}

// O artigo foi alterado (redação, inclusão, revogação) depois do ano da prova? "depois", "talvez" (mesmo ano) ou null.
function alteradoDepoisDaProva(artigo, anoDaProva) {
  if (!anoDaProva) return null;
  const anos = (artigo.notas || []).filter((n) => n.alteracao && n.data).map((n) => Number(String(n.data.valor).slice(0, 4)));
  if (anos.some((ano) => ano > anoDaProva)) return "depois";
  if (anos.some((ano) => ano === anoDaProva)) return "talvez";
  return null;
}

// Confere as referências de uma questão. normas: Map chave -> { id, nome, artigos: Map numero -> artigo | null (sem
// texto) }; normasPorId: o mesmo por id. Devolve { referencias (as que ficam gravadas), problemas, normaCitada }.
function conferirReferencias(referencias, { normas, normasPorId, anoDaProva }) {
  const problemas = [];
  const gravadas = [];
  const foraDaBiblioteca = [];
  let principal = false;
  for (const ref of referencias) {
    const norma = ref.norma_id ? normasPorId.get(ref.norma_id) : normas.get(ref.norma);
    const artigo = normalizarArtigo(ref.artigo);
    if (!norma) {
      const nome = String(ref.norma_citada || ref.norma || "norma sem nome").trim();
      if (!foraDaBiblioteca.includes(nome)) foraDaBiblioteca.push(nome);
      continue;
    }
    if (!artigo) {
      problemas.push(`Artigo "${ref.artigo}" (${norma.nome}) em formato não reconhecido.`);
      continue;
    }
    if (gravadas.some((g) => g.norma_id === norma.id && g.artigo === artigo)) continue;
    let papel = ref.papel === "principal" && !principal ? "principal" : "relacionado";
    if (papel === "relacionado" && gravadas.filter((g) => g.papel === "relacionado").length >= MAXIMO_RELACIONADOS) continue;
    if (papel === "principal") principal = true;
    gravadas.push({ norma_id: norma.id, artigo, papel });

    const rotulo = `Art. ${artigo} (${norma.nome})`;
    if (!norma.artigos) {
      problemas.push(`${norma.nome}: ainda sem texto na biblioteca; o art. ${artigo} não foi conferido.`);
      continue;
    }
    const doTexto = norma.artigos.get(artigo);
    if (!doTexto) problemas.push(`${rotulo} não existe no texto da biblioteca.`);
    else {
      if (doTexto.revogado) problemas.push(`${rotulo} está revogado no texto atual.`);
      const alteracao = alteradoDepoisDaProva(doTexto, anoDaProva);
      if (alteracao === "depois") problemas.push(`${rotulo} foi alterado depois da prova (${anoDaProva}): a resposta oficial pode não valer mais.`);
      if (alteracao === "talvez") problemas.push(`${rotulo} foi alterado no ano da prova (${anoDaProva}): confira se a resposta ainda vale.`);
    }
  }
  // Sem principal indicado: o primeiro vira principal.
  if (!principal && gravadas.length > 0) gravadas[0].papel = "principal";
  for (const nome of foraDaBiblioteca) problemas.push(`Norma fora da biblioteca: ${nome}.`);
  return { referencias: gravadas, problemas, normaCitada: foraDaBiblioteca.join("; ") || null };
}

// Resposta da IA -> por número da questão: { classificacao_status, classificacao_problemas, norma_citada, referencias }.
function montarClassificacao(textoDaResposta, numeros, contexto) {
  let resposta;
  try {
    resposta = JSON.parse(textoDaResposta);
  } catch {
    throw new AppError(502, "A IA devolveu a classificação fora do formato JSON esperado.");
  }
  const porNumero = new Map();
  for (const item of Array.isArray(resposta.questoes) ? resposta.questoes : []) {
    if (Number.isInteger(item?.numero) && numeros.includes(item.numero) && !porNumero.has(item.numero)) porNumero.set(item.numero, item);
  }

  const resultado = new Map();
  for (const numero of numeros) {
    const item = porNumero.get(numero);
    if (!item) {
      resultado.set(numero, { classificacao_status: "a_revisar", classificacao_problemas: ["A IA não classificou esta questão."], norma_citada: null, referencias: [] });
      continue;
    }
    if (item.juridica !== true) {
      resultado.set(numero, { classificacao_status: "nao_juridica", classificacao_problemas: [], norma_citada: null, referencias: [] });
      continue;
    }
    const { referencias, problemas, normaCitada } = conferirReferencias(Array.isArray(item.referencias) ? item.referencias : [], contexto);
    if (referencias.length === 0 && problemas.length === 0) problemas.push("Questão de Direito sem artigo indicado.");
    resultado.set(numero, {
      classificacao_status: problemas.length === 0 ? "classificada" : "a_revisar",
      classificacao_problemas: problemas,
      norma_citada: normaCitada,
      referencias
    });
  }
  return resultado;
}

module.exports = { ESQUEMA_CLASSIFICACAO, montarClassificacao, conferirReferencias, normalizarArtigo, alteradoDepoisDaProva };
