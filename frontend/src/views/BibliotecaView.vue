<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { listarNormas } from '../services/editais.service'
import { nomeDoEdital } from '../composables/useEditais'
import { useSessao } from '../composables/useSessao'
import NormaIncluirModal from '../components/fontes/NormaIncluirModal.vue'

// Biblioteca de normas: as normas confirmadas nas Fontes de qualquer edital ou incluídas aqui direto, compartilhadas
// entre editais. Mesma tabela da tela de Editais: busca no alto, ordenação por coluna e a linha inteira abre a norma.
// Incluir é só para orientador e professor (o backend confere o papel).
const router = useRouter()
const toast = useToast()
const { equipeAtual } = useSessao()
const podeIncluir = computed(() => ['orientador', 'professor'].includes(equipeAtual.value?.papel))
const incluirAberto = ref(false)

// Incluída (ou já existente): abre a norma, onde se busca a URL oficial e se envia o texto.
function aoIncluir({ norma, jaExistia }) {
  toast.add(
    jaExistia
      ? { severity: 'info', summary: 'Esta norma já está na biblioteca', detail: 'Abrindo a norma existente.', life: 5000 }
      : { severity: 'success', summary: 'Norma incluída', detail: 'Busque a URL oficial e envie o texto.', life: 5000 }
  )
  router.push({ name: 'norma', params: { id: norma.id } })
}
const normas = ref([])
const erro = ref(null)
const busca = ref('')
const carregando = ref(true)

onMounted(async () => {
  try {
    normas.value = await listarNormas()
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
})

function semAcento(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const filtradas = computed(() => {
  const termo = semAcento(busca.value.trim())
  if (!termo) return normas.value
  return normas.value.filter((n) => semAcento(`${n.nome} ${n.tipo} ${n.numero ?? ''} ${n.ano ?? ''} ${n.chave}`).includes(termo))
})

function abrir(norma) {
  router.push({ name: 'norma', params: { id: norma.id } })
}

const JURISDICOES = { BR: 'Federal', TJSP: 'TJSP' }
const jurisdicao = (norma) => JURISDICOES[norma.jurisdicao] || norma.jurisdicao || '—'

// A versão mais recente (a lista vem da mais nova para a mais antiga).
function situacao(norma) {
  const [versao] = norma.versoes
  if (!versao) return { rotulo: 'sem texto', severidade: 'danger' }
  if (!versao.processada_em) return { rotulo: 'texto não dividido', severidade: 'warn' }
  const data = versao.data_versao_precisao === 'ano' ? versao.data_versao?.slice(0, 4) : versao.data_versao?.split('-').reverse().join('/')
  return { rotulo: `${versao.artigos_total} artigos${data ? ` · texto de ${data}` : ''}`, severidade: 'success' }
}
</script>

<template>
  <div class="pagina-cabecalho">
    <div>
      <h1>Biblioteca de normas</h1>
      <p>
        As normas confirmadas nas Fontes dos editais ou incluídas aqui. Cada norma aparece uma vez e serve a todos os
        editais que a citam; o texto fica guardado em versões.
      </p>
    </div>
  </div>

  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <section v-else class="painel">
    <div class="painel__cabecalho">
      <InputText v-model="busca" type="search" placeholder="Buscar por nome, tipo, número ou ano" class="busca" />
      <div class="barra">
        <span class="mono pendente">{{ filtradas.length }} de {{ normas.length }}</span>
        <Button v-if="podeIncluir" label="Incluir" icon="pi pi-plus" size="small" @click="incluirAberto = true" />
      </div>
    </div>
    <DataTable
      :value="filtradas"
      data-key="id"
      sort-field="nome"
      :sort-order="1"
      removable-sort
      paginator
      :rows="25"
      :always-show-paginator="false"
      row-hover
      class="tabela-clicavel"
      @row-click="abrir($event.data)"
    >
      <Column field="nome" header="Norma" sortable>
        <template #body="{ data }">
          <span class="nome">{{ data.nome }}</span>
          <span class="mono pendente">{{ data.chave }}</span>
        </template>
      </Column>
      <Column field="jurisdicao" header="Jurisdição" sortable header-class="col-jurisdicao" body-class="col-jurisdicao">
        <template #body="{ data }">{{ jurisdicao(data) }}</template>
      </Column>
      <Column header="Texto">
        <template #body="{ data }"><Tag :value="situacao(data).rotulo" :severity="situacao(data).severidade" class="sem-quebra" /></template>
      </Column>
      <Column header="Citada em" header-class="col-citada" body-class="col-citada">
        <template #body="{ data }">
          <!-- .stop: o link leva às Fontes do edital, não à norma da linha. -->
          <router-link
            v-for="edital in data.editais"
            :key="edital.id"
            :to="{ name: 'fontes', params: { id: edital.id } }"
            class="edital"
            @click.stop
          >
            {{ nomeDoEdital(edital) }}
          </router-link>
          <span v-if="data.editais.length === 0" class="pendente">nenhum edital</span>
        </template>
      </Column>
      <Column header-class="coluna-abrir" body-class="coluna-abrir">
        <template #body><i class="pi pi-chevron-right" aria-hidden="true"></i></template>
      </Column>
      <template #empty>
        <p class="pendente">
          <template v-if="normas.length">Nenhuma norma com "{{ busca }}".</template>
          <template v-else-if="!carregando">
            A biblioteca está vazia. As normas entram quando a identidade delas é confirmada nas Fontes de um edital<template
              v-if="podeIncluir"
            >, ou pelo botão "Incluir"</template
            >.
          </template>
        </p>
      </template>
    </DataTable>
  </section>

  <NormaIncluirModal v-if="podeIncluir" v-model:visible="incluirAberto" @incluida="aoIncluir" />
</template>

<style scoped>
.busca {
  flex: 1 1 260px;
  max-width: 420px;
}
.barra {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.nome {
  font-weight: 600;
  display: block;
}
.pendente {
  color: var(--muted-foreground);
}
.sem-quebra {
  white-space: nowrap;
}
.edital {
  display: block;
  color: var(--primary);
  text-decoration: none;
}
.edital:hover {
  text-decoration: underline;
}
@media (max-width: 767px) {
  :deep(.col-jurisdicao),
  :deep(.col-citada) {
    display: none;
  }
}
</style>
