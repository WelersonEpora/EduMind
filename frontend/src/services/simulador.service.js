import http from './http'

// Simulador, treino por disciplina (etapa 5a). A correção é no servidor: as questões vêm sem o gabarito.

export async function buscarResumoDoSimulador(editalId) {
  return (await http.get(`/api/v1/editais/${editalId}/simulador`)).data.data
}

// { disciplinas: [ids], quantidade: número ou null (todas) }
export async function iniciarTreino(editalId, { disciplinas, quantidade }) {
  return (await http.post(`/api/v1/editais/${editalId}/simulador/treino`, { disciplinas, quantidade })).data.data
}

// → { acertou, gabarito, artigos: [{ norma, numero, papel, texto, revogado, mudou_depois_da_prova }] }
export async function responderQuestao(editalId, questaoId, resposta) {
  return (await http.post(`/api/v1/editais/${editalId}/simulador/respostas`, { questao_id: questaoId, resposta })).data.data
}

// Prova completa cronometrada (etapa 5b). A prova fica no servidor: as respostas são guardadas a cada clique, sem
// correção, e a entrega devolve a correção de todas.

export async function iniciarProvaCompleta(editalId, provaId) {
  return (await http.post(`/api/v1/editais/${editalId}/simulador/provas`, { prova_id: provaId })).data.data
}

export async function buscarProvaCompleta(editalId, simuladoId) {
  return (await http.get(`/api/v1/editais/${editalId}/simulador/provas/${simuladoId}`)).data.data
}

// { resposta?: "B" | null, marcada?: true | false } → { respostas, marcadas, restante_segundos }
export async function guardarQuestaoDaProva(editalId, simuladoId, questaoId, campos) {
  return (await http.put(`/api/v1/editais/${editalId}/simulador/provas/${simuladoId}/questoes/${questaoId}`, campos)).data.data
}

export async function entregarProvaCompleta(editalId, simuladoId) {
  return (await http.post(`/api/v1/editais/${editalId}/simulador/provas/${simuladoId}/entrega`)).data.data
}

export async function desistirDaProvaCompleta(editalId, simuladoId) {
  return (await http.delete(`/api/v1/editais/${editalId}/simulador/provas/${simuladoId}`)).data.data
}
