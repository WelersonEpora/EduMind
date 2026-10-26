import http from './http'

// A equipe atual e os membros dela; a administração das equipes (etapa 4b-2).

export async function buscarEquipe() {
  return (await http.get('/api/v1/equipe')).data.data
}

export async function renomearEquipe(nome) {
  return (await http.patch('/api/v1/equipe', { nome })).data.data
}

// { nome, email, senha, papel } → { data: membro, contaJaExistia }
export async function incluirMembro(dados) {
  return (await http.post('/api/v1/equipe/membros', dados)).data
}

// { papel } e/ou { ativo }
export async function alterarMembro(membroId, alteracoes) {
  return (await http.patch(`/api/v1/equipe/membros/${membroId}`, alteracoes)).data.data
}

export async function listarEquipesDaPlataforma() {
  return (await http.get('/api/v1/admin/equipes')).data.data
}

// { nome, orientador: { nome, email, senha } } → { data: equipe, contaJaExistia }
export async function criarEquipeNaPlataforma(dados) {
  return (await http.post('/api/v1/admin/equipes', dados)).data
}

// Os editais da equipe que o aluno vê (etapa 4c). A lista substitui a anterior.
export async function atribuirEditais(membroId, editais) {
  return (await http.put(`/api/v1/equipe/membros/${membroId}/editais`, { editais })).data.data
}
