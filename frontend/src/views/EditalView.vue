<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import MetadadosEdital from '../components/edital/MetadadosEdital.vue'
import { buscarEdital, buscarPagina, iniciarExtracao, urlDoArquivo } from '../services/editais.service'
import { nomeDoEdital } from '../composables/useEditais'
import { formatarBytes, formatarDataHora, STATUS_EDITAL } from '../utils/formatar'

const route = useRoute()
const toast = useToast()

const edital = ref(null)
const erro = ref(null)
const numeroPagina = ref(1)
const pagina = ref(null)
const carregandoPagina = ref(false)
// Item cujo trecho está aberto no leitor (clique no selo de um metadado).
const trechoAberto = ref(null)
const iniciando = ref(false)

// Enquanto a extração roda no backend, consulta o status a cada poucos segundos.
const INTERVALO_DE_CONSULTA_MS = 3000
let consulta = null

function pararConsulta() {
  clearInterval(consulta)
  consulta = null
}

function acompanharExtracao() {
  if (consulta || edital.value?.status !== 'extraindo') return
  consulta = setInterval(async () => {
    try {
      const atual = await buscarEdital(edital.value.id)
      if (atual.status === 'extraindo') return
      pararConsulta()
      edital.value = atual
      if (atual.status === 'extraido') {
        toast.add({ severity: 'success', summary: 'Metadados extraídos', detail: 'Confira os trechos citados.', life: 5000 })
      }
    } catch (e) {
      pararConsulta()
      erro.value = e.message
    }
  }, INTERVALO_DE_CONSULTA_MS)
}

async function carregar(id) {
  pararConsulta()
  edital.value = null
  erro.value = null
  trechoAberto.value = null
  try {
    edital.value = await buscarEdital(id)
    numeroPagina.value = 1
    await carregarPagina()
    acompanharExtracao()
  } catch (e) {
    erro.value = e.message
  }
}

async function extrair() {
  const confirmado =
    !edital.value.metadados || window.confirm('Extrair de novo? Os metadados atuais serão substituídos pelo novo resultado.')
  if (!confirmado) return
  iniciando.value = true
  try {
    edital.value = await iniciarExtracao(edital.value.id)
    acompanharExtracao()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível extrair', detail: e.message, life: 6000 })
  } finally {
    iniciando.value = false
  }
}

