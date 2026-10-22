<script setup>
import { computed, onMounted, ref } from 'vue'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { listarNormas } from '../services/editais.service'
import { nomeDoEdital } from '../composables/useEditais'

// Biblioteca de normas: as normas confirmadas nas Fontes de qualquer edital, compartilhadas entre editais.
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
        As normas confirmadas nas Fontes dos editais. Cada norma aparece uma vez e serve a todos os editais que a citam; o
        texto fica guardado em versões.
      </p>
    </div>
  </div>

  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>
  <Message v-else-if="!carregando && normas.length === 0" severity="info" :closable="false">
    A biblioteca está vazia. As normas entram quando você confirma a identidade delas nas Fontes de um edital.
  </Message>

  <template v-else-if="normas.length">
    <InputText v-model="busca" placeholder="Buscar por nome, tipo, número ou ano" class="busca" />
    <section class="painel">
      <table class="tabela">
        <thead>
          <tr>
            <th>Norma</th>
            <th>Jurisdição</th>
            <th>Texto</th>
            <th>Citada em</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="norma in filtradas" :key="norma.id">
            <td>
              <router-link :to="{ name: 'norma', params: { id: norma.id } }" class="nome">{{ norma.nome }}</router-link>
              <span class="mono identidade">{{ norma.chave }}</span>
            </td>
            <td>{{ jurisdicao(norma) }}</td>
            <td><Tag :value="situacao(norma).rotulo" :severity="situacao(norma).severidade" /></td>
            <td>
              <router-link v-for="edital in norma.editais" :key="edital.id" :to="{ name: 'fontes', params: { id: edital.id } }" class="edital">
                {{ nomeDoEdital(edital) }}
              </router-link>
              <span v-if="norma.editais.length === 0" class="pendente">nenhum edital</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="filtradas.length === 0" class="painel__corpo pendente">Nenhuma norma com "{{ busca }}".</p>
    </section>
  </template>
</template>

<style scoped>
.busca {
  width: 100%;
  max-width: 28rem;
  margin-bottom: 1rem;
}
.tabela {
  width: 100%;
  border-collapse: collapse;
}
.tabela th {
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border);
}
.tabela td {
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.nome {
  font-weight: 600;
  display: block;
}
.identidade,
.pendente {
  color: var(--muted-foreground);
}
.edital {
  display: block;
}
</style>
