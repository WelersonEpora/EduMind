export function formatarDataHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatarBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

// Situação da extração com IA, e a cor da Tag do PrimeVue.
export const STATUS_EDITAL = {
  texto_extraido: { rotulo: 'aguardando extração', severidade: 'secondary' },
  extraindo: { rotulo: 'extraindo conteúdo', severidade: 'info' },
  extraido: { rotulo: 'extraído', severidade: 'info' },
  erro_extracao: { rotulo: 'erro na extração', severidade: 'danger' }
}

// Situação do edital como o orientador entende: depois da extração, o andamento calculado pelo backend (andamento.js)
// diz em que etapa ele está e quantas pendências tem.
export function situacaoDoEdital(edital) {
  const andamento = edital.andamento
  if (!andamento) return STATUS_EDITAL[edital.status]
  if (andamento.etapa === 'revisao') return { rotulo: `em revisão · ${andamento.revisao_pendentes} pendentes`, severidade: 'warn' }
  if (andamento.etapa === 'fontes') {
    const n = andamento.fontes_pendentes
    return { rotulo: `fontes pendentes · ${n} ${n === 1 ? 'norma' : 'normas'}`, severidade: 'warn' }
  }
  return { rotulo: 'cobertura pronta', severidade: 'success' }
}
