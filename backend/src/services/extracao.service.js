"use strict";

const { Op } = require("sequelize");
const gemini = require("../ai/gemini.provider");
const { carregarPrompt } = require("../ai/carregar-prompt");
const { AppError } = require("../shared/errors");
const { eUuid } = require("../shared/uuid");
const { dataValida } = require("../shared/datas");
const logger = require("../shared/logger");
const { verificarTrecho } = require("./verificar-trecho");
const { ESQUEMA_ARVORE, montarArvore } = require("./arvore-do-edital");
const { contarRevisados } = require("./revisao.service");

// Extração do edital com a IA, em duas chamadas: os metadados (etapa 1b-1, ESQUEMA_RESPOSTA) e a árvore do conteúdo
// programático com as normas citadas (etapa 1b-2, arvore-do-edital.js). A IA lê o texto já extraído de cada página (o
// mesmo em que a conferência busca os trechos), e o código confere cada trecho na página citada.
//
// As duas chamadas rodam em paralelo e só com a chave paga (decisão do orientador em 2026-10-22: a gratuita, sob
// "alta demanda", segurava cada chamada 240 s antes de a paga entrar, e a extração do TJSP levava mais de 10 min).
// E com raciocínio "low" (decisão do orientador em 2026-10-27: com o padrão do modelo, a árvore de um edital de 35
// páginas passou dos 420 s da janela).
//
// As chamadas ao Gemini podem levar minutos: `iniciar` marca o edital como "extraindo" e devolve na hora; a extração
// segue em segundo plano e grava "extraido" ou "erro_extracao". A tela acompanha pelo status do edital. O resultado
// só é gravado se as duas chamadas derem certo; refazer a extração substitui os metadados e a árvore inteira.

const PROMPT_METADADOS = "edital-metadados.md";
const PROMPT_ARVORE = "edital-arvore.md";

// Subconjunto OpenAPI aceito pelo Gemini em generationConfig.responseSchema.
const TRECHO = { pagina: { type: "INTEGER" }, source_excerpt: { type: "STRING" } };
const CAMPO = {
  type: "OBJECT",
  nullable: true,
  properties: { valor: { type: "STRING" }, ...TRECHO },
  required: ["valor", "pagina", "source_excerpt"]
};
const DESCRICAO = {
  type: "OBJECT",
  properties: { descricao: { type: "STRING" }, ...TRECHO },
  required: ["descricao", "pagina", "source_excerpt"]
};
const ESQUEMA_RESPOSTA = {
  type: "OBJECT",
  properties: {
    banca: CAMPO,
    orgao: CAMPO,
    cargo: CAMPO,
    data_publicacao: CAMPO,
    blocos: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          nome: { type: "STRING" },
          ...TRECHO,
          disciplinas: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { nome: { type: "STRING" }, questoes: { type: "INTEGER", nullable: true }, ...TRECHO },
              required: ["nome", "questoes", "pagina", "source_excerpt"]
            }
          }
        },
        required: ["nome", "pagina", "source_excerpt", "disciplinas"]
      }
    },
    regras_de_corte: { type: "ARRAY", items: DESCRICAO },
    discursiva: { ...DESCRICAO, nullable: true }
  },
  required: ["banca", "orgao", "cargo", "data_publicacao", "blocos", "regras_de_corte", "discursiva"]
};

function textoComMarcasDePagina(paginas) {
  return paginas.map((p) => `<<<PÁGINA ${p.numero}>>>\n${p.texto}\n<<<FIM DA PÁGINA ${p.numero}>>>`).join("\n\n");
}

function lista(valor) {
  return Array.isArray(valor) ? valor : [];
}

