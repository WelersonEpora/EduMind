<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import MetadadosEdital from '../components/edital/MetadadosEdital.vue'
import ConteudoProgramatico from '../components/edital/ConteudoProgramatico.vue'
import LeitorDePaginas from '../components/edital/LeitorDePaginas.vue'
import { buscarConteudo, buscarEdital, iniciarExtracao, urlDoArquivo } from '../services/editais.service'
import { nomeDoEdital } from '../composables/useEditais'
import { formatarBytes, formatarDataHora, STATUS_EDITAL } from '../utils/formatar'

const route = useRoute()
const toast = useToast()

const edital = ref(null)
const erro = ref(null)
// Árvore do conteúdo programático (lista de itens), carregada quando a extração terminou.
const conteudo = ref([])
// Item cujo trecho está aberto no leitor (clique no selo de um metadado ou de um item da árvore).
const trechoAberto = ref(null)
const iniciando = ref(false)

async function carregarConteudo() {
  conteudo.value = edital.value?.status === 'extraido' ? await buscarConteudo(edital.value.id) : []
}

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
      await carregarConteudo()
      if (atual.status === 'extraido') {
        toast.add({ severity: 'success', summary: 'Edital extraído', detail: 'Confira os trechos citados.', life: 5000 })
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
  conteudo.value = []
  try {
    edital.value = await buscarEdital(id)
    await carregarConteudo()
    acompanharExtracao()
  } catch (e) {
    erro.value = e.message
  }
}

// Extrair de novo substitui tudo. Com revisão já feita, o backend responde 409 dizendo quantos itens se perdem, e a
// extração só segue com a confirmação explícita do orientador.
async function extrair() {
  const confirmado =
    !edital.value.metadados ||
    window.confirm('Extrair de novo? Os metadados e o conteúdo programático atuais serão substituídos pelo novo resultado.')
  if (!confirmado) return
  iniciando.value = true
  try {
    try {
      edital.value = await iniciarExtracao(edital.value.id)
    } catch (e) {
      const dados = e.response?.data?.error
      if (dados?.codigo !== 'revisao_sera_perdida') throw e
      const itens = dados.revisados === 1 ? 'item' : 'itens'
      if (!window.confirm(`${dados.message}\n\nExtrair de novo mesmo assim e perder a revisão de ${dados.revisados} ${itens}?`)) return
      edital.value = await iniciarExtracao(edital.value.id, { confirmarPerdaDaRevisao: true })
    }
    trechoAberto.value = null
    acompanharExtracao()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível extrair', detail: e.message, life: 6000 })
  } finally {
    iniciando.value = false
  }
}

onBeforeUnmount(pararConsulta)

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
      <div class="acoes">
        <router-link v-if="edital.status === 'extraido'" :to="{ name: 'revisao', params: { id: edital.id } }">
          <Button label="Revisar" icon="pi pi-check-square" size="small" />
        </router-link>
        <a :href="urlDoArquivo(edital.id)" target="_blank" rel="noopener">
          <Button label="Abrir PDF original" icon="pi pi-external-link" severity="secondary" outlined size="small" />
        </a>
      </div>
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
            @ver-trecho="trechoAberto = $event"
          />
          <div v-else-if="edital.status === 'texto_extraido'" class="painel__corpo pendente">
            A IA extrai banca, órgão, cargo, data de publicação, blocos e disciplinas com o número de questões, regras de
            corte, prova discursiva e a árvore do conteúdo programático com as normas citadas. Cada item traz o trecho
            literal e a página, conferidos por busca no texto.
          </div>
        </section>

        <section v-if="edital.status === 'extraido'" class="painel">
          <div class="painel__cabecalho"><h2>Conteúdo programático</h2></div>
          <ConteudoProgramatico v-if="conteudo.length" :itens="conteudo" @ver-trecho="trechoAberto = $event" />
          <div v-else class="painel__corpo pendente">
            Nenhum item extraído. Se este edital foi extraído antes da árvore do conteúdo existir, use "Extrair de novo"
            em Metadados.
          </div>
        </section>
      </div>

      <LeitorDePaginas
        :edital-id="edital.id"
        :total-paginas="edital.total_paginas"
        :trecho="trechoAberto"
        @fechar-trecho="trechoAberto = null"
      />
    </div>
  </template>
</template>

<style scoped>
.acoes {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.grade {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
@media (max-width: 1080px) {
  .grade {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
