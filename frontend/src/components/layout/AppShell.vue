<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Select from 'primevue/select'
import { useEditais, nomeDoEdital } from '../../composables/useEditais'
import { version } from '../../../package.json'

// Topbar + menu lateral, no padrão do AgroMind (DashboardShell.vue): menu claro, item ativo em
// verde-claro, recolhível no desktop e gaveta no celular. O grupo "Edital" funciona como o grupo
// "Espaços" do FinMind: um seletor do edital ativo e, abaixo, o que existe dentro dele.

const CHAVE_RECOLHIDO = 'edumind-menu-recolhido'
const CHAVE_EDITAL_ATIVO = 'edumind-edital-ativo'

const route = useRoute()
const router = useRouter()
const { editais, recarregar } = useEditais()

const recolhido = ref(lerPreferencia(CHAVE_RECOLHIDO) === '1')
const gavetaAberta = ref(false)
const editalAtivoId = ref(lerPreferencia(CHAVE_EDITAL_ATIVO))

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

// Abrir um edital pela URL também o torna o edital ativo do menu.
watch(
  () => route.params.id,
  (id) => {
    if (id) {
      editalAtivoId.value = id
      salvarPreferencia(CHAVE_EDITAL_ATIVO, id)
    }
  },
  { immediate: true }
)

const opcoesDeEdital = computed(() => editais.value.map((e) => ({ id: e.id, nome: nomeDoEdital(e) })))
const editalAtivo = computed(() => editais.value.find((e) => e.id === editalAtivoId.value) || null)

function trocarEdital(id) {
  fecharGaveta()
  router.push({ name: 'edital', params: { id } })
}

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

// Itens do edital ainda não implementados aparecem desativados, com a etapa em que chegam.
const itensDoEdital = computed(() => [
  { rotulo: 'Visão geral', icone: 'pi-file', rota: 'edital', para: editalAtivo.value && { name: 'edital', params: { id: editalAtivo.value.id } } },
  { rotulo: 'Revisão', icone: 'pi-check-square', rota: 'revisao', para: editalAtivo.value && { name: 'revisao', params: { id: editalAtivo.value.id } } },
  { rotulo: 'Fontes', icone: 'pi-globe', etapa: '2a' },
  { rotulo: 'Cobertura', icone: 'pi-chart-bar', etapa: '2c' }
])

onMounted(recarregar)
</script>

<template>
  <div class="shell" :class="{ 'shell--recolhido': recolhido }">
    <header class="shell__topbar">
      <button class="shell__menu" type="button" aria-label="Abrir ou recolher o menu" @click="alternarMenu">
        <i class="pi pi-bars"></i>
      </button>
      <router-link to="/editais" class="shell__marca">Edu<b>Mind</b><small>apoio ao orientador</small></router-link>
      <span v-if="['edital', 'revisao'].includes(route.name) && editalAtivo" class="shell__contexto">
        Edital ativo: <strong>{{ nomeDoEdital(editalAtivo) }}</strong>
      </span>
    </header>

    <div class="shell__fundo-gaveta" :class="{ 'shell__fundo-gaveta--visivel': gavetaAberta }" @click="fecharGaveta"></div>

    <nav class="shell__sidebar" :class="{ 'shell__sidebar--aberta': gavetaAberta }" aria-label="Menu">
      <router-link to="/editais" class="shell__item" :class="{ 'shell__item--ativo': route.name === 'editais' }" title="Editais" @click="fecharGaveta">
        <i class="pi pi-folder-open"></i><span class="shell__rotulo">Editais</span>
        <span v-if="editais.length" class="shell__contador">{{ editais.length }}</span>
      </router-link>
      <span class="shell__item shell__item--desativado" title="Biblioteca de normas · etapa 2">
        <i class="pi pi-book"></i><span class="shell__rotulo">Biblioteca de normas</span><em class="shell__etapa">etapa 2</em>
      </span>

      <div class="shell__grupo"><span class="shell__rotulo">Edital</span></div>
      <div v-if="opcoesDeEdital.length" class="shell__seletor">
        <Select
          :model-value="editalAtivoId"
          :options="opcoesDeEdital"
          option-label="nome"
          option-value="id"
          placeholder="Escolha um edital"
          class="w-full"
          aria-label="Edital ativo"
          @update:model-value="trocarEdital"
        />
      </div>
      <p v-else class="shell__vazio shell__rotulo">Nenhum edital enviado ainda.</p>
      <template v-for="item in itensDoEdital" :key="item.rotulo">
        <router-link
          v-if="item.para"
          :to="item.para"
          class="shell__item"
          :class="{ 'shell__item--ativo': route.name === item.rota }"
          :title="item.rotulo"
          @click="fecharGaveta"
        >
          <i class="pi" :class="item.icone"></i><span class="shell__rotulo">{{ item.rotulo }}</span>
        </router-link>
        <span v-else class="shell__item shell__item--desativado" :title="`${item.rotulo} · etapa ${item.etapa || '1b'}`">
          <i class="pi" :class="item.icone"></i><span class="shell__rotulo">{{ item.rotulo }}</span>
          <em class="shell__etapa">{{ item.etapa ? `etapa ${item.etapa}` : 'escolha um edital' }}</em>
        </span>
      </template>

      <div class="shell__grupo"><span class="shell__rotulo">Próximas etapas</span></div>
      <span class="shell__item shell__item--desativado" title="Fora do escopo do MVP">
        <i class="pi pi-users"></i><span class="shell__rotulo">Alunos</span><em class="shell__etapa">depois</em>
      </span>
      <span class="shell__item shell__item--desativado" title="Fora do escopo do MVP">
        <i class="pi pi-list-check"></i><span class="shell__rotulo">Provas e questões</span><em class="shell__etapa">depois</em>
      </span>

      <div class="shell__rodape"><span class="shell__rotulo">EduMind v{{ version }}</span></div>
    </nav>

    <main class="shell__conteudo">
      <div class="shell__largura" :class="{ 'shell__largura--total': route.meta.larguraTotal }">
        <slot />
      </div>
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
.shell__contexto {
  margin-left: auto;
  font-size: 0.82rem;
  color: var(--muted-foreground);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shell__contexto strong {
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
.shell__seletor {
  padding: 0 0 0.25rem;
}
.shell__seletor :deep(.p-select) {
  width: 100%;
  font-size: 0.82rem;
}
.shell__vazio {
  margin: 0 0.75rem 0.25rem;
  font-size: 0.8rem;
  color: var(--muted-foreground);
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
.shell__largura {
  max-width: 1240px;
}
.shell__largura--total {
  max-width: none;
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
  .shell--recolhido .shell__contador,
  .shell--recolhido .shell__seletor {
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
  .shell__marca small {
    display: none;
  }
}
</style>
