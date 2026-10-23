import http from './http'

// Provas anteriores (etapa 3a): a biblioteca compartilhada e a área de provas de cada edital.
// Ler um PDF de prova (dezenas de páginas) leva alguns segundos: timeout maior que o padrão.
const TIMEOUT_UPLOAD_MS = 120000

function formulario(arquivo, campos) {
  const formData = new FormData()
  formData.append('arquivo', arquivo)
  for (const [nome, valor] of Object.entries(campos)) {
    if (valor !== null && valor !== undefined && String(valor).trim() !== '') formData.append(nome, valor)
  }
  return formData
}

// Buscas sugeridas, provas escolhidas para o edital e as demais da biblioteca.
export async function buscarProvasDoEdital(editalId) {
  const resposta = await http.get(`/api/v1/editais/${editalId}/provas`)
  return resposta.data.data
}

export async function escolherProva(editalId, provaId) {
  const resposta = await http.put(`/api/v1/editais/${editalId}/provas/${provaId}`)
  return resposta.data.data
}

export async function desfazerEscolhaDaProva(editalId, provaId) {
  const resposta = await http.delete(`/api/v1/editais/${editalId}/provas/${provaId}`)
  return resposta.data.data
}

// campos: banca, orgao, cargo, ano, origem_url, observacoes, edital_id.
export async function enviarProva(arquivo, campos) {
  const resposta = await http.post('/api/v1/provas', formulario(arquivo, campos), { timeout: TIMEOUT_UPLOAD_MS })
  return { prova: resposta.data.data, jaExistia: resposta.data.jaExistia }
}

// campos: gabarito_situacao, origem_url.
export async function enviarGabarito(provaId, arquivo, campos) {
  const resposta = await http.post(`/api/v1/provas/${provaId}/gabarito`, formulario(arquivo, campos), { timeout: TIMEOUT_UPLOAD_MS })
  return resposta.data.data
}

export async function atualizarProva(provaId, campos) {
  const resposta = await http.patch(`/api/v1/provas/${provaId}`, campos)
  return resposta.data.data
}

export async function excluirProva(provaId) {
  const resposta = await http.delete(`/api/v1/provas/${provaId}`)
  return resposta.data.data
}

export function urlDoArquivoDaProva(provaId, tipo) {
  return `/api/v1/provas/${provaId}/arquivos/${tipo}`
}

// Leitura das questões (etapa 3b): em segundo plano; a tela acompanha pelo leitura_status da prova.
// Com questões já revisadas, o backend responde 409 (codigo "revisao_sera_perdida") e a tela pede confirmação.
export async function lerQuestoes(provaId, { confirmarPerdaDaRevisao = false } = {}) {
  const resposta = await http.post(`/api/v1/provas/${provaId}/leitura`, { confirmarPerdaDaRevisao })
  return resposta.data.data
}

export async function buscarQuestoes(provaId) {
  const resposta = await http.get(`/api/v1/provas/${provaId}/questoes`)
  return resposta.data.data
}

export async function revisarQuestao(provaId, questaoId, alteracoes) {
  const resposta = await http.patch(`/api/v1/provas/${provaId}/questoes/${questaoId}`, alteracoes)
  return resposta.data.data
}

// Classificação das questões por norma e artigo (etapa 3c): em segundo plano, como a leitura.
export async function classificarQuestoes(provaId) {
  const resposta = await http.post(`/api/v1/provas/${provaId}/classificacao`)
  return resposta.data.data
}

// alteracoes: { referencias: [{ norma_id, artigo, papel }] } e/ou { classificacao_status }.
export async function revisarClassificacao(provaId, questaoId, alteracoes) {
  const resposta = await http.patch(`/api/v1/provas/${provaId}/questoes/${questaoId}/classificacao`, alteracoes)
  return resposta.data.data
}

// O orientador confere o gabarito inteiro (o lido da imagem): [{ numero, resposta: 'A'..'E' | 'ANULADA' | null }].
// Devolve a prova e as questões, como buscarQuestoes.
export async function conferirGabarito(provaId, respostas) {
  const resposta = await http.put(`/api/v1/provas/${provaId}/gabarito/conferencia`, { respostas })
  return resposta.data.data
}

// Gabarito com várias versões: o orientador escolhe a do caderno (índice). Devolve a prova e as questões.
export async function escolherVersaoDoGabarito(provaId, versao) {
  const resposta = await http.put(`/api/v1/provas/${provaId}/gabarito/versao`, { versao })
  return resposta.data.data
}
