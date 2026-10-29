<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import { buscarPagina, urlDoArquivo } from '../../services/editais.service'

// Painel lateral com o texto de cada página do edital: só aparece quando alguém clica no selo de um trecho (a tela o
// monta com v-if). Abre na página onde o `trecho` (item com pagina, source_excerpt, verificado, pagina_encontrada)
// está e marca o trecho; clicar em outro selo só troca a página. Fecha no X ou com Esc (fechar-trecho).
const props = defineProps({
  editalId: { type: String, required: true },
  totalPaginas: { type: Number, required: true },
  trecho: { type: Object, default: null }
})
const emit = defineEmits(['fechar-trecho'])

const numeroPagina = ref(1)
const pagina = ref(null)
const carregando = ref(false)
const erro = ref(null)

async function carregarPagina() {
  carregando.value = true
  erro.value = null
  try {
    pagina.value = await buscarPagina(props.editalId, numeroPagina.value)
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

function irPara(numero) {
  numeroPagina.value = Math.min(Math.max(1, numero || 1), props.totalPaginas)
  carregarPagina()
}

watch(
  () => props.trecho,
  (item) => irPara(item ? (item.verificado ? item.pagina : (item.pagina_encontrada ?? item.pagina)) : 1),
  { immediate: true }
)

function aoTeclar(evento) {
  if (evento.key === 'Escape') emit('fechar-trecho')
}
onMounted(() => window.addEventListener('keydown', aoTeclar))
onBeforeUnmount(() => window.removeEventListener('keydown', aoTeclar))

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buscar(texto, trecho, inicio = 0) {
  const regex = new RegExp(trecho.trim().split(/\s+/).map(escaparRegex).join('\\s+'), 'g')
  regex.lastIndex = inicio
  return regex.exec(texto)
}

// Texto da página em partes, com o trecho aberto marcado quando ele está nesta página. A busca ignora diferença de
// espaços e quebras de linha; um trecho que só casa ignorando a hifenização (como a conferência do backend faz)
// aparece no quadro acima do texto, sem marca. Com `ancora` (a citação de uma norma), a busca começa onde a âncora
// está.
const partesDaPagina = computed(() => {
  const texto = pagina.value?.texto || ''
  const trecho = props.trecho?.source_excerpt?.trim()
  const ancora = props.trecho?.ancora?.trim()
  const inicio = ancora && numeroPagina.value === props.trecho.pagina ? (buscar(texto, ancora)?.index ?? 0) : 0
  const achado = trecho ? buscar(texto, trecho, inicio) : null
  if (!achado) return [{ texto, marcado: false }]
  return [
    { texto: texto.slice(0, achado.index), marcado: false },
    { texto: achado[0], marcado: true },
    { texto: texto.slice(achado.index + achado[0].length), marcado: false }
  ]
})
</script>

<template>
  <section class="painel leitor" aria-label="Texto da página">
    <div class="painel__cabecalho">
      <h2>Texto da página</h2>
      <div class="navegacao">
        <Button icon="pi pi-angle-left" text rounded aria-label="Página anterior" :disabled="numeroPagina <= 1" @click="irPara(numeroPagina - 1)" />
        <InputNumber
          :model-value="numeroPagina"
          :min="1"
          :max="totalPaginas"
          input-class="navegacao__numero"
          aria-label="Número da página"
          @update:model-value="irPara"
        />
        <span class="mono">de {{ totalPaginas }}</span>
        <Button
          icon="pi pi-angle-right"
          text
          rounded
          aria-label="Próxima página"
          :disabled="numeroPagina >= totalPaginas"
          @click="irPara(numeroPagina + 1)"
        />
        <!-- #page: o leitor de PDF do navegador abre direto na página que está sendo lida aqui. -->
        <a
          :href="`${urlDoArquivo(editalId)}#page=${numeroPagina}`"
          target="_blank"
          rel="noopener"
          class="ver-pdf"
          title="Abrir esta página no PDF original"
        >
          <i class="pi pi-external-link"></i>ver no PDF
        </a>
        <Button icon="pi pi-times" text rounded size="small" aria-label="Fechar o texto da página" title="Fechar (Esc)" @click="emit('fechar-trecho')" />
      </div>
    </div>
    <div class="painel__corpo">
      <div v-if="trecho" class="trecho-aberto">
        <div>
          <span class="rotulo">{{ trecho.rotulo ?? 'Trecho citado pela IA' }} · p. {{ trecho.pagina ?? '?' }}</span>
          <p>“{{ trecho.source_excerpt }}”</p>
        </div>
      </div>
      <p v-if="erro" class="erro">{{ erro }}</p>
      <div class="documento texto-pagina" :class="{ 'texto-pagina--carregando': carregando }">
        <template v-if="pagina && pagina.texto">
          <template v-for="(parte, i) in partesDaPagina" :key="i">
            <mark v-if="parte.marcado">{{ parte.texto }}</mark>
            <template v-else>{{ parte.texto }}</template>
          </template>
        </template>
        <span v-else-if="pagina" class="pendente">Esta página não tem texto selecionável.</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* O painel acompanha a rolagem: o trecho aberto a partir do fim da lista aparece sem rolar de volta. Abaixo do
   cabeçalho fixo do shell (56px). */
.leitor {
  position: sticky;
  top: calc(56px + 1rem);
  animation: entrar 0.18s ease-out;
}
@keyframes entrar {
  from {
    opacity: 0;
    transform: translateX(16px);
  }
}
/* Sem espaço para duas colunas, o painel cobre a tela. */
@media (max-width: 1080px) {
  .leitor {
    position: fixed;
    inset: 56px 0 0 0;
    z-index: 35;
    border-radius: 0;
    overflow: auto;
    box-shadow: 0 -8px 24px rgba(10, 12, 18, 0.18);
  }
}
.navegacao {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.navegacao :deep(.navegacao__numero) {
  width: 4.5rem;
  text-align: center;
  padding: 0.3rem 0.4rem;
}
.ver-pdf {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: 0.5rem;
  font-size: 0.8rem;
  color: var(--primary);
  text-decoration: none;
  white-space: nowrap;
}
.ver-pdf:hover {
  text-decoration: underline;
}
.ver-pdf .pi {
  font-size: 0.75rem;
}
.texto-pagina {
  min-height: 300px;
  max-height: calc(100vh - 56px - 13rem);
  overflow: auto;
}
.texto-pagina--carregando {
  opacity: 0.5;
}
.pendente {
  color: var(--muted-foreground);
}
.erro {
  margin: 0 0 0.5rem;
  color: var(--negative);
}
.trecho-aberto {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-left: 3px solid var(--mark);
  background: var(--muted);
  border-radius: 0.35rem;
}
.trecho-aberto p {
  margin: 0.2rem 0 0;
  font-family: var(--font-doc);
}
</style>