function verTrecho(item) {
  trechoAberto.value = item
  irPara(item.verificado ? item.pagina : (item.pagina_encontrada ?? item.pagina))
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Texto da página em partes, com o trecho aberto marcado quando ele está nesta página. A busca ignora diferença de
// espaços e quebras de linha; um trecho que só casa ignorando a hifenização (como a conferência do backend faz)
// aparece no quadro acima do texto, sem marca.
const partesDaPagina = computed(() => {
  const texto = pagina.value?.texto || ''
  const trecho = trechoAberto.value?.source_excerpt?.trim()
  const achado = trecho ? new RegExp(trecho.split(/\s+/).map(escaparRegex).join('\\s+')).exec(texto) : null
  if (!achado) return [{ texto, marcado: false }]
  return [
    { texto: texto.slice(0, achado.index), marcado: false },
    { texto: achado[0], marcado: true },
    { texto: texto.slice(achado.index + achado[0].length), marcado: false }
  ]
})

onBeforeUnmount(pararConsulta)

async function carregarPagina() {
  if (!edital.value) return
  carregandoPagina.value = true
  try {
    pagina.value = await buscarPagina(edital.value.id, numeroPagina.value)
  } catch (e) {
    erro.value = e.message
  } finally {
    carregandoPagina.value = false
  }
}

function irPara(numero) {
  if (!edital.value) return
  numeroPagina.value = Math.min(Math.max(1, numero || 1), edital.value.total_paginas)
  carregarPagina()
}

watch(() => route.params.id, carregar, { immediate: true })
</script>

<template>
  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <template v-if="edital">
    <div class="pagina-cabecalho">
      <div>
        <h1>{{ nomeDoEdital(edital) }}</h1>
        <p>Visão geral do edital. O texto de cada página fica guardado para conferir os trechos citados pela IA.</p>
      </div>
      <a :href="urlDoArquivo(edital.id)" target="_blank" rel="noopener">
        <Button label="Abrir PDF original" icon="pi pi-external-link" severity="secondary" outlined size="small" />
      </a>
    </div>

    <div class="grade">
      <div class="coluna">
        <section class="painel">
          <div class="painel__cabecalho">
            <h2>Arquivo</h2>
            <Tag :value="STATUS_EDITAL[edital.status].rotulo" :severity="STATUS_EDITAL[edital.status].severidade" />
          </div>
          <dl class="dados">
            <div><dt class="rotulo">Nome</dt><dd>{{ edital.arquivo_nome }}</dd></div>
            <div><dt class="rotulo">Páginas</dt><dd>{{ edital.total_paginas }}</dd></div>
            <div><dt class="rotulo">Tamanho</dt><dd>{{ formatarBytes(edital.arquivo_bytes) }}</dd></div>
            <div><dt class="rotulo">Enviado em</dt><dd>{{ formatarDataHora(edital.created_at) }}</dd></div>
          </dl>
        </section>

        <section class="painel">
          <div class="painel__cabecalho">
            <h2>Metadados</h2>
            <Button
              :label="edital.metadados ? 'Extrair de novo' : 'Extrair com IA'"
              icon="pi pi-sparkles"
              size="small"
              :severity="edital.metadados ? 'secondary' : undefined"
              :outlined="Boolean(edital.metadados)"
              :loading="iniciando || edital.status === 'extraindo'"
              @click="extrair"
            />
          </div>
          <div v-if="edital.status === 'extraindo'" class="painel__corpo pendente">
            A IA está lendo o edital. Pode levar alguns minutos; esta tela atualiza sozinha.
          </div>
          <div v-else-if="edital.status === 'erro_extracao'" class="painel__corpo">
            <Message severity="error" :closable="false">{{ edital.erro }}</Message>
          </div>
          <MetadadosEdital
            v-if="edital.metadados && edital.status !== 'extraindo'"
            :metadados="edital.metadados"
            @ver-trecho="verTrecho"
          />
          <div v-else-if="edital.status === 'texto_extraido'" class="painel__corpo pendente">
            A IA extrai banca, órgão, cargo, data de publicação, blocos e disciplinas com o número de questões, regras de
            corte e prova discursiva. Cada item traz o trecho literal e a página, conferidos por busca no texto. A árvore
            do conteúdo programático vem na <b>etapa 1b-2</b>.
          </div>
        </section>
      </div>

      <section class="painel">
        <div class="painel__cabecalho">
          <h2>Texto da página</h2>
          <div class="navegacao">
            <Button icon="pi pi-angle-left" text rounded aria-label="Página anterior" :disabled="numeroPagina <= 1" @click="irPara(numeroPagina - 1)" />
            <InputNumber
              :model-value="numeroPagina"
              :min="1"
              :max="edital.total_paginas"
              input-class="navegacao__numero"
              aria-label="Número da página"
              @update:model-value="irPara"
            />
            <span class="mono">de {{ edital.total_paginas }}</span>
            <Button
              icon="pi pi-angle-right"
              text
              rounded
              aria-label="Próxima página"
              :disabled="numeroPagina >= edital.total_paginas"
              @click="irPara(numeroPagina + 1)"
            />
          </div>
        </div>
        <div class="painel__corpo">
          <div v-if="trechoAberto" class="trecho-aberto">
            <div>
              <span class="rotulo">Trecho citado pela IA · p. {{ trechoAberto.pagina ?? '?' }}</span>
              <p>“{{ trechoAberto.source_excerpt }}”</p>
            </div>
            <Button icon="pi pi-times" text rounded size="small" aria-label="Fechar trecho" @click="trechoAberto = null" />
          </div>
          <div class="documento texto-pagina" :class="{ 'texto-pagina--carregando': carregandoPagina }">
            <template v-if="pagina && pagina.texto">
              <template v-for="(parte, i) in partesDaPagina" :key="i">
                <mark v-if="parte.marcado">{{ parte.texto }}</mark>
                <template v-else>{{ parte.texto }}</template>
              </template>
            </template>
            <span v-else-if="pagina" class="pendente">Esta página não tem texto selecionável.</span>
          </div>
        </div>
      </section>
    </div>
  </template>
</template>

<style scoped>
.grade {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.4fr);
  gap: 1.25rem;
  align-items: start;
}
.coluna {
  display: grid;
  gap: 1.25rem;
}
.dados {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}
.dados div {
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--border);
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.dados dd {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.pendente {
  color: var(--muted-foreground);
}
.navegacao {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.navegacao :deep(.navegacao__numero) {
  width: 4.5rem;
  text-align: center;
  padding: 0.3rem 0.4rem;
}
.texto-pagina {
  min-height: 420px;
  max-height: 70vh;
  overflow: auto;
}
.texto-pagina--carregando {
  opacity: 0.5;
}
.trecho-aberto {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-left: 3px solid var(--mark);
  background: var(--muted);
  border-radius: 0.35rem;
}
.trecho-aberto p {
  margin: 0.2rem 0 0;
  font-family: var(--font-doc);
}
@media (max-width: 1080px) {
  .grade {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
