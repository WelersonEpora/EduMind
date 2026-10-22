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

// Árvore do conteúdo programático em lista, na ordem de leitura, com as normas de cada item.
export async function buscarConteudo(id) {
  const resposta = await http.get(`/api/v1/editais/${id}/conteudo`)
  return resposta.data.data
}

// Dispara a extração com IA e volta na hora com o edital em "extraindo"; a tela acompanha pelo status.
// Com revisão já feita, o backend responde 409 (codigo "revisao_sera_perdida"); a tela confirma e manda de novo com
// confirmarPerdaDaRevisao.
export async function iniciarExtracao(id, { confirmarPerdaDaRevisao = false } = {}) {
  const resposta = await http.post(`/api/v1/editais/${id}/extracao`, { confirmarPerdaDaRevisao })
  return resposta.data.data
}

// Revisão (etapa 1c). Cada chamada devolve o que mudou: os metadados inteiros ou o item com as normas.
export async function revisarMetadado(id, caminho, alteracoes) {
  const resposta = await http.patch(`/api/v1/editais/${id}/metadados`, { caminho, ...alteracoes })
  return resposta.data.data
}

export async function revisarItem(id, itemId, alteracoes) {
  const resposta = await http.patch(`/api/v1/editais/${id}/itens/${itemId}`, alteracoes)
  return resposta.data.data
}

export async function revisarNorma(id, normaId, alteracoes) {
  const resposta = await http.patch(`/api/v1/editais/${id}/normas/${normaId}`, alteracoes)
  return resposta.data.data
}

export async function aprovarVerificados(id, disciplinaId) {
  const resposta = await http.post(`/api/v1/editais/${id}/itens/${disciplinaId}/aprovar-verificados`)
  return resposta.data.data
}

export function urlDoArquivo(id) {
  return `/api/v1/editais/${id}/arquivo`
}
