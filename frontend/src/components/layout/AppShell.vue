<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Select from 'primevue/select'
import { useEditais } from '../../composables/useEditais'
import { useSessao, NOMES_DOS_PAPEIS } from '../../composables/useSessao'
import { version } from '../../../package.json'

// Topbar + menu lateral, no padrão do AgroMind (DashboardShell.vue): menu claro, item ativo em
// verde-claro, recolhível no desktop e gaveta no celular. O menu só tem o que é global; o edital se
// escolhe na lista de Editais e as telas dele ficam em abas dentro do próprio edital (EditalLayout).

const CHAVE_RECOLHIDO = 'edumind-menu-recolhido'

const route = useRoute()
const router = useRouter()
const { editais, recarregar } = useEditais()
const { usuario, equipes, equipeAtual, eAluno, trocarEquipe, sair } = useSessao()

const recolhido = ref(lerPreferencia(CHAVE_RECOLHIDO) === '1')
const gavetaAberta = ref(false)

function lerPreferencia(chave) {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

function salvarPreferencia(chave, valor) {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    // Sem armazenamento local (janela privada): a preferência só dura até recarregar.
  }
}

// Dentro de um edital (qualquer aba), o item "Editais" continua marcado.
const emEditais = computed(() => route.path === '/editais' || route.path.startsWith('/editais/'))

function alternarMenu() {
  if (window.matchMedia('(max-width: 767px)').matches) {
    gavetaAberta.value = !gavetaAberta.value
    return
  }
  recolhido.value = !recolhido.value
  salvarPreferencia(CHAVE_RECOLHIDO, recolhido.value ? '1' : '0')
}

function fecharGaveta() {
  gavetaAberta.value = false
}

// A lista de editais é da equipe (etapa 4a): carrega ao entrar e de novo a cada troca de equipe.
watch(
  () => equipeAtual.value?.id,
  (id) => {
    if (id) recarregar()
    else editais.value = []
  },
  { immediate: true }
)

const opcoesDeEquipe = computed(() => equipes.value.map((e) => ({ id: e.id, nome: `${e.nome} · ${NOMES_DOS_PAPEIS[e.papel]}` })))

// O edital aberto é da equipe anterior: a troca leva para a lista de editais da nova.
function escolherEquipe(id) {
  trocarEquipe(id)
  router.push({ name: 'editais' })
}

async function sairDoSistema() {
  await sair()
  router.push({ name: 'entrar' })
}
</script>

<template>
  <div class="shell" :class="{ 'shell--recolhido': recolhido }">
    <header class="shell__topbar">
      <button class="shell__menu" type="button" aria-label="Abrir ou recolher o menu" @click="alternarMenu">
        <i class="pi pi-bars"></i>
      </button>
      <router-link to="/editais" class="shell__marca">Edu<b>Mind</b><small>apoio ao orientador</small></router-link>
      <div class="shell__usuario">
        <Select
          v-if="equipes.length > 1"
          :model-value="equipeAtual?.id"
          :options="opcoesDeEquipe"
          option-label="nome"
          option-value="id"
          aria-label="Equipe"
          class="shell__equipe"
          @update:model-value="escolherEquipe"
        />
        <span v-else-if="equipeAtual" class="shell__equipe-nome" :title="NOMES_DOS_PAPEIS[equipeAtual.papel]">
          <i class="pi pi-users"></i>{{ equipeAtual.nome }}
        </span>
        <router-link :to="{ name: 'conta' }" class="shell__nome" :title="`${usuario?.email} · minha conta`">{{ usuario?.nome }}</router-link>
        <button type="button" class="shell__sair" title="Sair" aria-label="Sair" @click="sairDoSistema">
          <i class="pi pi-sign-out"></i>
        </button>
      </div>
    </header>

    <div class="shell__fundo-gaveta" :class="{ 'shell__fundo-gaveta--visivel': gavetaAberta }" @click="fecharGaveta"></div>

    <nav class="shell__sidebar" :class="{ 'shell__sidebar--aberta': gavetaAberta }" aria-label="Menu">
      <router-link to="/editais" class="shell__item" :class="{ 'shell__item--ativo': emEditais }" title="Editais" @click="fecharGaveta">
        <i class="pi pi-folder-open"></i><span class="shell__rotulo">{{ eAluno ? 'Meus editais' : 'Editais' }}</span>
        <span v-if="editais.length" class="shell__contador">{{ editais.length }}</span>
      </router-link>
      <router-link
        to="/normas"
        class="shell__item"
        :class="{ 'shell__item--ativo': ['normas', 'norma'].includes(route.name) }"
        title="Biblioteca de normas"
        @click="fecharGaveta"
      >
        <i class="pi pi-book"></i><span class="shell__rotulo">Biblioteca de normas</span>
      </router-link>

      <!-- O aluno não vê os membros da equipe (etapa 4c); o grupo só fica para o administrador, se for o caso. -->
      <div v-if="!eAluno || usuario?.admin" class="shell__grupo"><span class="shell__rotulo">Equipe</span></div>
      <router-link
        v-if="equipeAtual && !eAluno"
        to="/equipe"
        class="shell__item"
        :class="{ 'shell__item--ativo': route.name === 'equipe' }"
        title="Membros da equipe"
        @click="fecharGaveta"
      >
        <i class="pi pi-users"></i><span class="shell__rotulo">Membros</span>
      </router-link>
      <router-link
        v-if="usuario?.admin"
        to="/admin/equipes"
        class="shell__item"
        :class="{ 'shell__item--ativo': route.name === 'admin-equipes' }"
        title="Equipes da plataforma"
        @click="fecharGaveta"
      >
        <i class="pi pi-sitemap"></i><span class="shell__rotulo">Equipes da plataforma</span>
      </router-link>

      <template v-if="!eAluno">
        <div class="shell__grupo"><span class="shell__rotulo">Próximas etapas</span></div>
        <span class="shell__item shell__item--desativado" title="Fora do escopo do MVP">
          <i class="pi pi-list-check"></i><span class="shell__rotulo">Provas e questões</span><em class="shell__etapa">depois</em>
        </span>
      </template>

      <div class="shell__rodape"><span class="shell__rotulo">EduMind v{{ version }}</span></div>
    </nav>

    <main class="shell__conteudo">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: 56px 1fr;
  grid-template-areas: 'topbar topbar' 'sidebar conteudo';
  min-height: 100vh;
}

