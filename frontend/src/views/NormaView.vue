<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { buscarArtigosDaVersao, buscarNorma, urlDoArquivoDaVersao } from '../services/editais.service'
import { nomeDoEdital } from '../composables/useEditais'
import { formatarDataHora } from '../utils/formatar'

// Uma norma da biblioteca e o texto de uma versão dividido em artigos, como documento: os cabeçalhos da estrutura
// (título, capítulo, seção), o texto vigente, as notas de redação, a marca de revogado e a redação anterior tachada.
const route = useRoute()
const router = useRouter()

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
}

watch(() => route.params.id, carregarNorma, { immediate: true })
watch(() => [norma.value?.id, versaoId.value], carregarArtigos)

function escolherVersao(id) {
  router.replace({ query: { ...route.query, versao: id } })
}

const NIVEIS = ['parte', 'livro', 'titulo', 'capitulo', 'secao', 'subsecao']

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

// Notas de redação ficam em cinza no texto; o resto do texto, como está na página oficial.
function partes(texto) {
  return texto.split(/(\([^()]*(?:\([^()]*\)[^()]*)*\))/g).map((pedaco) => ({
    texto: pedaco,
    nota: /^\((Reda[çc][ãa]o dada|Inclu[íi]d|Revogad|Renumerad|Acrescid|Vide|Vig[êe]ncia|Regulamento|Produ[çc][ãa]o|Promulga|VETADO|Vetad)/i.test(pedaco)
  }))
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
    <div class="pagina-cabecalho">
      <div>
        <h1>{{ norma.nome }}</h1>
        <p class="mono">{{ norma.chave }}</p>
        <p v-if="norma.url_oficial">
          Fonte oficial: <a :href="norma.url_oficial" target="_blank" rel="noopener">{{ norma.url_oficial }}</a>
        </p>
        <p v-if="norma.editais.length">
          Citada em:
          <router-link v-for="(edital, i) in norma.editais" :key="edital.id" :to="{ name: 'fontes', params: { id: edital.id } }">
            {{ nomeDoEdital(edital) }}<template v-if="i < norma.editais.length - 1">, </template>
          </router-link>
        </p>
      </div>
      <router-link to="/normas" class="voltar">← Biblioteca</router-link>
    </div>

    <Message v-if="norma.versoes.length === 0" severity="warn" :closable="false">
      Esta norma ainda não tem texto. Envie o arquivo nas Fontes de um edital que a cite.
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
        Esta versão ainda não foi dividida em artigos. Use "processar de novo" nas Fontes.
      </Message>

      <div class="grade">
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
                <template v-for="(parte, i) in partes(artigo.texto_bruto)" :key="i">
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
.voltar {
  white-space: nowrap;
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
