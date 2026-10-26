<script setup>
import { ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { incluirNorma } from '../../services/editais.service'

// Inclui uma norma na biblioteca sem passar por um edital, com os mesmos campos da confirmação nas Fontes. A chave
// (jurisdição, tipo, número e ano) é a mesma que as Fontes usam: o edital que chegar depois já acha a norma. Deu
// certo, fecha e avisa a tela (incluida), que abre a norma; com a chave já na biblioteca, abre a existente.

const visivel = defineModel('visible', { type: Boolean, default: false })
const emit = defineEmits(['incluida'])

const CAMPOS = [
  ['jurisdicao', 'Jurisdição', 'BR, SP, TJSP'],
  ['tipo', 'Tipo', 'Lei, Decreto-Lei...'],
  ['numero', 'Número', '9.099'],
  ['ano', 'Ano', '1995'],
  ['nome', 'Nome', 'Juizados Especiais Cíveis e Criminais']
]
const vazio = () => ({ jurisdicao: 'BR', tipo: '', numero: '', ano: '', nome: '' })
const dados = ref(vazio())
const salvando = ref(false)
const erro = ref('')

// Cada abertura começa do zero.
watch(visivel, (aberto) => {
  if (!aberto) return
  dados.value = vazio()
  erro.value = ''
})

async function incluir() {
  erro.value = ''
  salvando.value = true
  try {
    const resposta = await incluirNorma(dados.value)
    visivel.value = false
    emit('incluida', resposta)
  } catch (e) {
    erro.value = e.message
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visivel" modal header="Incluir norma" :closable="!salvando" class="modal-norma">
    <form id="form-incluir-norma" class="campos" @submit.prevent="incluir">
      <label v-for="[campo, rotulo, exemplo] in CAMPOS" :key="campo" :class="{ largo: campo === 'nome' }">
        {{ rotulo }}
        <InputText v-model="dados[campo]" :placeholder="exemplo" autocomplete="off" :autofocus="campo === 'tipo'" />
      </label>
      <p class="dica">
        Jurisdição "BR" para norma federal, a sigla do estado ("SP") ou a do tribunal ("TJSP"). Se a norma já está na
        biblioteca, ela é aberta em vez de criar outra.
      </p>
      <Message v-if="erro" severity="error" size="small" :closable="false" class="largo">{{ erro }}</Message>
    </form>
    <template #footer>
      <Button label="Cancelar" text severity="secondary" :disabled="salvando" @click="visivel = false" />
      <Button type="submit" form="form-incluir-norma" label="Incluir" icon="pi pi-plus" :loading="salvando" />
    </template>
  </Dialog>
</template>

<style scoped>
.campos {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr) 7rem 5rem;
  gap: 0.75rem;
}
.campos label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
  min-width: 0;
}
.campos :deep(input) {
  width: 100%;
  min-width: 0;
}
.largo,
.dica {
  grid-column: 1 / -1;
}
.dica {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
@media (max-width: 560px) {
  .campos {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
</style>

<style>
.modal-norma {
  width: min(560px, calc(100vw - 2rem));
}
</style>
