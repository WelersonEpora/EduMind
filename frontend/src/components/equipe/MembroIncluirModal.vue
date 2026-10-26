<script setup>
import { ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import { incluirMembro } from '../../services/equipe.service'
import { NOMES_DOS_PAPEIS } from '../../composables/useSessao'

// Inclui uma pessoa na equipe (etapa 4b-2), no molde do MembroIncluirModal do FinMind: o erro fica no modal; deu
// certo, fecha e avisa a tela (incluido), que mostra o aviso e recarrega a lista.

const visivel = defineModel('visible', { type: Boolean, default: false })
const emit = defineEmits(['incluido'])

const opcoesDePapel = Object.entries(NOMES_DOS_PAPEIS).map(([valor, rotulo]) => ({ valor, rotulo }))
const vazio = () => ({ nome: '', email: '', senha: '', papel: 'aluno' })
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
    const resposta = await incluirMembro(dados.value)
    visivel.value = false
    emit('incluido', resposta)
  } catch (e) {
    erro.value = e.message
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visivel" modal header="Incluir pessoa" :closable="!salvando" class="modal-incluir">
    <form id="form-incluir-membro" class="campos" @submit.prevent="incluir">
      <label>Nome<InputText v-model="dados.nome" autocomplete="off" autofocus /></label>
      <label>E-mail<InputText v-model="dados.email" type="email" required autocomplete="off" /></label>
      <label>
        Senha inicial
        <InputText v-model="dados.senha" autocomplete="new-password" placeholder="pelo menos 8 caracteres" />
      </label>
      <label>
        Papel
        <Select v-model="dados.papel" :options="opcoesDePapel" option-label="rotulo" option-value="valor" />
      </label>
      <p class="dica">
        Se o e-mail já tem conta no EduMind (a pessoa está em outra equipe), nome e senha não são usados: ela só passa a
        fazer parte desta equipe também.
      </p>
      <Message v-if="erro" severity="error" size="small" :closable="false">{{ erro }}</Message>
    </form>
    <template #footer>
      <Button label="Cancelar" text severity="secondary" :disabled="salvando" @click="visivel = false" />
      <Button type="submit" form="form-incluir-membro" label="Incluir" icon="pi pi-user-plus" :loading="salvando" />
    </template>
  </Dialog>
</template>

<style scoped>
.campos {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.campos label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
}
.dica {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
</style>

<style>
.modal-incluir {
  width: min(440px, calc(100vw - 2rem));
}
</style>
