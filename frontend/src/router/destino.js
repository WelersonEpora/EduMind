// Para onde voltar depois do login: só caminhos internos ("/editais/..."), nunca outro site ("//exemplo.com").
export function destinoSeguro(voltar) {
  return typeof voltar === 'string' && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/'
}
