<script setup>
import { ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { urlDoArquivoDaVersao } from '../../services/editais.service'
import { formatarDataHora } from '../../utils/formatar'

// O que é da norma da biblioteca, e não de um edital: a URL oficial (buscada pela IA ou informada) e as versões do
// texto (upload manual). Usado no card de cada norma nas Fontes de um edital e na tela da norma na biblioteca; a tela
// que usa faz as chamadas e recarrega. somenteLeitura (o aluno, etapa 4c): mostra a URL e as versões, sem as ações.
const props = defineProps({
  norma: { type: Object, required: true },
  ocupado: { type: Boolean, default: false },
  somenteLeitura: { type: Boolean, default: false }
})
const emit = defineEmits(['buscar-url', 'definir-url', 'enviar-versao', 'processar-versao'])

// "2026" (só o ano) ou "12/03/2026".
function dataDaVersao(versao) {
  if (!versao.data_versao) return null
  if (versao.data_versao_precisao === 'ano') return versao.data_versao.slice(0, 4)
  return versao.data_versao.split('-').reverse().join('/')
}

const editandoUrl = ref(false)
const urlDigitada = ref('')
function abrirUrl() {
  urlDigitada.value = props.norma.url_oficial || ''
  editandoUrl.value = true
}
function salvarUrl() {
  editandoUrl.value = false
  emit('definir-url', props.norma, urlDigitada.value.trim() || null)
}

const seletor = ref(null)
function escolherArquivo(evento) {
  const [arquivo] = evento.target.files
  evento.target.value = ''
  if (arquivo) emit('enviar-versao', props.norma, arquivo)
}
</script>

<template>
  <div class="fonte-da-norma">
    <section>
      <span class="rotulo">URL oficial</span>
      <div v-if="!editandoUrl" class="url">
        <template v-if="norma.url_oficial">
          <a :href="norma.url_oficial" target="_blank" rel="noopener">{{ norma.url_oficial }}</a>
          <em class="fonte-url">{{ norma.url_fonte === 'busca_ia' ? 'achada pela busca da IA' : 'informada pelo orientador' }}</em>
        </template>
        <span v-else class="pendente">sem URL</span>
        <span v-if="!somenteLeitura" class="url__botoes">
          <Button label="Buscar com IA" icon="pi pi-search" size="small" text :loading="ocupado" @click="emit('buscar-url', norma)" />
          <Button label="Informar" icon="pi pi-pencil" size="small" text :disabled="ocupado" @click="abrirUrl" />
        </span>
      </div>
      <form v-else class="url url--edicao" @submit.prevent="salvarUrl">
        <InputText v-model="urlDigitada" placeholder="https://www.planalto.gov.br/..." size="small" class="url__campo" />
        <Button type="submit" label="Salvar" size="small" />
        <Button label="Cancelar" size="small" text severity="secondary" @click="editandoUrl = false" />
      </form>
    </section>

    <section>
      <span class="rotulo">Texto da norma</span>
      <p v-if="norma.versoes.length === 0 && somenteLeitura" class="instrucao">Ainda sem texto.</p>
      <p v-else-if="norma.versoes.length === 0" class="instrucao">
        Abra a URL oficial no navegador, salve a página (Ctrl+S) e envie o arquivo aqui. Também serve PDF ou .txt.
      </p>
      <ul v-else class="versoes">
        <li v-for="versao in norma.versoes" :key="versao.id" class="versao">
          <span class="versao__linha">
            <a :href="urlDoArquivoDaVersao(norma.id, versao.id)" target="_blank" rel="noopener">
              {{ versao.origem === 'upload' ? 'Upload' : 'Coleta' }} em {{ formatarDataHora(versao.acessado_em) }}
            </a>
            <template v-if="versao.processada_em">
              <b>{{ versao.artigos_total }} artigos</b>
              <span v-if="dataDaVersao(versao)" title="Alteração mais recente nas notas de redação">texto de {{ dataDaVersao(versao) }}</span>
            </template>
            <span v-else class="pendente">ainda não dividido em artigos</span>
            <router-link v-if="versao.artigos_total" :to="{ name: 'norma', params: { id: norma.id }, query: { versao: versao.id } }">ver artigos</router-link>
            <button v-if="!somenteLeitura" type="button" class="link" :disabled="ocupado" @click="emit('processar-versao', norma, versao)">processar de novo</button>
          </span>
          <ul v-if="versao.avisos?.length" class="avisos-versao">
            <li v-for="aviso in versao.avisos" :key="aviso">{{ aviso }}</li>
          </ul>
        </li>
      </ul>
      <input ref="seletor" type="file" accept=".html,.htm,.pdf,.txt" hidden @change="escolherArquivo" />
      <Button
        v-if="!somenteLeitura"
        :label="norma.versoes.length ? 'Enviar versão nova' : 'Enviar texto'"
        icon="pi pi-upload"
        size="small"
        outlined
        :disabled="ocupado"
        @click="seletor.click()"
      />
    </section>
  </div>
</template>

<style scoped>
.fonte-da-norma {
  display: grid;
  gap: 0.9rem;
  min-width: 0;
}
.instrucao,
.pendente {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.link {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 0.8rem;
  color: var(--muted-foreground);
  text-decoration: underline;
  cursor: pointer;
}
.url {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
  margin-top: 0.2rem;
  overflow-wrap: anywhere;
}
.url--edicao {
  align-items: center;
}
.url__campo {
  flex: 1;
  min-width: 16rem;
}
.url__botoes {
  display: inline-flex;
  gap: 0.1rem;
}
.fonte-url {
  font-size: 0.75rem;
  color: var(--muted-foreground);
}
.versoes {
  margin: 0.25rem 0 0.5rem;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.2rem;
  font-size: 0.9rem;
}
.versao {
  display: grid;
  gap: 0.2rem;
}
.versao__linha {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: baseline;
}
.avisos-versao {
  margin: 0;
  padding-left: 1rem;
  font-size: 0.8rem;
  color: var(--warning-foreground);
}
</style>
