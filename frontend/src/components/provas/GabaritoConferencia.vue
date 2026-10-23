<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import { urlDoArquivoDaProva } from '../../services/provas.service'

// Gabarito lido da imagem pela IA: sem texto no PDF, o código não confere as respostas, então o orientador confere a
// tabela inteira de uma vez, com o PDF do gabarito aberto ao lado. Depois de conferido, a tabela fica recolhida.
const props = defineProps({
  provaId: { type: String, required: true },
  gabarito: { type: Object, required: true },
  questoes: { type: Array, required: true },
  ocupado: { type: Boolean, default: false }
})
const emit = defineEmits(['conferir'])

const OPCOES = [
  { valor: '', rotulo: '—' },
  ...['A', 'B', 'C', 'D', 'E'].map((l) => ({ valor: l, rotulo: l })),
  { valor: 'ANULADA', rotulo: 'Anulada' }
]

const respostaDa = (q) => (q.anulada ? 'ANULADA' : q.gabarito || '')
const respostas = ref({})
watch(
  () => props.questoes,
  (questoes) => {
    respostas.value = Object.fromEntries(questoes.map((q) => [q.numero, respostaDa(q)]))
  },
  { immediate: true }
)

const conferido = computed(() => Boolean(props.gabarito.conferido_em))
const aberta = ref(!conferido.value)
watch(conferido, (sim) => {
  if (sim) aberta.value = false
})
const trocadas = computed(() => props.questoes.filter((q) => respostas.value[q.numero] !== respostaDa(q)).length)
const dataDaConferencia = computed(() => (conferido.value ? new Date(props.gabarito.conferido_em).toLocaleString('pt-BR') : ''))

function conferir() {
  emit(
    'conferir',
    props.questoes.map((q) => ({ numero: q.numero, resposta: respostas.value[q.numero] || null }))
  )
}
</script>

<template>
  <section class="painel conferencia">
    <div class="painel__cabecalho cabecalho">
      <div>
        <h3><i class="pi pi-image" /> Gabarito lido da imagem</h3>
        <p v-if="conferido" class="instrucao">Conferido por você em {{ dataDaConferencia }}.</p>
        <p v-else class="instrucao">
          O PDF do gabarito não tem texto: a IA leu a imagem e o sistema não tem como conferir. Abra o
          <a :href="urlDoArquivoDaProva(provaId, 'gabarito')" target="_blank" rel="noopener">PDF do gabarito</a>, compare com a
          tabela, corrija o que estiver diferente e confirme.
        </p>
      </div>
      <Button v-if="conferido" :label="aberta ? 'Recolher' : 'Ver tabela'" size="small" text @click="aberta = !aberta" />
    </div>

    <div v-if="aberta" class="painel__corpo">
      <div class="tabela">
        <label v-for="q in questoes" :key="q.numero" class="celula" :class="{ trocada: respostas[q.numero] !== respostaDa(q) }">
          <span class="numero">{{ q.numero }}</span>
          <select v-model="respostas[q.numero]" :disabled="ocupado">
            <option v-for="o in OPCOES" :key="o.valor" :value="o.valor">{{ o.rotulo }}</option>
          </select>
        </label>
      </div>
      <div class="acoes">
        <Button
          :label="trocadas ? `Salvar ${trocadas} ${trocadas === 1 ? 'troca' : 'trocas'} e confirmar` : 'Conferi: o gabarito está certo'"
          icon="pi pi-check"
          size="small"
          :disabled="ocupado"
          @click="conferir"
        />
        <a :href="urlDoArquivoDaProva(provaId, 'gabarito')" target="_blank" rel="noopener">abrir o PDF do gabarito</a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.conferencia {
  margin-bottom: 1rem;
}
.cabecalho {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}
.cabecalho h3 {
  margin: 0;
  font-size: 0.95rem;
}
.instrucao {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.tabela {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
  gap: 0.35rem 0.75rem;
}
.celula {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.3rem;
  border-radius: 4px;
}
.celula.trocada {
  background: var(--warning-background, #fff4d6);
}
.numero {
  min-width: 1.8rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--muted-foreground);
}
.celula select {
  font: inherit;
  padding: 0.1rem 0.2rem;
}
.acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-top: 0.9rem;
}
</style>
