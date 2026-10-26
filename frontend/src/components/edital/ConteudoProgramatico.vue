<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import ItemDaArvore from './ItemDaArvore.vue'

// Árvore do conteúdo programático extraída pela IA (etapa 1b-2). Recebe os itens em lista, na ordem de leitura.
// Blocos e disciplinas abrem e fecham (<details>); os botões no alto abrem ou fecham todos de uma vez.
const props = defineProps({
  itens: { type: Array, required: true }
})
const emit = defineEmits(['ver-trecho'])

const filhos = computed(() => {
  const mapa = new Map()
  for (const item of props.itens) {
    if (!mapa.has(item.parent_id)) mapa.set(item.parent_id, [])
    mapa.get(item.parent_id).push(item)
  }
  return mapa
})
const blocos = computed(() => filhos.value.get(null) || [])
const verificados = computed(() => props.itens.filter((item) => item.verificado).length)
const normas = computed(() => props.itens.flatMap((item) => item.normas))

const raiz = ref(null)
function abrirTodos(aberto) {
  raiz.value?.querySelectorAll('details').forEach((d) => (d.open = aberto))
}
</script>

<template>
  <div class="conteudo">
    <div class="topo">
      <p class="resumo">
        Extraído pela IA do texto do edital; <b>{{ verificados }} de {{ itens.length }}</b> trechos conferidos na página
        citada · <b>{{ normas.length }}</b> {{ normas.length === 1 ? 'norma citada' : 'normas citadas' }}. Os artigos são
        expandidos por código a partir do trecho do edital.
      </p>
      <div class="botoes">
        <Button label="Expandir tudo" icon="pi pi-angle-double-down" size="small" text @click="abrirTodos(true)" />
        <Button label="Recolher tudo" icon="pi pi-angle-double-up" size="small" text @click="abrirTodos(false)" />
      </div>
    </div>
    <ul ref="raiz" class="raiz">
      <ItemDaArvore
        v-for="bloco in blocos"
        :key="bloco.id"
        :item="bloco"
        :filhos="filhos"
        @ver-trecho="emit('ver-trecho', $event)"
      />
    </ul>
  </div>
</template>

<style scoped>
.conteudo {
  padding: 1rem;
  display: grid;
  gap: 0.75rem;
}
.topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}
.resumo {
  margin: 0;
  flex: 1 1 30rem;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.botoes {
  display: flex;
  gap: 0.25rem;
}
.raiz {
  margin: 0;
  padding: 0;
  display: grid;
}
</style>
