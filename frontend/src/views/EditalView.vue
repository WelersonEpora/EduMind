<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import { buscarEdital, buscarPagina, urlDoArquivo } from '../services/editais.service'
import { nomeDoEdital } from '../composables/useEditais'
import { formatarBytes, formatarDataHora, STATUS_EDITAL } from '../utils/formatar'

const route = useRoute()

const edital = ref(null)
const erro = ref(null)
const numeroPagina = ref(1)
const pagina = ref(null)
const carregandoPagina = ref(false)

async function carregar(id) {
  edital.value = null
  erro.value = null
  try {
    edital.value = await buscarEdital(id)
    numeroPagina.value = 1
    await carregarPagina()
  } catch (e) {
    erro.value = e.message
  }
}

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
          <div class="painel__cabecalho"><h2>Metadados e conteúdo programático</h2></div>
          <div class="painel__corpo pendente">
            Banca, órgão, cargo, data de publicação, número de questões, blocos, regras de corte, prova discursiva e a
            árvore do conteúdo serão extraídos pela IA na <b>etapa 1b</b>, cada item com o trecho literal e a página.
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
          <div class="documento texto-pagina" :class="{ 'texto-pagina--carregando': carregandoPagina }">
            <template v-if="pagina && pagina.texto">{{ pagina.texto }}</template>
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
@media (max-width: 1080px) {
  .grade {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
