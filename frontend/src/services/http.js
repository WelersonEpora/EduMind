import axios from 'axios'

const http = axios.create({ timeout: 20000 })

// Equipe em que o usuário está trabalhando (etapa 4a): vai no cabeçalho X-Equipe-Id de toda chamada. Quem a define é
// a sessão (composables/useSessao.js).
let equipeId = null
let aoExpirar = () => {}

export function definirEquipeDasChamadas(id) {
  equipeId = id
}

// Chamado quando a API responde 401 (sessão ausente ou expirada) fora do login.
export function aoExpirarSessao(funcao) {
  aoExpirar = funcao
}

// Links que o navegador abre sozinho (PDFs) não levam cabeçalho: a equipe vai na URL.
export function comEquipe(url) {
  return equipeId ? `${url}?equipe=${encodeURIComponent(equipeId)}` : url
}

http.interceptors.request.use((config) => {
  if (equipeId) config.headers['X-Equipe-Id'] = equipeId
  return config
})

// A mensagem de erro do backend ({ error: { message } }) vira a mensagem do erro, para as telas
// mostrarem direto no toast.
http.interceptors.response.use(
  (resposta) => resposta,
  (erro) => {
    const mensagem = erro.response?.data?.error?.message
    if (mensagem) erro.message = mensagem
    else if (!erro.response) erro.message = 'O backend não respondeu. Ele está rodando na porta 3000?'
    if (erro.response?.status === 401 && !erro.config?.url?.startsWith('/api/v1/auth/')) aoExpirar()
    return Promise.reject(erro)
  }
)

export default http
