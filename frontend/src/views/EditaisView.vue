<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import EditalIncluirModal from '../components/edital/EditalIncluirModal.vue'
import { useEditais, nomeDoEdital } from '../composables/useEditais'
import { formatarDataHora, situacaoDoEdital } from '../utils/formatar'
import { useSessao } from '../composables/useSessao'

// Editais da equipe numa tabela, no padrão das Execuções do FinMind: busca no alto, ordenação por coluna e a linha
// inteira abre o edital. O envio de um PDF novo fica no modal "Incluir".

const router = useRouter()
const toast = useToast()
const { editais, carregando, erro, recarregar } = useEditais()
// O aluno vê só os editais atribuídos a ele, sem a situação do trabalho do orientador e sem incluir (etapa 4c).
const { eAluno, podeEditar } = useSessao()

const busca = ref('')
const incluirAberto = ref(false)

// O nome e a situação entram nas linhas para a busca e a ordenação usarem o mesmo texto que aparece na tela.
const linhas = computed(() => editais.value.map((e) => ({ ...e, nome: nomeDoEdital(e), situacao: situacaoDoEdital(e) })))
const filtrados = computed(() => {
  const termo = busca.value.trim().toLowerCase()
  if (!termo) return linhas.value
  return linhas.value.filter((e) =>
    [e.nome, e.arquivo_nome, e.banca, e.orgao, e.cargo].filter(Boolean).join(' ').toLowerCase().includes(termo)
  )
})

// data_publicacao vem como AAAA-MM-DD (só a data, sem fuso).
function dataBr(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor || '') ? valor.split('-').reverse().join('/') : '—'
}

function abrir(edital) {
  router.push({ name: 'edital', params: { id: edital.id } })
}

async function aoEnviar({ edital, jaExistia }) {
  await recarregar()
  toast.add(
    jaExistia
      ? { severity: 'info', summary: 'Este PDF já foi enviado', detail: 'Abrindo o edital existente.', life: 4000 }
      : { severity: 'success', summary: 'Edital recebido', detail: `${edital.total_paginas} páginas lidas.`, life: 4000 }
  )
  abrir(edital)
}
</script>

<template>
  <div class="pagina-cabecalho">
    <div>
      <h1>{{ eAluno ? 'Meus editais' : 'Editais' }}</h1>
      <p v-if="eAluno">Os editais que o orientador separou para você. Abra um para ver o conteúdo programático e os artigos de lei cobrados.</p>
      <p v-else>Os editais da equipe. Abra um para ver o conteúdo programático, revisar, buscar as fontes e conferir a cobertura.</p>
    </div>
  </div>

  <Message v-if="erro" severity="error" :closable="false" class="aviso">{{ erro }}</Message>

  <section class="painel">
    <div class="painel__cabecalho">
      <InputText v-model="busca" type="search" placeholder="Buscar por nome, arquivo, órgão, cargo ou banca" class="busca" />
      <div class="barra">
        <span class="mono contagem">{{ filtrados.length }} de {{ editais.length }}</span>
        <Button v-if="podeEditar" label="Incluir" icon="pi pi-plus" size="small" @click="incluirAberto = true" />
      </div>
    </div>

    <DataTable
      :value="filtrados"
      :loading="carregando && !editais.length"
      data-key="id"
      sort-field="created_at"
      :sort-order="-1"
      removable-sort
      paginator
      :rows="25"
      :always-show-paginator="false"
      row-hover
      class="tabela-editais tabela-clicavel"
      @row-click="abrir($event.data)"
    >
      <Column field="nome" header="Edital" sortable>
        <template #body="{ data }">
          <span class="nome">{{ data.nome }}</span>
          <span v-if="data.orgao || data.cargo" class="arquivo">{{ data.arquivo_nome }}</span>
        </template>
      </Column>
      <Column field="banca" header="Banca" sortable header-class="col-banca" body-class="col-banca">
        <template #body="{ data }">{{ data.banca || '—' }}</template>
      </Column>
      <Column field="data_publicacao" header="Publicação" sortable header-class="col-publicacao" body-class="col-publicacao">
        <template #body="{ data }"><span class="numero">{{ dataBr(data.data_publicacao) }}</span></template>
      </Column>
      <Column v-if="!eAluno" field="situacao.rotulo" header="Situação" sortable>
        <template #body="{ data }">
          <Tag :value="data.situacao.rotulo" :severity="data.situacao.severidade" />
        </template>
      </Column>
      <Column field="created_at" header="Enviado em" sortable header-class="col-enviado" body-class="col-enviado">
        <template #body="{ data }"><span class="numero">{{ formatarDataHora(data.created_at) }}</span></template>
      </Column>
      <Column header-class="coluna-abrir" body-class="coluna-abrir">
        <template #body><i class="pi pi-chevron-right" aria-hidden="true"></i></template>
      </Column>
      <template #empty>
        <p class="vazio">
          <template v-if="editais.length">Nenhum edital com esse termo.</template>
          <template v-else-if="eAluno">Nenhum edital separado para você ainda. Peça ao seu orientador.</template>
          <template v-else>Nenhum edital ainda. Use “Incluir” para enviar o primeiro PDF.</template>
        </p>
      </template>
    </DataTable>
  </section>

  <EditalIncluirModal v-if="podeEditar" v-model:visible="incluirAberto" @enviado="aoEnviar" />
</template>

<style scoped>
.aviso {
  margin-bottom: 1rem;
}
.busca {
  flex: 1 1 260px;
  max-width: 420px;
}
.barra {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.contagem {
  color: var(--muted-foreground);
}
.nome {
  display: block;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.arquivo {
  display: block;
  font-size: 0.78rem;
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
}
.numero,
.tabela-editais :deep(.p-tag) {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.vazio {
  margin: 0.5rem 0;
  color: var(--muted-foreground);
}
@media (max-width: 767px) {
  .tabela-editais :deep(.col-banca),
  .tabela-editais :deep(.col-publicacao),
  .tabela-editais :deep(.col-enviado) {
    display: none;
  }
}
</style>