.shell__topbar {
  grid-area: topbar;
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1rem 0 0.75rem;
  background: color-mix(in oklab, var(--background) 85%, transparent);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid var(--border);
}
.shell__menu {
  border: 0;
  background: none;
  padding: 0.45rem;
  border-radius: 8px;
  cursor: pointer;
  color: var(--foreground);
  display: grid;
}
.shell__menu:hover {
  background: var(--secondary);
}
.shell__marca {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.15rem;
  color: var(--foreground);
  text-decoration: none;
  white-space: nowrap;
}
.shell__marca b {
  color: var(--primary);
}
.shell__marca small {
  font-family: var(--font-sans);
  font-weight: 500;
  font-size: 0.75rem;
  color: var(--muted-foreground);
}
.shell__usuario {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
  font-size: 0.82rem;
}
.shell__equipe {
  font-size: 0.82rem;
  max-width: 260px;
}
.shell__equipe-nome {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--muted-foreground);
}
.shell__nome {
  font-weight: 600;
  color: var(--foreground);
  text-decoration: none;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shell__sair {
  border: 0;
  background: none;
  padding: 0.4rem;
  border-radius: 8px;
  cursor: pointer;
  color: var(--muted-foreground);
  display: grid;
}
.shell__sair:hover {
  background: var(--secondary);
  color: var(--foreground);
}

.shell__sidebar {
  grid-area: sidebar;
  width: 236px;
  background: var(--sidebar);
  border-right: 1px solid var(--border);
  padding: 0.85rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: sticky;
  top: 56px;
  align-self: start;
  height: calc(100vh - 56px);
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.18s ease;
}
.shell__item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  color: var(--muted-foreground);
  font-size: 0.86rem;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.shell__item .pi {
  width: 1rem;
  text-align: center;
}
.shell__item:hover:not(.shell__item--desativado) {
  background: color-mix(in oklch, var(--accent) 60%, transparent);
  color: var(--accent-foreground);
}
.shell__item--ativo {
  background: var(--accent);
  color: var(--accent-foreground);
  font-weight: 600;
}
.shell__item--ativo .pi {
  color: var(--primary);
}
.shell__item--desativado {
  opacity: 0.55;
  cursor: default;
}
.shell__etapa {
  margin-left: auto;
  font-style: normal;
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.shell__contador {
  margin-left: auto;
  font-size: 0.7rem;
  background: var(--muted);
  border-radius: 999px;
  padding: 0 0.45rem;
  font-variant-numeric: tabular-nums;
}
.shell__grupo {
  margin: 0.7rem 0.15rem 0.35rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  font-weight: 600;
}
.shell__rodape {
  margin-top: auto;
  padding: 0.6rem 0.75rem 0;
  border-top: 1px solid var(--border);
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.shell__conteudo {
  grid-area: conteudo;
  min-width: 0;
  padding: 1.5rem;
}

.shell__fundo-gaveta {
  display: none;
}

@media (min-width: 768px) {
  .shell--recolhido .shell__sidebar {
    width: 68px;
    padding: 0.85rem 0.5rem;
  }
  .shell--recolhido .shell__rotulo,
  .shell--recolhido .shell__etapa,
  .shell--recolhido .shell__contador {
    display: none;
  }
  .shell--recolhido .shell__grupo {
    margin: 0.5rem 0;
    padding-top: 0.25rem;
  }
  .shell--recolhido .shell__item {
    justify-content: center;
    padding: 0.5rem 0;
  }
}

@media (max-width: 767px) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'topbar' 'conteudo';
  }
  .shell__sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    height: auto;
    width: 82%;
    max-width: 300px;
    z-index: 45;
    transform: translateX(-100%);
    transition: transform 0.22s ease;
    box-shadow: 8px 0 24px rgba(10, 12, 18, 0.18);
  }
  .shell__sidebar--aberta {
    transform: none;
  }
  .shell__fundo-gaveta {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(10, 12, 18, 0.45);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    z-index: 40;
  }
  .shell__fundo-gaveta--visivel {
    opacity: 1;
    pointer-events: auto;
  }
  .shell__conteudo {
    padding: 1rem;
  }
  .shell__marca small,
  .shell__nome,
  .shell__equipe-nome {
    display: none;
  }
  .shell__equipe {
    max-width: 150px;
  }
}
</style>
