<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import { urlDoArquivoDaVersao } from '../../services/editais.service'
import { formatarDataHora } from '../../utils/formatar'

// Uma norma citada no edital: confirmar a identidade (entra na biblioteca), URL oficial e upload manual do texto.
const props = defineProps({
  fonte: { type: Object, required: true },
  ocupado: { type: Boolean, default: false }
})
const emit = defineEmits(['confirmar', 'desligar', 'buscar-url', 'definir-url', 'enviar-versao', 'processar-versao'])

// "2026" (só o ano) ou "12/03/2026".
function dataDaVersao(versao) {
  if (!versao.data_versao) return null
  if (versao.data_versao_precisao === 'ano') return versao.data_versao.slice(0, 4)
  return versao.data_versao.split('-').reverse().join('/')
}

const dataDoEdital = computed(() => props.fonte.vigencia?.dataDoEdital?.split('-').reverse().join('/'))

const CAMPOS = [
  ['jurisdicao', 'Jurisdição', 'BR, SP, TJSP'],
  ['tipo', 'Tipo', 'Lei, Decreto-Lei...'],
  ['numero', 'Número', '9.099'],
  ['ano', 'Ano', '1995'],
  ['nome', 'Nome', 'Código Penal']
]

const norma = computed(() => props.fonte.norma)
// Base do formulário: a norma da biblioteca que já tem a chave proposta, senão a proposta.
const base = computed(() => (norma.value && !props.fonte.confirmada ? norma.value : props.fonte.proposta) || {})
const formulario = ref({})
watch(
  base,
  (valor) => {
    formulario.value = Object.fromEntries(CAMPOS.map(([campo]) => [campo, valor[campo] ?? '']))
  },
  { immediate: true }
)

const titulo = computed(() => (props.fonte.confirmada ? norma.value.nome : base.value.nome))
const situacao = computed(() => {
  if (!props.fonte.confirmada) {
    return norma.value
      ? { rotulo: 'na biblioteca · confirmar ligação', severidade: 'info' }
      : { rotulo: 'identidade a confirmar', severidade: 'warn' }
  }
  if (norma.value.versoes.length === 0) return { rotulo: 'upload manual necessário', severidade: 'danger' }
  return { rotulo: `${norma.value.versoes.length} ${norma.value.versoes.length === 1 ? 'versão' : 'versões'}`, severidade: 'success' }
})

const editandoUrl = ref(false)
const urlDigitada = ref('')
function abrirUrl() {
  urlDigitada.value = norma.value.url_oficial || ''
  editandoUrl.value = true
}
function salvarUrl() {
  editandoUrl.value = false
  emit('definir-url', norma.value, urlDigitada.value.trim() || null)
}

const seletor = ref(null)
function escolherArquivo(evento) {
  const [arquivo] = evento.target.files
  evento.target.value = ''
  if (arquivo) emit('enviar-versao', norma.value, arquivo)
}

function confirmar() {
  emit('confirmar', { citacoes: props.fonte.citacoes.map((c) => c.id), ...formulario.value })
}
</script>

