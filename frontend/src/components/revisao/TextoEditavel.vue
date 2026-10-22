<script setup>
import { nextTick, ref } from 'vue'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'

// Texto de um item com um lápis para corrigir. Salvar emite o texto novo; quem usa decide o que fazer com ele.
const props = defineProps({
  texto: { type: String, required: true },
  editado: { type: Boolean, default: false },
  desativado: { type: Boolean, default: false }
})
const emit = defineEmits(['salvar'])

const editando = ref(false)
const rascunho = ref('')
const campo = ref(null)

async function abrir() {
  rascunho.value = props.texto
  editando.value = true
  await nextTick()
  campo.value?.$el?.focus()
}

function salvar() {
  const novo = rascunho.value.trim()
  editando.value = false
  if (novo && novo !== props.texto) emit('salvar', novo)
}
</script>

<template>
  <span v-if="!editando" class="texto">
    <span>{{ texto }}</span>
    <em v-if="editado" class="editado" title="Texto corrigido pelo orientador">editado</em>
    <button v-if="!desativado" type="button" class="lapis" aria-label="Corrigir o texto" title="Corrigir o texto" @click="abrir">
      <i class="pi pi-pencil" />
    </button>
  </span>
  <span v-else class="edicao">
    <Textarea ref="campo" v-model="rascunho" auto-resize rows="2" @keydown.esc="editando = false" @keydown.ctrl.enter="salvar" />
    <span class="edicao__botoes">
      <Button label="Salvar" size="small" @click="salvar" />
      <Button label="Cancelar" size="small" text severity="secondary" @click="editando = false" />
    </span>
  </span>
</template>

<style scoped>
.texto {
  overflow-wrap: anywhere;
}
.editado {
  margin-left: 0.4rem;
  font-size: 0.7rem;
  font-style: normal;
  font-weight: 600;
  color: var(--muted-foreground);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 0.4rem;
}
.lapis {
  border: 0;
  background: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 0 0.3rem;
  opacity: 0.5;
}
.lapis:hover {
  opacity: 1;
  color: var(--foreground);
}
.edicao {
  display: grid;
  gap: 0.35rem;
  width: 100%;
}
.edicao :deep(textarea) {
  width: 100%;
  font: inherit;
}
.edicao__botoes {
  display: flex;
  gap: 0.35rem;
}
</style>