// Lê o JSON da IA e acrescenta a cada item o resultado da conferência do trecho. Campos fora do esquema são
// descartados; o que falta vira null ou lista vazia.
function montarMetadados(textoDaResposta, paginas) {
  let resposta;
  try {
    resposta = JSON.parse(textoDaResposta);
  } catch {
    throw new AppError(502, "A IA devolveu uma resposta que não é JSON válido. Tente extrair de novo.");
  }
  if (!resposta || typeof resposta !== "object" || Array.isArray(resposta)) {
    throw new AppError(502, "A IA devolveu uma resposta fora do formato esperado. Tente extrair de novo.");
  }

  const conferir = (item) => ({
    pagina: Number.isInteger(item.pagina) ? item.pagina : null,
    source_excerpt: typeof item.source_excerpt === "string" ? item.source_excerpt : "",
    ...verificarTrecho(paginas, item)
  });
  const campo = (item) => (item && typeof item === "object" ? { valor: String(item.valor ?? ""), ...conferir(item) } : null);
  const descricao = (item) => ({ descricao: String(item?.descricao ?? ""), ...conferir(item ?? {}) });

  const avisos = [];
  const metadados = {
    campos: {
      banca: campo(resposta.banca),
      orgao: campo(resposta.orgao),
      cargo: campo(resposta.cargo),
      data_publicacao: campo(resposta.data_publicacao)
    },
    blocos: lista(resposta.blocos).map((bloco) => ({
      nome: String(bloco?.nome ?? ""),
      ...conferir(bloco ?? {}),
      disciplinas: lista(bloco?.disciplinas).map((disciplina) => ({
        nome: String(disciplina?.nome ?? ""),
        questoes: Number.isInteger(disciplina?.questoes) ? disciplina.questoes : null,
        ...conferir(disciplina ?? {})
      }))
    })),
    regras_de_corte: lista(resposta.regras_de_corte).map(descricao),
    discursiva: resposta.discursiva && typeof resposta.discursiva === "object" ? descricao(resposta.discursiva) : null,
    avisos
  };

  const data = metadados.campos.data_publicacao;
  if (data && !dataValida(data.valor)) {
    avisos.push(`A data de publicação veio como "${data.valor}", que não é uma data no formato AAAA-MM-DD.`);
  }
  return metadados;
}

