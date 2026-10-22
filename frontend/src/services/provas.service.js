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
