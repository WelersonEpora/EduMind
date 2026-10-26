import { computed, ref, watch } from 'vue'
import { buscarPerfil, entrar as entrarNaApi, sair as sairNaApi } from '../services/auth.service'
import { definirEquipeDasChamadas } from '../services/http'

// Sessão do usuário (etapa 4a). Singleton de módulo, como useEditais: o menu, o roteador e as telas veem o mesmo estado.
// A equipe escolhida fica guardada no navegador; se ela não for mais do usuário, vale a primeira da lista.

const CHAVE_EQUIPE = 'edumind-equipe'

const usuario = ref(null)
const carregado = ref(false)
const equipeId = ref(lerEquipeGuardada())

function lerEquipeGuardada() {
  try {
    return localStorage.getItem(CHAVE_EQUIPE)
  } catch {
    return null
  }
}

const equipes = computed(() => usuario.value?.equipes || [])
const equipeAtual = computed(() => equipes.value.find((e) => e.id === equipeId.value) || null)

watch(
  equipeId,
  (id) => {
    definirEquipeDasChamadas(id)
    try {
      if (id) localStorage.setItem(CHAVE_EQUIPE, id)
    } catch {
      // Sem armazenamento local (janela privada): a escolha só dura até recarregar.
    }
  },
  { immediate: true }
)

function assumir(perfil) {
  usuario.value = perfil
  carregado.value = true
  const lista = perfil?.equipes || []
  if (!lista.some((e) => e.id === equipeId.value)) equipeId.value = lista[0]?.id || null
}

async function carregar() {
  assumir(await buscarPerfil())
}

async function entrar(email, senha) {
  assumir(await entrarNaApi(email, senha))
}

async function sair() {
  try {
    await sairNaApi()
  } finally {
    esquecer()
  }
}

// A sessão acabou (logout ou 401): a tela volta para o login.
function esquecer() {
  usuario.value = null
}

function trocarEquipe(id) {
  if (equipes.value.some((e) => e.id === id)) equipeId.value = id
}

export function useSessao() {
  return { usuario, carregado, equipes, equipeAtual, carregar, entrar, sair, esquecer, trocarEquipe }
}

// Como o papel aparece na tela.
export const NOMES_DOS_PAPEIS = { orientador: 'Orientador', professor: 'Professor', aluno: 'Aluno' }
