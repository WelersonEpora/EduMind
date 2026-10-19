export function formatarDataHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatarBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

// Situação do edital como o orientador entende, e a cor da Tag do PrimeVue.
export const STATUS_EDITAL = {
  texto_extraido: { rotulo: 'aguardando extração', severidade: 'secondary' },
  extraindo: { rotulo: 'extraindo conteúdo', severidade: 'info' },
  extraido: { rotulo: 'em revisão', severidade: 'warn' },
  erro_extracao: { rotulo: 'erro na extração', severidade: 'danger' }
}
