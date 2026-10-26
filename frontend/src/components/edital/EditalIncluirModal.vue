<script setup>
import { ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import { enviarEdital } from '../../services/editais.service'

// Envia o PDF de um edital, no molde do MembroIncluirModal: o erro fica no modal; deu certo, fecha e avisa a tela
// (enviado), que mostra o aviso e abre o edital. O envio começa assim que o arquivo é escolhido ou solto.

const visivel = defineModel('visible', { type: Boolean, default: false })
const emit = defineEmits(['enviado'])

const enviando = ref(false)
const arrastando = ref(false)
const erro = ref('')
const inputArquivo = ref(null)

// Cada abertura começa do zero.
watch(visivel, (aberto) => {
  if (!aberto) return
  erro.value = ''
  arrastando.value = false
})

async function enviar(arquivo) {
  if (!arquivo || enviando.value) return
  erro.value = ''
  enviando.value = true
  try {
    const resposta = await enviarEdital(arquivo)
    visivel.value = false
    emit('enviado', resposta)
  } catch (e) {
    erro.value = e.message
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
  <Dialog v-model:visible="visivel" modal header="Incluir edital" :closable="!enviando" class="modal-edital">
    <label
      class="soltar"
      :class="{ 'soltar--arrastando': arrastando, 'soltar--enviando': enviando }"
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
        <i class="pi pi-file-pdf"></i>
        <strong>Arraste o PDF aqui ou clique para escolher</strong>
        <span>O EduMind guarda o arquivo original e o texto de cada página.</span>
      </template>
    </label>
    <p class="dica">Se este PDF já foi enviado pela equipe, o edital existente é aberto em vez de criar outro.</p>
    <Message v-if="erro" severity="error" size="small" :closable="false">{{ erro }}</Message>
    <template #footer>
      <Button label="Cancelar" text severity="secondary" :disabled="enviando" @click="visivel = false" />
    </template>
  </Dialog>
</template>

<style scoped>
.soltar {
  display: grid;
  justify-items: center;
  gap: 0.4rem;
  text-align: center;
  padding: 2rem 1rem;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 0.82rem;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.soltar:hover,
.soltar--arrastando {
  border-color: var(--primary);
  background: var(--accent);
}
.soltar--enviando {
  cursor: progress;
}
.soltar .pi {
  font-size: 1.6rem;
  color: var(--primary);
}
.soltar strong {
  color: var(--foreground);
  font-size: 0.9rem;
}
.dica {
  margin: 0.75rem 0 0.5rem;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
</style>

<style>
.modal-edital {
  width: min(480px, calc(100vw - 2rem));
}
</style>
