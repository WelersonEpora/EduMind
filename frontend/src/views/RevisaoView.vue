<script setup>
import { computed, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useEditais } from '../composables/useEditais'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import LeitorDePaginas from '../components/edital/LeitorDePaginas.vue'
import MetadadosRevisaveis from '../components/revisao/MetadadosRevisaveis.vue'
import ItemRevisavel from '../components/revisao/ItemRevisavel.vue'
import { buscarConteudo, buscarEdital, revisarItem, revisarMetadado, revisarNorma } from '../services/editais.service'

// Revisão do orientador (etapa 1c): cada item extraído pela IA é aprovado, rejeitado ou corrigido, conferindo o
// trecho citado no texto da página ao lado.
const route = useRoute()
const toast = useToast()
// A lista da equipe traz o andamento (pendentes nas abas e situação): cada alteração aqui o muda.
const { recarregar: recarregarEditais } = useEditais()

const edital = ref(null)
const conteudo = ref([])
const erro = ref(null)
// shallowRef: guarda o objeto como veio do selo, para a comparação abaixo bater também com o trecho da norma (um
// objeto simples, que um ref embrulharia num proxy).
const trechoAberto = shallowRef(null)
// Clicar no selo do trecho que já está aberto fecha o painel; em outro selo, troca o trecho.
function alternarTrecho(item) {
  trechoAberto.value = trechoAberto.value === item ? null : item
}
const ocupado = ref(false)
const soPendentes = ref(false)

async function carregar(id) {
  edital.value = null
  conteudo.value = []
  erro.value = null
  trechoAberto.value = null
  try {
    edital.value = await buscarEdital(id)
    if (edital.value.status === 'extraido') conteudo.value = await buscarConteudo(id)
  } catch (e) {
    erro.value = e.message
  }
}

watch(() => route.params.id, carregar, { immediate: true })

const filhos = computed(() => {
  const mapa = new Map()
  for (const item of conteudo.value) {
    if (!mapa.has(item.parent_id)) mapa.set(item.parent_id, [])
    mapa.get(item.parent_id).push(item)
  }
  return mapa
})

// Com "só pendentes", fica visível o item em rascunho e o caminho até ele (pais já revisados continuam aparecendo).
const visiveis = computed(() => {
  if (!soPendentes.value) return new Set(conteudo.value.map((item) => item.id))
  const ids = new Set()
  const marcar = (item) => {
    const algumFilho = (filhos.value.get(item.id) || []).map(marcar).some(Boolean)
    const visivel = item.status === 'rascunho' || algumFilho
    if (visivel) ids.add(item.id)
    return visivel
  }
  ;(filhos.value.get(null) || []).forEach(marcar)
  return ids
})
const blocos = computed(() => (filhos.value.get(null) || []).filter((bloco) => visiveis.value.has(bloco.id)))

// Progresso: os itens da árvore e os itens dos metadados.
const itensDosMetadados = computed(() => {
  const m = edital.value?.metadados
  if (!m) return []
  return [
    ...Object.values(m.campos).filter(Boolean),
    ...m.blocos.flatMap((bloco) => [bloco, ...bloco.disciplinas]),
    ...m.regras_de_corte,
    ...(m.discursiva ? [m.discursiva] : [])
  ]
})
const progresso = computed(() => {
  const todos = [...conteudo.value, ...itensDosMetadados.value]
  const conta = (status) => todos.filter((item) => (item.status || 'rascunho') === status).length
  return { total: todos.length, aprovados: conta('aprovado'), rejeitados: conta('rejeitado'), pendentes: conta('rascunho') }
})
const percentual = (n) => (progresso.value.total ? `${(100 * n) / progresso.value.total}%` : '0%')

async function executar(acao, mensagemDeErro) {
  ocupado.value = true
  try {
    const resultado = await acao()
    recarregarEditais()
    return resultado
  } catch (e) {
    toast.add({ severity: 'error', summary: mensagemDeErro, detail: e.message, life: 6000 })
    return null
  } finally {
    ocupado.value = false
  }
}

function substituirItem(atualizado) {
  const i = conteudo.value.findIndex((item) => item.id === atualizado.id)
  if (i >= 0) conteudo.value[i] = { ...conteudo.value[i], ...atualizado }
}

// Aprovar ou desaprovar um nó com filhos muda também os filhos (cascata no backend): aí a árvore vem de novo.
async function aoRevisarItem(item, alteracoes) {
  const atualizado = await executar(() => revisarItem(edital.value.id, item.id, alteracoes), 'Não foi possível salvar')
  if (!atualizado) return
  if (alteracoes.status && filhos.value.has(item.id)) conteudo.value = await buscarConteudo(edital.value.id)
  else substituirItem(atualizado)
}

