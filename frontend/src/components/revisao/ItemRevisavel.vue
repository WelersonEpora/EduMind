<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import TrechoCitado from '../edital/TrechoCitado.vue'
import BotoesDeRevisao from './BotoesDeRevisao.vue'
import TextoEditavel from './TextoEditavel.vue'
import NormaRevisavel from './NormaRevisavel.vue'

// Um nó da árvore na revisão: aprovar ou rejeitar, corrigir o texto, corrigir as normas; na disciplina, aprovar de
// uma vez os itens verificados. `visiveis` (ids) aplica o filtro "só pendentes".
const props = defineProps({
  item: { type: Object, required: true },
  filhos: { type: Map, required: true },
  visiveis: { type: Set, required: true },
  desativado: { type: Boolean, default: false }
})
const emit = defineEmits(['ver-trecho', 'revisar', 'revisar-norma', 'aprovar-verificados'])

const meusFilhos = computed(() => (props.filhos.get(props.item.id) || []).filter((filho) => props.visiveis.has(filho.id)))
</script>

<template>
  <li class="item" :class="[`item--${item.nivel}`, `item--${item.status}`]">
    <div class="linha">
      <BotoesDeRevisao :status="item.status" :desativado="desativado" @mudar="emit('revisar', item, { status: $event })" />
      <TextoEditavel
        class="linha__texto"
        :texto="item.texto"
        :editado="item.editado"
        :desativado="desativado"
        @salvar="emit('revisar', item, { texto: $event })"
      />
      <TrechoCitado :item="item" @ver="emit('ver-trecho', $event)" />
      <Button
        v-if="item.nivel === 'disciplina'"
        label="Aprovar verificados"
        icon="pi pi-check-circle"
        size="small"
        text
        :disabled="desativado"
        title="Aprova a disciplina e os itens dela em rascunho com o trecho verificado e sem pendência nas normas"
        @click="emit('aprovar-verificados', item)"
      />
    </div>
    <ul v-if="item.normas.length" class="normas">
      <NormaRevisavel
        v-for="norma in item.normas"
        :key="norma.id"
        :norma="norma"
        :desativado="desativado"
        @salvar="emit('revisar-norma', norma, $event)"
      />
    </ul>
    <ul v-if="meusFilhos.length" class="filhos">
      <ItemRevisavel
        v-for="filho in meusFilhos"
        :key="filho.id"
        :item="filho"
        :filhos="filhos"
        :visiveis="visiveis"
        :desativado="desativado"
        @ver-trecho="emit('ver-trecho', $event)"
        @revisar="(...args) => emit('revisar', ...args)"
        @revisar-norma="(...args) => emit('revisar-norma', ...args)"
        @aprovar-verificados="emit('aprovar-verificados', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.item {
  list-style: none;
}
.linha {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 0.25rem 0.4rem;
  border-left: 3px solid transparent;
  border-radius: 0.25rem;
}
.linha__texto {
  flex: 1;
  min-width: 0;
  padding-top: 0.3rem;
}
.linha :deep(.trecho) {
  margin-top: 0.3rem;
}
.item--aprovado > .linha {
  border-left-color: var(--positive);
  background: color-mix(in oklch, var(--positive) 6%, transparent);
}
.item--rejeitado > .linha {
  border-left-color: var(--negative);
  background: color-mix(in oklch, var(--negative) 5%, transparent);
}
.item--rejeitado > .linha .linha__texto {
  text-decoration: line-through;
  color: var(--muted-foreground);
}
.item--bloco > .linha .linha__texto {
  font-weight: 700;
}
.item--disciplina > .linha .linha__texto {
  font-weight: 600;
}
.normas {
  margin: 0 0 0.3rem 4.6rem;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}
.filhos {
  margin: 0;
  padding-left: 1.4rem;
  border-left: 1px solid var(--border);
  margin-left: 1rem;
}
</style>
