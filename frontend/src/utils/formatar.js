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

// Texto de questão lido do PDF, para ler corrido: junta a palavra partida no fim da linha ("in-\nfração") e as quebras
// de linha simples; linha em branco continua separando parágrafos.
export function textoCorrido(texto) {
  return String(texto ?? '')
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    .split(/\n\s*\n/)
    .map((paragrafo) => paragrafo.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

// Duração em minutos para ler: 40 → "40 min"; 168 → "2h48"; 240 → "4h".
export function duracaoLegivel(minutos) {
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto ? `${horas}h${String(resto).padStart(2, '0')}` : `${horas}h`
}

// Relógio da prova: 4325 segundos → "1:12:05"; 300 → "5:00".
export function relogio(segundos) {
  const s = Math.max(0, Math.floor(segundos))
  const horas = Math.floor(s / 3600)
  const minutos = Math.floor((s % 3600) / 60)
  const resto = String(s % 60).padStart(2, '0')
  return horas ? `${horas}:${String(minutos).padStart(2, '0')}:${resto}` : `${minutos}:${resto}`
}
