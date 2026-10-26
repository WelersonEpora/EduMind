import http from './http'

// Desempenho no simulador (etapa 5c): o do próprio usuário, o treino com o caderno de erros dele e, para o orientador e
// o professor, os alunos do edital e o desempenho de cada um.

export async function buscarMeuDesempenho(editalId) {
  return (await http.get(`/api/v1/editais/${editalId}/simulador/desempenho`)).data.data
}

// As questões do caderno de erros, embaralhadas e sem o gabarito (como num treino).
export async function treinarCadernoDeErros(editalId) {
  return (await http.post(`/api/v1/editais/${editalId}/simulador/caderno`)).data.data
}

export async function buscarAlunosDoEdital(editalId) {
  return (await http.get(`/api/v1/editais/${editalId}/alunos`)).data.data
}

export async function buscarDesempenhoDoAluno(editalId, alunoId) {
  return (await http.get(`/api/v1/editais/${editalId}/alunos/${alunoId}`)).data.data
}
