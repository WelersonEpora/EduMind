<script setup>
import { computed } from 'vue'
import ItemDaArvore from './ItemDaArvore.vue'

// Árvore do conteúdo programático extraída pela IA (etapa 1b-2). Recebe os itens em lista, na ordem de leitura.
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
</script>

<template>
  <div class="conteudo">
    <p class="resumo">
      <b>{{ verificados }} de {{ itens.length }}</b> trechos conferidos na página citada ·
      <b>{{ normas.length }}</b> {{ normas.length === 1 ? 'norma citada' : 'normas citadas' }}. Os artigos são expandidos
      por código a partir do trecho do edital.
    </p>
    <ul class="raiz">
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
.resumo {
  margin: 0;
  color: var(--muted-foreground);
}
.raiz {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}
</style>
