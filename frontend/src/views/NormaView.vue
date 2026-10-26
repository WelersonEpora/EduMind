<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import {
  buscarArtigosDaVersao,
  buscarNorma,
  buscarUrlDaNorma,
  definirUrlDaNorma,
  enviarVersaoDaNorma,
  processarVersaoDaNorma,
  urlDoArquivoDaVersao
} from '../services/editais.service'
import FonteDaNorma from '../components/fontes/FonteDaNorma.vue'
import { useSessao } from '../composables/useSessao'
import { nomeDoEdital } from '../composables/useEditais'
import { formatarDataHora } from '../utils/formatar'
import { partesDoArtigo } from '../utils/normas'

// Uma norma da biblioteca e o texto de uma versão dividido em artigos, como documento: os cabeçalhos da estrutura
// (título, capítulo, seção), o texto vigente, as notas de redação, a marca de revogado e a redação anterior tachada.
// A URL oficial e as versões do texto são da norma: dá para buscar a URL e enviar uma versão nova aqui mesmo, sem
// passar pelas Fontes de um edital (FonteDaNorma, o mesmo das Fontes).
const route = useRoute()
const router = useRouter()
const toast = useToast()
// O aluno só lê a norma (etapa 4c): a URL e as versões aparecem sem as ações.
// "Citada em" também não é do aluno: mostraria editais que não foram atribuídos a ele.
const { podeEditar, eAluno } = useSessao()

const norma = ref(null)
const artigos = ref([])
const erro = ref(null)
const carregandoArtigos = ref(false)
const busca = ref('')

const versaoId = computed(() => route.query.versao || norma.value?.versoes[0]?.id || null)
const versao = computed(() => norma.value?.versoes.find((v) => v.id === versaoId.value) || null)
const opcoesDeVersao = computed(() =>
  (norma.value?.versoes || []).map((v) => ({
    id: v.id,
    rotulo: `${v.origem === 'upload' ? 'Upload' : 'Coleta'} em ${formatarDataHora(v.acessado_em)}${v.artigos_total != null ? ` · ${v.artigos_total} artigos` : ''}`
  }))
)

async function carregarNorma(id) {
  norma.value = null
  artigos.value = []
  erro.value = null
  try {
    norma.value = await buscarNorma(id)
  } catch (e) {
    erro.value = e.message
  }
}

async function carregarArtigos() {
  artigos.value = []
  if (!versao.value?.processada_em) return
  carregandoArtigos.value = true
  try {
    artigos.value = await buscarArtigosDaVersao(norma.value.id, versao.value.id)
  } catch (e) {
    erro.value = e.message
  } finally {
    carregandoArtigos.value = false
  }
  // Vindo da cobertura ("?artigo=313-A"): rola até o artigo.
  if (route.query.artigo && artigos.value.length) {
    await nextTick()
    irPara(route.query.artigo)
  }
}

watch(() => route.params.id, carregarNorma, { immediate: true })
watch(() => [norma.value?.id, versaoId.value], carregarArtigos)

// Ações da fonte: depois de cada uma, a norma é recarregada. Uma versão nova passa a ser a mostrada.
const ocupado = ref(false)
async function executar(acao, falha, sucesso) {
  ocupado.value = true
  try {
    const versaoNova = await acao()
    norma.value = await buscarNorma(norma.value.id)
    if (versaoNova) await router.replace({ query: { ...route.query, versao: undefined } })
    // "Processar de novo" mantém a versão: o texto em artigos precisa ser lido de novo.
    else await carregarArtigos()
    if (sucesso) toast.add({ severity: 'success', summary: sucesso, life: 4000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: falha, detail: e.message, life: 8000 })
  } finally {
    ocupado.value = false
  }
}
const aoBuscarUrl = (n) => executar(() => buscarUrlDaNorma(n.id), 'A busca não achou a URL oficial', 'URL oficial encontrada')
const aoDefinirUrl = (n, url) => executar(() => definirUrlDaNorma(n.id, url), 'Não foi possível salvar a URL')
const aoProcessarVersao = (n, v) =>
  executar(() => processarVersaoDaNorma(n.id, v.id), 'Não foi possível dividir o texto', 'Texto dividido em artigos')
const aoEnviarVersao = (n, arquivo) =>
  executar(
    async () => {
      const { jaExistia } = await enviarVersaoDaNorma(n.id, arquivo)
      if (jaExistia) toast.add({ severity: 'info', summary: 'Este arquivo já foi enviado', detail: 'Nenhuma versão nova.', life: 5000 })
      return !jaExistia
    },
    'Não foi possível enviar o texto',
    'Texto recebido'
  )

function escolherVersao(id) {
  router.replace({ query: { ...route.query, versao: id } })
}

const NIVEIS = ['tomo', 'parte', 'livro', 'titulo', 'capitulo', 'secao', 'subsecao']

