<script setup>
import Button from 'primevue/button'

// Aprovar, rejeitar ou voltar a rascunho um item extraído pela IA.
defineProps({
  status: { type: String, default: 'rascunho' },
  desativado: { type: Boolean, default: false }
})
const emit = defineEmits(['mudar'])
</script>

<template>
  <span class="botoes">
    <Button
      icon="pi pi-check"
      size="small"
      rounded
      :text="status !== 'aprovado'"
      severity="success"
      :disabled="desativado"
      :aria-label="status === 'aprovado' ? 'Aprovado' : 'Aprovar'"
      :title="status === 'aprovado' ? 'Aprovado' : 'Aprovar'"
      @click="emit('mudar', status === 'aprovado' ? 'rascunho' : 'aprovado')"
    />
    <Button
      icon="pi pi-times"
      size="small"
      rounded
      :text="status !== 'rejeitado'"
      severity="danger"
      :disabled="desativado"
      :aria-label="status === 'rejeitado' ? 'Rejeitado' : 'Rejeitar'"
      :title="status === 'rejeitado' ? 'Rejeitado' : 'Rejeitar'"
      @click="emit('mudar', status === 'rejeitado' ? 'rascunho' : 'rejeitado')"
    />
  </span>
</template>

<style scoped>
.botoes {
  display: inline-flex;
  gap: 0.15rem;
  flex-shrink: 0;
}
.botoes :deep(.p-button) {
  width: 1.9rem;
  height: 1.9rem;
}
</style>