function criarExtracaoService({ sequelize, gerarJson = gemini.gerarJson, agora = () => new Date() }) {
  const { Edital, EditalPagina, EditalItem, ItemNorma } = sequelize.models;
  // As gravações do fim da extração só valem se o edital ainda está "extraindo": se ela foi dada como interrompida
  // (marcarInterrompidas), o resultado que chegar depois não passa por cima.
  const aindaExtraindo = (id) => ({ where: { id, status: "extraindo" } });

  // Uma chamada ao Gemini com um dos prompts: a resposta e o registro da chamada (gravado em metadados.extracao).
  async function chamarIa(arquivoDoPrompt, textoDoEdital, responseSchema) {
    const { versao, instrucaoDoSistema, prompt } = carregarPrompt(arquivoDoPrompt, { texto_do_edital: textoDoEdital });
    const resposta = await gerarJson({ systemInstruction: instrucaoDoSistema, prompt, responseSchema, somentePaga: true, raciocinio: "low" });
    return { texto: resposta.texto, registro: { prompt: versao, modelo: resposta.modelo, chave: resposta.chave, tokens: resposta.tokens } };
  }

  async function executar(id) {
    try {
      const paginas = await EditalPagina.findAll({
        where: { edital_id: id },
        attributes: ["numero", "texto"],
        order: [["numero", "ASC"]],
        raw: true
      });
      const textoDoEdital = textoComMarcasDePagina(paginas);

      const [chamadaMetadados, chamadaArvore] = await Promise.all([
        chamarIa(PROMPT_METADADOS, textoDoEdital, ESQUEMA_RESPOSTA),
        chamarIa(PROMPT_ARVORE, textoDoEdital, ESQUEMA_ARVORE)
      ]);
      const metadados = montarMetadados(chamadaMetadados.texto, paginas);
      const { itens, normas } = montarArvore(chamadaArvore.texto, paginas);

      metadados.extracao = {
        concluida_em: agora().toISOString(),
        chamadas: [chamadaMetadados.registro, chamadaArvore.registro]
      };
      const { banca, orgao, cargo, data_publicacao: data } = metadados.campos;
      const gravou = await sequelize.transaction(async (transaction) => {
        const [alterados] = await Edital.update(
          {
            banca: banca?.valor || null,
            orgao: orgao?.valor || null,
            cargo: cargo?.valor || null,
            data_publicacao: data && dataValida(data.valor) ? data.valor : null,
            metadados,
            status: "extraido",
            erro: null
          },
          { ...aindaExtraindo(id), transaction }
        );
        if (alterados === 0) return false;
        await EditalItem.destroy({ where: { edital_id: id }, transaction });
        await EditalItem.bulkCreate(itens.map((item) => ({ ...item, edital_id: id })), { transaction });
        await ItemNorma.bulkCreate(normas, { transaction });
        return true;
      });
      logger.info(
        { editalId: id, gravou, itens: itens.length, normas: normas.length, chamadas: metadados.extracao.chamadas },
        "extração do edital concluída"
      );
    } catch (erro) {
      logger.error({ err: erro, editalId: id }, "extração do edital falhou");
      const mensagem =
        erro instanceof AppError || erro instanceof gemini.ErroDoGemini
          ? erro.message
          : "Erro inesperado na extração. Veja o log do backend.";
      await Edital.update({ status: "erro_extracao", erro: mensagem }, aindaExtraindo(id)).catch((erroAoGravar) =>
        logger.error({ err: erroAoGravar, editalId: id }, "não gravou o erro da extração")
      );
    }
  }

  // Marca o edital como "extraindo" (só se já não estiver) e dispara a extração em segundo plano. `concluida` é a
  // promessa da extração: a rota ignora, os testes esperam.
  //
  // A extração nova substitui metadados e árvore. Se o orientador já revisou algum item, só segue com
  // `confirmarPerdaDaRevisao` (decisão do orientador, 2026-10-22); sem ela, responde 409 com quantos itens seriam
  // perdidos, para a tela pedir a confirmação.
  async function iniciar(id, { confirmarPerdaDaRevisao = false } = {}) {
    if (!eUuid(id)) throw new AppError(404, "Edital não encontrado.");
    const atual = await Edital.findByPk(id, { attributes: ["id", "status", "metadados"] });
    if (atual && atual.status !== "extraindo" && !confirmarPerdaDaRevisao) {
      const revisados = await contarRevisados(sequelize, atual);
      if (revisados > 0) {
        throw new AppError(
          409,
          `${revisados} ${revisados === 1 ? "item já foi revisado" : "itens já foram revisados"}. Extrair de novo substitui tudo e a revisão se perde.`,
          { codigo: "revisao_sera_perdida", revisados }
        );
      }
    }
    const [alterados] = await Edital.update(
      { status: "extraindo", erro: null },
      { where: { id, status: { [Op.ne]: "extraindo" } } }
    );
    if (alterados === 0) {
      if (await Edital.findByPk(id, { attributes: ["id"] })) {
        throw new AppError(409, "A extração deste edital já está em andamento.");
      }
      throw new AppError(404, "Edital não encontrado.");
    }
    return { concluida: executar(id) };
  }

  // Ao subir o servidor: uma extração que estava em andamento quando o processo parou nunca vai terminar.
  async function marcarInterrompidas() {
    const [alterados] = await Edital.update(
      { status: "erro_extracao", erro: "O backend reiniciou durante a extração. Extraia de novo." },
      { where: { status: "extraindo" } }
    );
    return alterados;
  }

  return { iniciar, marcarInterrompidas };
}

module.exports = { criarExtracaoService, montarMetadados, textoComMarcasDePagina, ESQUEMA_RESPOSTA };
