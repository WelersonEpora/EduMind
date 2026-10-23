<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import { urlDoArquivoDaProva } from '../../services/provas.service'

// O gabarito da prova na tela das questões, quando pede uma decisão do orientador:
// - várias versões de caderno e o caderno não diz qual é a dele: o orientador escolhe a versão;
// - lido da imagem: sem texto no PDF, o código não confere as respostas, então o orientador confere a tabela inteira
//   de uma vez, com o PDF do gabarito aberto ao lado. Depois de conferido, a tabela fica recolhida.
const props = defineProps({
  provaId: { type: String, required: true },
  gabarito: { type: Object, required: true },
  questoes: { type: Array, required: true },
  ocupado: { type: Boolean, default: false }
})
const emit = defineEmits(['escolher-versao', 'conferir'])

const OPCOES = [
  { valor: '', rotulo: '—' },
  ...['A', 'B', 'C', 'D', 'E'].map((l) => ({ valor: l, rotulo: l })),
  { valor: 'ANULADA', rotulo: 'Anulada' }
]

const urlDoGabarito = computed(() => urlDoArquivoDaProva(props.provaId, 'gabarito'))
const daImagem = computed(() => props.gabarito.lido_de === 'imagem')

// Versões.
const versoes = computed(() =>
  (props.gabarito.versoes || []).map((v, i) => ({ indice: i, rotulo: v.versao || `Versão ${i + 1} (sem nome)` }))
)
const variasVersoes = computed(() => versoes.value.length > 1)
const escolhida = computed(() => props.gabarito.versao_escolhida)
const versaoNoSeletor = ref(null)
watch(escolhida, (v) => (versaoNoSeletor.value = v), { immediate: true })

// Conferência da tabela (só gabarito lido da imagem, com a versão escolhida).
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
watch(conferido, (sim) => (aberta.value = !sim))
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
    <div class="painel__cabecalho">
      <h3><i class="pi pi-list-check" /> Gabarito</h3>
    </div>

    <div class="painel__corpo corpo">
      <div v-if="variasVersoes" class="bloco">
        <p v-if="escolhida === null" class="alerta">
          <i class="pi pi-exclamation-triangle" /> O gabarito tem {{ versoes.length }} versões e o caderno não diz qual é a
          dele. Sem a versão certa, as respostas ficam trocadas.
        </p>
        <p v-else class="instrucao">
          O gabarito tem {{ versoes.length }} versões; vale a <strong>{{ versoes[escolhida].rotulo }}</strong>.
        </p>
        <p class="instrucao">
          Para descobrir a versão do caderno, pegue 4 ou 5 questões de resposta inequívoca (Atualidades, Matemática) e veja
          em qual versão do <a :href="urlDoGabarito" target="_blank" rel="noopener">PDF do gabarito</a> todas batem.
        </p>
        <div class="linha">
          <Select v-model="versaoNoSeletor" :options="versoes" option-label="rotulo" option-value="indice" placeholder="Versão do caderno" size="small" />
          <Button
            label="Usar esta versão"
            size="small"
            :disabled="ocupado || versaoNoSeletor === null || versaoNoSeletor === escolhida"
            @click="emit('escolher-versao', versaoNoSeletor)"
          />
        </div>
      </div>

      <div v-if="daImagem && escolhida !== null" class="bloco">
        <div class="linha entre">
          <div>
            <p v-if="conferido" class="instrucao"><i class="pi pi-check-circle" /> Respostas conferidas por você em {{ dataDaConferencia }}.</p>
            <p v-else class="instrucao">
              <i class="pi pi-image" /> O PDF do gabarito é uma imagem: a IA leu as respostas e o sistema não tem como
              conferir. Abra o <a :href="urlDoGabarito" target="_blank" rel="noopener">PDF do gabarito</a>, compare com a
              tabela (atenção ao número da questão, além da letra), corrija o que estiver diferente e confirme.
            </p>
          </div>
          <Button v-if="conferido" :label="aberta ? 'Recolher' : 'Ver tabela'" size="small" text @click="aberta = !aberta" />
        </div>

        <template v-if="aberta">
          <div class="tabela">
            <label v-for="q in questoes" :key="q.numero" class="celula" :class="{ trocada: respostas[q.numero] !== respostaDa(q) }">
              <span class="numero">{{ q.numero }}</span>
              <select v-model="respostas[q.numero]" :disabled="ocupado">
                <option v-for="o in OPCOES" :key="o.valor" :value="o.valor">{{ o.rotulo }}</option>
              </select>
            </label>
          </div>
          <div class="linha">
            <Button
              :label="trocadas ? `Salvar ${trocadas} ${trocadas === 1 ? 'troca' : 'trocas'} e confirmar` : 'Conferi: o gabarito está certo'"
              icon="pi pi-check"
              size="small"
              :disabled="ocupado"
              @click="conferir"
            />
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.conferencia {
  margin-bottom: 1rem;
}
.painel__cabecalho h3 {
  margin: 0;
  font-size: 0.95rem;
}
.corpo {
  display: grid;
  gap: 1rem;
}
.bloco {
  display: grid;
  gap: 0.5rem;
}
.instrucao {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.alerta {
  margin: 0;
  font-size: 0.85rem;
  color: var(--warning-foreground);
}
.linha {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.entre {
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: nowrap;
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
</style>
