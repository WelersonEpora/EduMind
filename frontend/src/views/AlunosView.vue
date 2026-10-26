<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Message from 'primevue/message'
import { buscarAlunosDoEdital } from '../services/desempenho.service'
import { formatarDataHora } from '../utils/formatar'

// Os alunos atribuídos ao edital e o que fizeram no simulador (etapa 5c). Para o orientador e o professor; clicar
// abre o desempenho do aluno.

const route = useRoute()
const router = useRouter()
const alunos = ref([])
const carregando = ref(true)
const erro = ref(null)

async function carregar(id) {
  carregando.value = true
  erro.value = null
  try {
    alunos.value = (await buscarAlunosDoEdital(id)).map((a) => ({ ...a, percentual: a.respostas ? Math.round((100 * a.acertos) / a.respostas) : null }))
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}
watch(() => route.params.id, carregar, { immediate: true })

function abrir(aluno) {
  router.push({ name: 'aluno', params: { id: route.params.id, alunoId: aluno.id } })
}
</script>

<template>
  <div class="pagina-cabecalho">
    <p>Os alunos que veem este edital e como estão no simulador. Para separar o edital para um aluno, use Editar na tela Membros.</p>
  </div>

  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <DataTable
    v-else
    :value="alunos"
    :loading="carregando"
    data-key="id"
    sort-field="nome"
    :sort-order="1"
    row-hover
    class="tabela-clicavel"
    @row-click="abrir($event.data)"
  >
    <Column field="nome" header="Aluno" sortable>
      <template #body="{ data }">
        <span class="nome">{{ data.nome }}</span>
        <span class="email">{{ data.email }}</span>
      </template>
    </Column>
    <Column field="questoes" header="Questões" sortable>
      <template #body="{ data }"><span class="numero">{{ data.questoes }}</span></template>
    </Column>
    <Column field="percentual" header="Acerto" sortable>
      <template #body="{ data }">
        <span class="numero">{{ data.percentual === null ? '—' : `${data.percentual}%` }}</span>
        <span v-if="data.respostas" class="email"> {{ data.acertos }} de {{ data.respostas }}</span>
      </template>
    </Column>
    <Column field="provas" header="Provas completas" sortable>
      <template #body="{ data }"><span class="numero">{{ data.provas }}</span></template>
    </Column>
    <Column field="ultima_atividade" header="Última atividade" sortable>
      <template #body="{ data }"><span class="numero">{{ data.ultima_atividade ? formatarDataHora(data.ultima_atividade) : 'nenhuma' }}</span></template>
    </Column>
    <Column header-class="coluna-abrir" body-class="coluna-abrir">
      <template #body><i class="pi pi-chevron-right" aria-hidden="true"></i></template>
    </Column>
    <template #empty>
      <p v-if="!carregando" class="vazio">Nenhum aluno vê este edital ainda. Separe o edital para os alunos em Membros, no Editar de cada um.</p>
    </template>
  </DataTable>
</template>

<style scoped>
.nome {
  display: block;
  font-weight: 600;
}
.email {
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.numero {
  font-variant-numeric: tabular-nums;
}
.vazio {
  margin: 0;
  color: var(--muted-foreground);
}
</style>