<template>
  <article class="painel fonte">
    <div class="painel__cabecalho">
      <h2>{{ titulo }}</h2>
      <Tag :value="situacao.rotulo" :severity="situacao.severidade" />
    </div>

    <div class="painel__corpo corpo">
      <section>
        <span class="rotulo">Citado no edital</span>
        <ul class="citacoes">
          <li v-for="citacao in fonte.citacoes" :key="citacao.id">
            {{ citacao.item_texto }}
            <span v-if="citacao.artigos_texto" class="mono citacao__artigos">· {{ citacao.artigos_texto }}</span>
          </li>
        </ul>
      </section>

      <!-- Identidade a confirmar -->
      <section v-if="!fonte.confirmada" class="identidade">
        <ul v-if="fonte.proposta?.alertas?.length" class="alertas">
          <li v-for="alerta in fonte.proposta.alertas" :key="alerta"><i class="pi pi-exclamation-triangle" /> {{ alerta }}</li>
        </ul>
        <p v-if="fonte.proposta?.doCatalogo" class="nota">Identificada pelo catálogo dos grandes códigos.</p>
        <form class="formulario" @submit.prevent="confirmar">
          <label v-for="[campo, rotulo, exemplo] in CAMPOS" :key="campo" :class="{ largo: campo === 'nome' }">
            <span class="rotulo">{{ rotulo }}</span>
            <InputText v-model="formulario[campo]" :placeholder="exemplo" size="small" />
          </label>
          <span class="formulario__botoes">
            <Button type="submit" :label="norma ? 'Confirmar e ligar à biblioteca' : 'Confirmar e incluir na biblioteca'" icon="pi pi-check" size="small" :disabled="ocupado" />
          </span>
        </form>
      </section>

      <!-- Norma confirmada: URL oficial e versões -->
      <template v-else>
        <p class="identificacao mono">
          {{ norma.chave }}
          <button type="button" class="link" :disabled="ocupado" @click="emit('desligar', fonte)">desfazer a confirmação</button>
        </p>

        <section>
          <span class="rotulo">URL oficial</span>
          <div v-if="!editandoUrl" class="url">
            <template v-if="norma.url_oficial">
              <a :href="norma.url_oficial" target="_blank" rel="noopener">{{ norma.url_oficial }}</a>
              <em class="fonte-url">{{ norma.url_fonte === 'busca_ia' ? 'achada pela busca da IA' : 'informada pelo orientador' }}</em>
            </template>
            <span v-else class="pendente">sem URL</span>
            <span class="url__botoes">
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

        <section v-if="fonte.vigencia && (fonte.vigencia.alteradosDepois || fonte.vigencia.talvezDepois)" class="vigencia">
          <i class="pi pi-exclamation-triangle" />
          <span>
            O texto enviado é mais novo que o edital ({{ dataDoEdital }}):
            <b>{{ fonte.vigencia.alteradosDepois }}</b> {{ fonte.vigencia.alteradosDepois === 1 ? 'artigo alterado' : 'artigos alterados' }} depois
            <template v-if="fonte.vigencia.talvezDepois"> e {{ fonte.vigencia.talvezDepois }} no mesmo ano (a nota só traz o ano)</template>.
            <template v-if="fonte.vigencia.citadosAlteradosDepois.length">
              Cobrados no edital: <b>{{ fonte.vigencia.citadosAlteradosDepois.join(', ') }}</b>.
            </template>
            <template v-if="fonte.vigencia.citadosTalvezDepois.length">
              Talvez: {{ fonte.vigencia.citadosTalvezDepois.join(', ') }}.
            </template>
            <template v-if="!fonte.vigencia.citadosAlteradosDepois.length && !fonte.vigencia.citadosTalvezDepois.length">
              Nenhum deles é cobrado no edital.
            </template>
          </span>
        </section>

        <section>
          <span class="rotulo">Texto da norma</span>
          <p v-if="norma.versoes.length === 0" class="instrucao">
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
                <button type="button" class="link" :disabled="ocupado" @click="emit('processar-versao', norma, versao)">processar de novo</button>
              </span>
              <ul v-if="versao.avisos?.length" class="avisos-versao">
                <li v-for="aviso in versao.avisos" :key="aviso">{{ aviso }}</li>
              </ul>
            </li>
          </ul>
          <input ref="seletor" type="file" accept=".html,.htm,.pdf,.txt" hidden @change="escolherArquivo" />
          <Button label="Enviar texto" icon="pi pi-upload" size="small" outlined :disabled="ocupado" @click="seletor.click()" />
        </section>
      </template>
    </div>
  </article>
</template>

<style scoped>
.corpo {
  display: grid;
  gap: 0.9rem;
}
.citacoes {
  margin: 0.25rem 0 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.2rem;
  font-size: 0.9rem;
}
.citacao__artigos {
  color: var(--muted-foreground);
}
.alertas {
  margin: 0 0 0.5rem;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}
.alertas li {
  list-style: none;
  font-size: 0.85rem;
  color: var(--warning-foreground);
  background: color-mix(in oklch, var(--warning) 22%, transparent);
  border-radius: 0.35rem;
  padding: 0.25rem 0.5rem;
}
.nota,
.instrucao,
.pendente {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.formulario {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr) 7rem 5rem;
  gap: 0.5rem;
}
.formulario label {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
/* O campo de texto tem largura mínima própria; sem isso, estoura as colunas estreitas (Ano) para fora do card. */
.formulario :deep(input) {
  width: 100%;
  min-width: 0;
}
.formulario .largo,
.formulario__botoes {
  grid-column: 1 / -1;
}
.identificacao {
  margin: 0;
  color: var(--muted-foreground);
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
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
.versoes li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: baseline;
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
.vigencia {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.85rem;
  padding: 0.5rem 0.7rem;
  border-radius: 0.4rem;
  color: var(--warning-foreground);
  background: color-mix(in oklch, var(--warning) 20%, transparent);
}
</style>
