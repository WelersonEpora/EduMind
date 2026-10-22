import http from './http'

// Ler um edital grande (dezenas de páginas) leva alguns segundos: timeout maior que o padrão.
const TIMEOUT_UPLOAD_MS = 120000

export async function listarEditais() {
  const resposta = await http.get('/api/v1/editais')
  return resposta.data.data
}

export async function buscarEdital(id) {
  const resposta = await http.get(`/api/v1/editais/${id}`)
  return resposta.data.data
}

export async function buscarPagina(id, numero) {
  const resposta = await http.get(`/api/v1/editais/${id}/paginas/${numero}`)
  return resposta.data.data
}

export async function enviarEdital(arquivo) {
  const formData = new FormData()
  formData.append('arquivo', arquivo)
  const resposta = await http.post('/api/v1/editais', formData, { timeout: TIMEOUT_UPLOAD_MS })
  return { edital: resposta.data.data, jaExistia: resposta.data.jaExistia }
}

// Dispara a extração com IA e volta na hora com o edital em "extraindo"; a tela acompanha pelo status.
export async function iniciarExtracao(id) {
  const resposta = await http.post(`/api/v1/editais/${id}/extracao`)
  return resposta.data.data
}

export function urlDoArquivo(id) {
  return `/api/v1/editais/${id}/arquivo`
}
