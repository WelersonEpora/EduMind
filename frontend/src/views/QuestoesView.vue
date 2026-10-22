<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import QuestaoCartao from '../components/provas/QuestaoCartao.vue'
import { buscarQuestoes, revisarClassificacao, revisarQuestao } from '../services/provas.service'
import { listarNormas } from '../services/editais.service'

// Questões lidas de uma prova (etapa 3b). As conferidas valem direto; a tela abre nas que precisam de revisão.
const route = useRoute()
const router = useRouter()
const toast = useToast()

const dados = ref(null)
const erro = ref(null)
const filtro = ref('a_revisar')
const ocupada = ref(null)
// Normas da biblioteca, para corrigir a classificação.
const normas = ref([])

async function carregar(id) {
  dados.value = null
  erro.value = null
  try {
    dados.value = await buscarQuestoes(id)
    normas.value = (await listarNormas()).map((n) => ({ id: n.id, nome: n.nome }))
    if (!dados.value.questoes.some((q) => q.status === 'a_revisar')) filtro.value = 'todas'
  } catch (e) {
    erro.value = e.message
  }
}

watch(() => route.params.provaId, carregar, { immediate: true })

const contagem = computed(() => {
  const questoes = dados.value?.questoes || []
  const conta = (status) => questoes.filter((q) => q.status === status).length
  return {
    todas: questoes.length,
    a_revisar: conta('a_revisar'),
    valida: conta('valida'),
    descartada: conta('descartada'),
    classificacao: questoes.filter((q) => q.classificacao_status === 'a_revisar' && q.status !== 'descartada').length
  }
})
const FILTROS = computed(() => [
  { valor: 'a_revisar', rotulo: `A revisar (${contagem.value.a_revisar})` },
  { valor: 'valida', rotulo: `Válidas (${contagem.value.valida})` },
  { valor: 'descartada', rotulo: `Descartadas (${contagem.value.descartada})` },
  { valor: 'todas', rotulo: `Todas (${contagem.value.todas})` },
  { valor: 'classificacao', rotulo: `Classificação a revisar (${contagem.value.classificacao})` }
])
const visiveis = computed(() =>
  (dados.value?.questoes || []).filter((q) => {
    if (filtro.value === 'todas') return true
    if (filtro.value === 'classificacao') return q.classificacao_status === 'a_revisar' && q.status !== 'descartada'
    return q.status === filtro.value
  })
)

const titulo = computed(() => {
  const p = dados.value?.prova
  if (!p) return ''
  return [p.banca, p.orgao, p.cargo, p.ano].filter(Boolean).join(' · ') || 'Prova'
})

async function aoRevisar(questao, alteracoes, revisar = revisarQuestao) {
  ocupada.value = questao.id
  try {
    const atualizada = await revisar(dados.value.prova.id, questao.id, alteracoes)
    const i = dados.value.questoes.findIndex((q) => q.id === questao.id)
    // A revisão do texto não devolve as referências: ficam as que já estavam.
    dados.value.questoes[i] = { referencias: questao.referencias, ...atualizada }
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível salvar', detail: e.message, life: 8000 })
  } finally {
    ocupada.value = null
  }
}
</script>

<template>
  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <template v-if="dados">
    <div class="pagina-cabecalho">
      <div>
        <h1>Questões · {{ titulo }}</h1>
        <p>
          Lidas pela IA e conferidas por código: enunciado e alternativas existem no PDF da prova e a resposta existe no
          PDF do gabarito. As que não bateram ficam para você decidir.
        </p>
      </div>
      <a href="#" class="voltar" @click.prevent="router.back()">← Provas</a>
    </div>

    <Message v-if="dados.prova.leitura_status === 'lendo'" severity="info" :closable="false">
      A leitura ainda está em andamento. Volte em alguns minutos.
    </Message>
    <Message v-for="aviso in dados.prova.leitura?.avisos || []" :key="aviso" severity="warn" :closable="false">{{ aviso }}</Message>
    <Message v-if="dados.prova.gabarito_situacao && dados.prova.gabarito_situacao !== 'oficial_definitivo'" severity="warn" :closable="false">
      O gabarito desta prova não é o oficial definitivo: confira as respostas antes de usá-las.
    </Message>

    <template v-if="dados.questoes.length">
      <SelectButton v-model="filtro" :options="FILTROS" option-label="rotulo" option-value="valor" :allow-empty="false" class="filtro" />
      <p v-if="visiveis.length === 0" class="pendente">Nenhuma questão neste filtro.</p>
      <div class="questoes">
        <QuestaoCartao
          v-for="questao in visiveis"
          :key="questao.id"
          :questao="questao"
          :prova-id="dados.prova.id"
          :ocupado="ocupada === questao.id"
          :normas="normas"
          @revisar="aoRevisar(questao, $event)"
          @classificar="aoRevisar(questao, $event, revisarClassificacao)"
        />
      </div>
    </template>
    <p v-else class="pendente">Esta prova ainda não teve as questões lidas.</p>
  </template>
</template>

<style scoped>
.voltar {
  white-space: nowrap;
}
.filtro {
  margin: 0.5rem 0 1rem;
}
.questoes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 560px) {
  .questoes {
    grid-template-columns: minmax(0, 1fr);
  }
}
.pendente {
  color: var(--muted-foreground);
}
</style>