function semAcento(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Busca: um número ("313-A", "art. 5") vai direto ao artigo; outro texto filtra os artigos que o contêm.
const numeroBuscado = computed(() => {
  const termo = busca.value.trim().replace(/^art(igo)?\.?\s*/i, '').replace(/[º°o]$/i, '').toUpperCase()
  return /^\d+(-[A-Z])?$/.test(termo) ? termo : null
})
const visiveis = computed(() => {
  const termo = semAcento(busca.value.trim())
  if (!termo) return artigos.value
  if (numeroBuscado.value) return artigos.value.filter((a) => a.numero === numeroBuscado.value)
  return artigos.value.filter((a) => semAcento(a.texto_bruto).includes(termo))
})

// Os cabeçalhos que mudam antes de cada artigo (só os níveis que mudaram desde o artigo anterior visível).
const comCabecalhos = computed(() => {
  let anterior = {}
  return visiveis.value.map((artigo) => {
    const estrutura = artigo.estrutura || {}
    const cabecalhos = []
    let mudou = false
    for (const nivel of NIVEIS) {
      if (!estrutura[nivel]) continue
      if (mudou || estrutura[nivel] !== anterior[nivel]) {
        mudou = true
        cabecalhos.push({ nivel, rotulo: estrutura[nivel], nome: estrutura[`${nivel}_nome`] })
      }
    }
    anterior = estrutura
    return { artigo, cabecalhos }
  })
})

// Índice: os títulos e capítulos, para pular até o primeiro artigo de cada um.
const indice = computed(() => {
  const itens = []
  const vistos = new Set()
  for (const artigo of artigos.value) {
    const e = artigo.estrutura || {}
    for (const nivel of ['livro', 'titulo', 'capitulo']) {
      if (!e[nivel]) continue
      const chave = NIVEIS.slice(0, NIVEIS.indexOf(nivel) + 1).map((n) => e[n]).join('|')
      if (vistos.has(chave)) continue
      vistos.add(chave)
      itens.push({ chave, nivel, rotulo: e[nivel], nome: e[`${nivel}_nome`], artigo: artigo.numero })
    }
  }
  return itens
})

async function irPara(numero) {
  busca.value = ''
  await nextTick()
  document.getElementById(`art-${numero}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const dataDaVersao = computed(() => {
  const v = versao.value
  if (!v?.data_versao) return null
  return v.data_versao_precisao === 'ano' ? v.data_versao.slice(0, 4) : v.data_versao.split('-').reverse().join('/')
})
const revogados = computed(() => artigos.value.filter((a) => a.revogado).length)
</script>

<template>
  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <template v-if="norma">
    <router-link :to="{ name: 'normas' }" class="voltar-topo"><i class="pi pi-arrow-left"></i>Biblioteca de normas</router-link>
    <div class="pagina-cabecalho">
      <div>
        <h1>{{ norma.nome }}</h1>
        <p class="mono">{{ norma.chave }}</p>
        <p v-if="norma.editais.length && !eAluno">
          Citada em:
          <router-link v-for="(edital, i) in norma.editais" :key="edital.id" :to="{ name: 'fontes', params: { id: edital.id } }">
            {{ nomeDoEdital(edital) }}<template v-if="i < norma.editais.length - 1">, </template>
          </router-link>
        </p>
      </div>
    </div>

    <section class="painel fonte">
      <div class="painel__cabecalho"><h2>Fonte oficial e texto</h2></div>
      <FonteDaNorma
        :norma="norma"
        :ocupado="ocupado"
        :somente-leitura="!podeEditar"
        class="painel__corpo"
        @buscar-url="aoBuscarUrl"
        @definir-url="aoDefinirUrl"
        @enviar-versao="aoEnviarVersao"
        @processar-versao="aoProcessarVersao"
      />
    </section>

    <Message v-if="norma.versoes.length === 0" severity="warn" :closable="false">
      Esta norma ainda não tem texto.<template v-if="podeEditar"> Envie o arquivo em "Fonte oficial e texto", acima.</template>
    </Message>

    <template v-else>
      <div class="barra">
        <Select
          v-if="opcoesDeVersao.length > 1"
          :model-value="versaoId"
          :options="opcoesDeVersao"
          option-label="rotulo"
          option-value="id"
          @update:model-value="escolherVersao"
        />
        <span v-if="versao" class="versao">
          <b v-if="versao.processada_em">{{ versao.artigos_total }} artigos</b>
          <template v-if="revogados"> · {{ revogados }} revogados</template>
          <template v-if="dataDaVersao"> · texto de {{ dataDaVersao }}</template>
          · <a :href="urlDoArquivoDaVersao(norma.id, versao.id)" target="_blank" rel="noopener">arquivo original</a>
        </span>
        <InputText v-model="busca" placeholder="Artigo (313-A) ou palavra" class="busca" />
      </div>
      <Message v-for="aviso in versao?.avisos || []" :key="aviso" severity="warn" :closable="false">{{ aviso }}</Message>
      <Message v-if="versao && !versao.processada_em" severity="warn" :closable="false">
        Esta versão ainda não foi dividida em artigos.<template v-if="podeEditar"> Use "processar de novo" em "Fonte oficial e texto", acima.</template>
      </Message>

      <!-- Sem títulos nem capítulos (lei curta), não há índice: o texto ocupa a largura toda. -->
      <div class="grade" :class="{ 'grade--sem-indice': !indice.length }">
        <nav v-if="indice.length" class="painel indice" aria-label="Estrutura da norma">
          <div class="painel__cabecalho"><h2>Estrutura</h2></div>
          <ul>
            <li v-for="item in indice" :key="item.chave" :class="`indice--${item.nivel}`">
              <button type="button" @click="irPara(item.artigo)">
                <b>{{ item.rotulo }}</b> <span v-if="item.nome">{{ item.nome }}</span>
              </button>
            </li>
          </ul>
        </nav>

        <section class="documento texto" :class="{ 'texto--carregando': carregandoArtigos }">
          <p v-if="!carregandoArtigos && visiveis.length === 0 && artigos.length" class="pendente">
            Nenhum artigo com "{{ busca }}".
          </p>
          <template v-for="{ artigo, cabecalhos } in comCabecalhos" :key="artigo.id">
            <h3 v-for="cabecalho in cabecalhos" :key="cabecalho.nivel" class="cabecalho" :class="`cabecalho--${cabecalho.nivel}`">
              {{ cabecalho.rotulo }}<template v-if="cabecalho.nome"> · {{ cabecalho.nome }}</template>
            </h3>
            <article :id="`art-${artigo.numero}`" class="artigo" :class="{ 'artigo--revogado': artigo.revogado }">
              <Tag v-if="artigo.revogado" value="revogado" severity="danger" class="artigo__marca" />
              <p class="artigo__texto">
                <template v-for="(parte, i) in partesDoArtigo(artigo.texto_bruto)" :key="i">
                  <span v-if="parte.nota" class="nota">{{ parte.texto }}</span>
                  <template v-else>{{ parte.texto }}</template>
                </template>
              </p>
              <details v-if="artigo.redacao_anterior" class="anterior">
                <summary>redação anterior</summary>
                <p>{{ artigo.redacao_anterior }}</p>
              </details>
            </article>
          </template>
        </section>
      </div>
    </template>
  </template>
</template>

<style scoped>
.pagina-cabecalho p {
  margin: 0.2rem 0 0;
  overflow-wrap: anywhere;
}
.fonte {
  margin-bottom: 1.25rem;
}
.barra {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1rem;
}
.versao {
  color: var(--muted-foreground);
}
.busca {
  margin-left: auto;
  width: 18rem;
}
.grade {
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}
.grade--sem-indice {
  grid-template-columns: minmax(0, 1fr);
}
.indice {
  position: sticky;
  top: 1rem;
  max-height: calc(100vh - 2rem);
  overflow: auto;
}
.indice ul {
  margin: 0;
  padding: 0.5rem;
  list-style: none;
}
.indice button {
  border: 0;
  background: none;
  text-align: left;
  font: inherit;
  font-size: 0.8rem;
  padding: 0.2rem 0.3rem;
  cursor: pointer;
  color: var(--foreground);
  width: 100%;
  border-radius: 0.25rem;
}
.indice button:hover {
  background: var(--muted);
}
.indice--titulo {
  padding-left: 0.6rem;
}
.indice--capitulo {
  padding-left: 1.2rem;
}
.indice--capitulo button {
  color: var(--muted-foreground);
}
.texto {
  white-space: normal;
  min-height: 300px;
}
.texto--carregando {
  opacity: 0.5;
}
.cabecalho {
  margin: 1.4rem 0 0.4rem;
  font-family: var(--font-sans);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted-foreground);
}
.cabecalho--livro,
.cabecalho--parte {
  font-size: 0.95rem;
  color: var(--foreground);
}
.artigo {
  margin: 0 0 0.9rem;
  scroll-margin-top: 1rem;
}
.artigo__texto {
  margin: 0;
  white-space: pre-wrap;
}
.artigo__marca {
  float: right;
  margin-left: 0.5rem;
}
.artigo--revogado .artigo__texto {
  color: var(--muted-foreground);
}
.nota {
  font-size: 0.8em;
  color: var(--muted-foreground);
}
.anterior {
  margin-top: 0.3rem;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.anterior summary {
  cursor: pointer;
}
.anterior p {
  margin: 0.3rem 0 0;
  text-decoration: line-through;
  white-space: pre-wrap;
}
.pendente {
  color: var(--muted-foreground);
}
@media (max-width: 900px) {
  .grade {
    grid-template-columns: minmax(0, 1fr);
  }
  .indice {
    position: static;
    max-height: 16rem;
  }
}
</style>
