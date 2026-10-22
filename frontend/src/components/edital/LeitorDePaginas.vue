<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import { buscarPagina } from '../../services/editais.service'

// Texto de cada página do edital, com a navegação e o trecho citado pela IA marcado. Ao receber um `trecho` (item
// com pagina, source_excerpt, verificado, pagina_encontrada), vai para a página onde ele está.
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
  () => props.editalId,
  () => irPara(1),
  { immediate: true }
)
watch(
  () => props.trecho,
  (item) => {
    if (item) irPara(item.verificado ? item.pagina : (item.pagina_encontrada ?? item.pagina))
  }
)

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Texto da página em partes, com o trecho aberto marcado quando ele está nesta página. A busca ignora diferença de
// espaços e quebras de linha; um trecho que só casa ignorando a hifenização (como a conferência do backend faz)
// aparece no quadro acima do texto, sem marca.
const partesDaPagina = computed(() => {
  const texto = pagina.value?.texto || ''
  const trecho = props.trecho?.source_excerpt?.trim()
  const achado = trecho ? new RegExp(trecho.split(/\s+/).map(escaparRegex).join('\\s+')).exec(texto) : null
  if (!achado) return [{ texto, marcado: false }]
  return [
    { texto: texto.slice(0, achado.index), marcado: false },
    { texto: achado[0], marcado: true },
    { texto: texto.slice(achado.index + achado[0].length), marcado: false }
  ]
})
</script>

<template>
  <section class="painel leitor">
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
      </div>
    </div>
    <div class="painel__corpo">
      <div v-if="trecho" class="trecho-aberto">
        <div>
          <span class="rotulo">Trecho citado pela IA · p. {{ trecho.pagina ?? '?' }}</span>
          <p>“{{ trecho.source_excerpt }}”</p>
        </div>
        <Button icon="pi pi-times" text rounded size="small" aria-label="Fechar trecho" @click="emit('fechar-trecho')" />
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
/* O leitor acompanha a rolagem: o trecho aberto a partir do fim da lista aparece sem rolar de volta. */
.leitor {
  position: sticky;
  top: 1rem;
}
@media (max-width: 1080px) {
  .leitor {
    position: static;
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
.texto-pagina {
  min-height: 420px;
  max-height: 70vh;
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
