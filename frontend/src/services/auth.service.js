import http from './http'

// Login e sessão (etapa 4a). O cookie da sessão é httpOnly: a tela nunca o lê, só pergunta ao backend quem é.

export async function entrar(email, senha) {
  const resposta = await http.post('/api/v1/auth/login', { email, senha })
  return resposta.data.data
}

export async function sair() {
  await http.post('/api/v1/auth/logout')
}

// O usuário da sessão com as equipes dele, ou null se não houver sessão.
export async function buscarPerfil() {
  try {
    const resposta = await http.get('/api/v1/auth/me')
    return resposta.data.data
  } catch (erro) {
    if (erro.response?.status === 401) return null
    throw erro
  }
}

export async function trocarSenha(atual, nova) {
  await http.put('/api/v1/auth/senha', { atual, nova })
}

// { nome, email, atual } (a senha atual só é pedida quando o e-mail muda) → o perfil atualizado
export async function alterarConta(dados) {
  return (await http.put('/api/v1/auth/conta', dados)).data.data
}
