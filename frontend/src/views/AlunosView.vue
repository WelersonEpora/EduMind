<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Message from 'primevue/message'
import AlunosAtribuirModal from '../components/equipe/AlunosAtribuirModal.vue'
import { buscarAlunosDoEdital, retirarAlunoDoEdital } from '../services/desempenho.service'
import { useSessao } from '../composables/useSessao'
import { formatarDataHora } from '../utils/formatar'

// Os alunos atribuídos ao edital e o que fizeram no simulador (etapa 5c). Para o orientador e o professor; clicar
// abre o desempenho do aluno. É aqui que o orientador atribui o edital aos alunos e tira (decisão de 2026-10-27).

const route = useRoute()
const router = useRouter()
const alunos = ref([])
const carregando = ref(true)
const erro = ref(null)
const { eOrientador } = useSessao()
const atribuirAberto = ref(false)
const retirando = ref(null)

const comPercentual = (lista) => lista.map((a) => ({ ...a, percentual: a.respostas ? Math.round((100 * a.acertos) / a.respostas) : null }))

async function carregar(id) {
  carregando.value = true
  erro.value = null
  try {
    alunos.value = comPercentual(await buscarAlunosDoEdital(id))
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

// O aluno deixa de ver o edital na hora; o que ele fez no simulador fica guardado e volta se o edital for atribuído de
// novo.
async function retirar(aluno) {
  if (!window.confirm(`Tirar este edital de ${aluno.nome}? O acesso acaba na hora; o que fez no simulador fica guardado.`)) return
  erro.value = null
  retirando.value = aluno.id
  try {
    alunos.value = comPercentual(await retirarAlunoDoEdital(route.params.id, aluno.id))
  } catch (e) {
    erro.value = e.message
  } finally {
    retirando.value = null
  }
}
</script>

<template>
  <div class="pagina-cabecalho">
    <p>Os alunos que veem este edital e como estão no simulador. O aluno só vê o edital depois de adicionado aqui.</p>
    <Button v-if="eOrientador" label="Adicionar alunos" icon="pi pi-plus" size="small" @click="atribuirAberto = true" />
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
    <Column v-if="eOrientador" header-class="coluna-acao" body-class="coluna-acao">
      <template #body="{ data }">
        <Button
          icon="pi pi-user-minus"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="`Tirar o edital de ${data.nome}`"
          title="Tirar o edital deste aluno"
          :loading="retirando === data.id"
          @click.stop="retirar(data)"
        />
      </template>
    </Column>
    <Column header-class="coluna-abrir" body-class="coluna-abrir">
      <template #body><i class="pi pi-chevron-right" aria-hidden="true"></i></template>
    </Column>
    <template #empty>
      <p v-if="!carregando" class="vazio">
        Nenhum aluno vê este edital ainda.{{ eOrientador ? ' Use Adicionar alunos.' : ' Quem adiciona é o orientador.' }}
      </p>
    </template>
  </DataTable>

  <AlunosAtribuirModal
    v-model:visible="atribuirAberto"
    :edital-id="route.params.id"
    :ja-veem="alunos.map((a) => a.id)"
    @atribuido="alunos = comPercentual($event)"
  />
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
:deep(.coluna-acao) {
  width: 3rem;
  text-align: right;
}
.vazio {
  margin: 0;
  color: var(--muted-foreground);
}
</style>
