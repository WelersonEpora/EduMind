import { ref } from 'vue'
import { listarEditais } from '../services/editais.service'

// Lista de editais da equipe, compartilhada entre o menu lateral (contador), a tela de editais e a casca do edital (nome).
// Singleton de módulo: recarregar em um lugar atualiza todos.
const editais = ref([])
const carregando = ref(false)
const erro = ref(null)

async function recarregar() {
  carregando.value = true
  erro.value = null
  try {
    editais.value = await listarEditais()
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

export function useEditais() {
  return { editais, carregando, erro, recarregar }
}

// Nome curto para menus e títulos: "TJSP · Escrevente Técnico Judiciário". Antes da extração com IA
// (etapa 1b) só existe o nome do arquivo.
export function nomeDoEdital(edital) {
  if (edital.orgao || edital.cargo) return [edital.orgao, edital.cargo].filter(Boolean).join(' · ')
  return edital.arquivo_nome.replace(/\.pdf$/i, '')
}
