<script setup>
import { computed } from 'vue'
import TrechoCitado from './TrechoCitado.vue'
import { nomeDaNorma, resumoDosArtigos } from '../../utils/normas'

// Um nó da árvore do conteúdo programático, com as normas citadas e os filhos. Bloco e disciplina abrem e fecham.
const props = defineProps({
  item: { type: Object, required: true },
  // parent_id -> filhos, na ordem
  filhos: { type: Map, required: true }
})
const emit = defineEmits(['ver-trecho'])

const meusFilhos = computed(() => props.filhos.get(props.item.id) || [])
const recolhivel = computed(() => ['bloco', 'disciplina'].includes(props.item.nivel) && meusFilhos.value.length > 0)

</script>

<template>
  <li class="item" :class="`item--${item.nivel}`">
    <details v-if="recolhivel" open>
      <summary>
        <span class="texto">{{ item.texto }}</span>
        <TrechoCitado :item="item" @ver="emit('ver-trecho', $event)" />
      </summary>
      <ul class="filhos">
        <ItemDaArvore
          v-for="filho in meusFilhos"
          :key="filho.id"
          :item="filho"
          :filhos="filhos"
          @ver-trecho="emit('ver-trecho', $event)"
        />
      </ul>
    </details>

    <template v-else>
      <div class="linha">
        <span class="texto">{{ item.texto }}</span>
        <TrechoCitado :item="item" @ver="emit('ver-trecho', $event)" />
      </div>
      <ul v-if="item.normas.length" class="normas">
        <li v-for="norma in item.normas" :key="norma.id" class="norma">
          <i class="pi pi-book" />
          <span class="norma__nome">{{ nomeDaNorma(norma) }}</span>
          <span class="mono">· {{ resumoDosArtigos(norma) }}</span>
          <span v-if="norma.artigos_texto && !norma.artigos_texto_verificado" class="aviso aviso--erro" :title="norma.artigos_texto">
            <i class="pi pi-times-circle" /> trecho dos artigos não achado no edital
          </span>
          <span
            v-if="norma.artigos?.avisos?.length"
            class="aviso"
            :title="`Citação no edital: “${norma.artigos_texto}”`"
          >
            <i class="pi pi-exclamation-triangle" /> cita partes que não são artigos (título, capítulo, seção): conferir
          </span>
        </li>
      </ul>
      <ul v-if="meusFilhos.length" class="filhos">
        <ItemDaArvore
          v-for="filho in meusFilhos"
          :key="filho.id"
          :item="filho"
          :filhos="filhos"
          @ver-trecho="emit('ver-trecho', $event)"
        />
      </ul>
    </template>
  </li>
</template>

<style scoped>
.item {
  list-style: none;
}
summary {
  cursor: pointer;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.3rem 0;
}
summary::marker,
summary::-webkit-details-marker {
  color: var(--muted-foreground);
}
.item--bloco > details > summary .texto {
  font-weight: 700;
}
.item--disciplina > details > summary .texto {
  font-weight: 600;
}
.linha {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.25rem 0;
}
.texto {
  overflow-wrap: anywhere;
}
.filhos {
  margin: 0;
  padding-left: 1.1rem;
  border-left: 1px solid var(--border);
}
.normas {
  margin: 0 0 0.35rem;
  padding-left: 0.25rem;
  display: grid;
  gap: 0.2rem;
}
.norma {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.norma .pi-book {
  font-size: 0.75rem;
}
.norma__nome {
  color: var(--foreground);
  font-weight: 600;
}
.aviso {
  font-size: 0.75rem;
  color: var(--warning-foreground);
  background: color-mix(in oklch, var(--warning) 22%, transparent);
  border-radius: 999px;
  padding: 0 0.5rem;
  cursor: help;
}
.aviso--erro {
  color: var(--negative);
  background: color-mix(in oklch, var(--negative) 12%, transparent);
}
</style>
