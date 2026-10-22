<script setup>
import { computed } from 'vue'

// Selo da conferência de um item extraído pela IA: o trecho literal está na página citada (verificado), está em
// outra página, ou não foi achado. Clicar abre a página no leitor com o trecho.
const props = defineProps({
  item: { type: Object, required: true }
})
const emit = defineEmits(['ver'])

const situacao = computed(() => {
  const { verificado, pagina, pagina_encontrada: outra } = props.item
  if (verificado) return { classe: 'ok', icone: 'pi-check-circle', texto: `p. ${pagina}` }
  if (outra) return { classe: 'alerta', icone: 'pi-exclamation-triangle', texto: `não verificado · está na p. ${outra}` }
  return { classe: 'erro', icone: 'pi-times-circle', texto: 'não verificado' }
})
</script>

<template>
  <button
    type="button"
    class="trecho"
    :class="`trecho--${situacao.classe}`"
    :title="`Trecho citado (p. ${item.pagina ?? '?'}): “${item.source_excerpt}”`"
    @click="emit('ver', item)"
  >
    <i class="pi" :class="situacao.icone" />
    {{ situacao.texto }}
  </button>
</template>

<style scoped>
.trecho {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0.1rem 0.55rem;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.trecho .pi {
  font-size: 0.75rem;
}
.trecho--ok {
  background: color-mix(in oklch, var(--positive) 14%, transparent);
  color: var(--positive);
}
.trecho--alerta {
  background: color-mix(in oklch, var(--warning) 22%, transparent);
  color: var(--warning-foreground);
}
.trecho--erro {
  background: color-mix(in oklch, var(--negative) 12%, transparent);
  color: var(--negative);
}
.trecho:hover {
  border-color: currentColor;
}
</style>
