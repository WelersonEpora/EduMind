<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import { enviarEdital } from '../services/editais.service'
import { useEditais, nomeDoEdital } from '../composables/useEditais'
import { formatarDataHora, STATUS_EDITAL } from '../utils/formatar'

const router = useRouter()
const toast = useToast()
const { editais, carregando, erro, recarregar } = useEditais()

const busca = ref('')
const enviando = ref(false)
const arrastando = ref(false)
const inputArquivo = ref(null)

const filtrados = computed(() => {
  const termo = busca.value.trim().toLowerCase()
  if (!termo) return editais.value
  return editais.value.filter((e) =>
    [e.arquivo_nome, e.banca, e.orgao, e.cargo].filter(Boolean).join(' ').toLowerCase().includes(termo)
  )
})

// As quatro etapas de um edital, para a barra de progresso do cartão. Por enquanto só a primeira
// (texto por página) existe; as outras chegam nas próximas etapas.
const ETAPAS = ['Edital', 'Revisão', 'Fontes', 'Cobertura']

async function enviar(arquivo) {
  if (!arquivo) return
  enviando.value = true
  try {
    const { edital, jaExistia } = await enviarEdital(arquivo)
    await recarregar()
    toast.add(
      jaExistia
        ? { severity: 'info', summary: 'Este PDF já foi enviado', detail: 'Abrindo o edital existente.', life: 4000 }
        : { severity: 'success', summary: 'Edital recebido', detail: `${edital.total_paginas} páginas lidas.`, life: 4000 }
    )
    router.push({ name: 'edital', params: { id: edital.id } })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível enviar o edital', detail: e.message, life: 8000 })
  } finally {
    enviando.value = false
    if (inputArquivo.value) inputArquivo.value.value = ''
  }
}

function aoSoltar(evento) {
  arrastando.value = false
  enviar(evento.dataTransfer.files[0])
}
</script>

<template>
  <div class="pagina-cabecalho">
    <div>
      <h1>Editais</h1>
      <p>
        Cada edital tem sua própria árvore de conteúdo, revisão e relatório de cobertura. Envie o PDF para começar: o
        EduMind guarda o arquivo original e o texto de cada página.
      </p>
    </div>
  </div>

  <div class="barra">
    <InputText v-model="busca" type="search" placeholder="Buscar por arquivo, órgão, cargo ou banca" class="barra__busca" />
    <span class="mono barra__contagem">{{ filtrados.length }} de {{ editais.length }} editais</span>
  </div>

  <Message v-if="erro" severity="error" :closable="false" class="aviso">{{ erro }}</Message>

  <div class="cartoes">
    <label
      class="cartao cartao--novo"
      :class="{ 'cartao--arrastando': arrastando }"
      @dragover.prevent="arrastando = true"
      @dragleave="arrastando = false"
      @drop.prevent="aoSoltar"
    >
      <input ref="inputArquivo" type="file" accept="application/pdf" hidden :disabled="enviando" @change="enviar($event.target.files[0])" />
      <template v-if="enviando">
        <ProgressSpinner style="width: 36px; height: 36px" stroke-width="5" />
        <span>Lendo o texto de cada página…</span>
      </template>
      <template v-else>
        <strong><i class="pi pi-plus"></i> Novo edital</strong>
        <span>Arraste o PDF aqui ou clique para escolher</span>
      </template>
    </label>

    <router-link v-for="edital in filtrados" :key="edital.id" :to="{ name: 'edital', params: { id: edital.id } }" class="cartao">
      <div class="cartao__topo">
        <span class="rotulo">{{ edital.banca || 'banca a extrair' }}</span>
        <Tag :value="STATUS_EDITAL[edital.status].rotulo" :severity="STATUS_EDITAL[edital.status].severidade" />
      </div>
      <h3>{{ nomeDoEdital(edital) }}</h3>
      <div class="cartao__fatos">
        <span><b>{{ edital.total_paginas }}</b> páginas</span>
        <span>enviado em <b>{{ formatarDataHora(edital.created_at) }}</b></span>
      </div>
      <div class="etapas">
        <div v-for="(etapa, k) in ETAPAS" :key="etapa" :class="{ 'etapas__feita': k === 0 }">
          <i><b :style="{ width: k === 0 ? '100%' : '0%' }"></b></i>{{ etapa }}
        </div>
      </div>
    </router-link>
  </div>

  <p v-if="!carregando && !erro && editais.length === 0" class="vazio">
    Nenhum edital ainda. Envie o primeiro PDF pelo cartão “Novo edital”.
  </p>
</template>

<style scoped>
.barra {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.barra__busca {
  flex: 1 1 240px;
  max-width: 380px;
}
.barra__contagem {
  color: var(--muted-foreground);
}
.aviso {
  margin-bottom: 1rem;
}
.cartoes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 1rem;
}
.cartao {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  display: grid;
  gap: 0.75rem;
  color: var(--foreground);
  text-decoration: none;
  transition: border-color 0.15s;
}
.cartao:hover {
  border-color: var(--primary);
}
.cartao h3 {
  font-size: 1rem;
  overflow-wrap: anywhere;
}
.cartao__topo {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: flex-start;
}
.cartao__fatos {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.cartao__fatos b {
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
}
.cartao--novo {
  border-style: dashed;
  background: var(--muted);
  place-content: center;
  justify-items: center;
  text-align: center;
  color: var(--muted-foreground);
  min-height: 170px;
  cursor: pointer;
}
.cartao--novo strong {
  color: var(--primary);
  font-size: 1rem;
}
.cartao--arrastando {
  border-color: var(--primary);
  background: var(--accent);
}
.etapas {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.3rem;
}
.etapas div {
  display: grid;
  gap: 0.3rem;
  font-size: 0.7rem;
  color: var(--muted-foreground);
}
.etapas i {
  display: block;
  height: 4px;
  border-radius: 2px;
  background: var(--muted);
  overflow: hidden;
}
.etapas b {
  display: block;
  height: 100%;
  background: var(--primary);
}
.etapas__feita b {
  background: var(--positive);
}
.vazio {
  color: var(--muted-foreground);
  margin-top: 1.5rem;
}
</style>
