import axios from 'axios'

const http = axios.create({ timeout: 20000 })

// A mensagem de erro do backend ({ error: { message } }) vira a mensagem do erro, para as telas
// mostrarem direto no toast.
http.interceptors.response.use(
  (resposta) => resposta,
  (erro) => {
    const mensagem = erro.response?.data?.error?.message
    if (mensagem) erro.message = mensagem
    else if (!erro.response) erro.message = 'O backend não respondeu. Ele está rodando na porta 3000?'
    return Promise.reject(erro)
  }
)

export default http
