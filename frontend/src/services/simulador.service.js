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
