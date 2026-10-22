// Exibição das normas citadas num item do edital (visão geral e revisão).

// "Código Penal", "Estatuto dos Funcionários... (Lei nº 10.261/68)", "Lei nº 9.099/1995".
export function nomeDaNorma(norma) {
  const numero = norma.numero ? `nº ${norma.numero}${norma.ano ? `/${norma.ano}` : ''}` : ''
  const especie = [norma.tipo, numero].filter(Boolean).join(' ')
  if (norma.nome) return numero ? `${norma.nome} (${especie})` : norma.nome
  return especie || 'Norma sem identificação'
}

// O que o parser fez com o trecho dos artigos, em poucas palavras.
export function resumoDosArtigos(norma) {
  if (!norma.artigos_texto) return 'norma inteira'
  const quantidade = norma.artigos?.artigos?.length ?? 0
  return quantidade === 1 ? '1 artigo' : `${quantidade} artigos`
}

// A citação tem algo para o orientador conferir: trecho dos artigos que não está no edital ou partes que não são
// artigos (título, capítulo, seção).
export function pendenciasDaNorma(norma) {
  const pendencias = []
  if (norma.artigos_texto && !norma.artigos_texto_verificado) pendencias.push('trecho dos artigos não achado no edital')
  if (norma.artigos?.avisos?.length) pendencias.push('cita partes que não são artigos (título, capítulo, seção): conferir')
  return pendencias
}