async function aoRevisarNorma(norma, alteracoes) {
  const atualizado = await executar(() => revisarNorma(edital.value.id, norma.id, alteracoes), 'Não foi possível salvar a norma')
  if (atualizado) substituirItem(atualizado)
}

async function aoRevisarMetadado(caminho, alteracoes) {
  const metadados = await executar(() => revisarMetadado(edital.value.id, caminho, alteracoes), 'Não foi possível salvar')
  if (metadados) edital.value = { ...edital.value, metadados }
}
</script>

<template>
  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <template v-if="edital">
    <div class="pagina-cabecalho">
      <p>
        Aprove, rejeite ou corrija cada item extraído pela IA. Aprovar um item aprova também o que está dentro dele, e
        clicar de novo desfaz. Clique no selo da página para conferir o trecho citado no texto do edital.
      </p>
    </div>

    <Message v-if="edital.status !== 'extraido'" severity="info" :closable="false">
      A revisão fica disponível quando a extração com IA termina. Use "Extrair com IA" na visão geral do edital.
    </Message>

    <div v-else class="grade" :class="{ 'grade--com-leitor': trechoAberto }">
      <div class="coluna">
        <section class="painel">
          <div class="painel__cabecalho">
            <h2>Progresso</h2>
            <label class="filtro">
              <Checkbox v-model="soPendentes" binary input-id="so-pendentes" />
              <span>Só pendentes na árvore</span>
            </label>
          </div>
          <div class="painel__corpo progresso">
            <div class="barra" role="img" :aria-label="`${progresso.aprovados} aprovados, ${progresso.rejeitados} rejeitados, ${progresso.pendentes} pendentes`">
              <span class="barra__aprovados" :style="{ width: percentual(progresso.aprovados) }" />
              <span class="barra__rejeitados" :style="{ width: percentual(progresso.rejeitados) }" />
            </div>
            <p class="legenda">
              <span><i class="ponto ponto--aprovado" /> {{ progresso.aprovados }} aprovados</span>
              <span><i class="ponto ponto--rejeitado" /> {{ progresso.rejeitados }} rejeitados</span>
              <span><i class="ponto" /> {{ progresso.pendentes }} pendentes</span>
              <span class="mono">de {{ progresso.total }}</span>
            </p>
          </div>
        </section>

        <section v-if="edital.metadados" class="painel">
          <div class="painel__cabecalho"><h2>Dados do concurso</h2></div>
          <div class="painel__corpo">
            <MetadadosRevisaveis
              :metadados="edital.metadados"
              :desativado="ocupado"
              @ver-trecho="alternarTrecho"
              @revisar="aoRevisarMetadado"
            />
          </div>
        </section>

        <section class="painel">
          <div class="painel__cabecalho"><h2>Conteúdo programático</h2></div>
          <div class="painel__corpo">
            <p v-if="conteudo.length === 0" class="pendente">Nenhum item extraído. Extraia de novo na visão geral do edital.</p>
            <p v-else-if="blocos.length === 0" class="pendente">Nenhum item pendente na árvore.</p>
            <ul class="arvore">
              <ItemRevisavel
                v-for="bloco in blocos"
                :key="bloco.id"
                :item="bloco"
                :filhos="filhos"
                :visiveis="visiveis"
                :desativado="ocupado"
                @ver-trecho="alternarTrecho"
                @revisar="aoRevisarItem"
                @revisar-norma="aoRevisarNorma"
              />
            </ul>
          </div>
        </section>
      </div>

      <!-- O texto da página só aparece quando alguém clica no selo de um trecho. -->
      <LeitorDePaginas
        v-if="trechoAberto"
        :edital-id="edital.id"
        :total-paginas="edital.total_paginas"
        :trecho="trechoAberto"
        @fechar-trecho="trechoAberto = null"
      />
    </div>
  </template>
</template>

<style scoped>
.grade {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}
/* Com o texto da página aberto: o conteúdo à esquerda (60%) e o painel à direita (40%). */
.grade--com-leitor {
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
}
.coluna {
  display: grid;
  gap: 1.25rem;
  min-width: 0;
}
.filtro {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  cursor: pointer;
}
.progresso {
  display: grid;
  gap: 0.5rem;
}
.barra {
  display: flex;
  height: 0.6rem;
  border-radius: 999px;
  background: var(--muted);
  overflow: hidden;
}
.barra__aprovados {
  background: var(--positive);
}
.barra__rejeitados {
  background: var(--negative);
}
.legenda {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.ponto {
  display: inline-block;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 999px;
  background: var(--muted);
  border: 1px solid var(--border);
}
.ponto--aprovado {
  background: var(--positive);
}
.ponto--rejeitado {
  background: var(--negative);
}
.arvore {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}
.pendente {
  margin: 0;
  color: var(--muted-foreground);
}
/* Sem espaço para duas colunas, o painel cobre a tela (ver LeitorDePaginas). */
@media (max-width: 1080px) {
  .grade--com-leitor {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
