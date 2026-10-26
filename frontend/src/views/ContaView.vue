<script setup>
import { ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { trocarSenha } from '../services/auth.service'
import { useSessao, NOMES_DOS_PAPEIS } from '../composables/useSessao'

// Minha conta (etapa 4b-2): quem sou, em que equipes estou e a troca da senha (a inicial é passada por quem incluiu).

const toast = useToast()
const { usuario } = useSessao()

const atual = ref('')
const nova = ref('')
const confirmacao = ref('')
const salvando = ref(false)

async function salvar() {
  if (nova.value !== confirmacao.value) {
    toast.add({ severity: 'warn', summary: 'As senhas novas não são iguais', life: 5000 })
    return
  }
  salvando.value = true
  try {
    await trocarSenha(atual.value, nova.value)
    atual.value = nova.value = confirmacao.value = ''
    toast.add({ severity: 'success', summary: 'Senha trocada', life: 5000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não trocou a senha', detail: e.message, life: 6000 })
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <div class="pagina-cabecalho">
    <div>
      <h1>Minha conta</h1>
      <p>{{ usuario?.nome }} · {{ usuario?.email }}<span v-if="usuario?.admin"> · administrador da plataforma</span></p>
    </div>
  </div>

  <section class="painel">
    <div class="painel__cabecalho"><h2>Equipes</h2></div>
    <ul class="painel__corpo equipes">
      <li v-for="e in usuario?.equipes || []" :key="e.id">{{ e.nome }} <em>{{ NOMES_DOS_PAPEIS[e.papel] }}</em></li>
      <li v-if="!usuario?.equipes?.length" class="pendente">Nenhuma equipe.</li>
    </ul>
  </section>

  <section class="painel senha">
    <div class="painel__cabecalho"><h2>Trocar a senha</h2></div>
    <form class="painel__corpo formulario" @submit.prevent="salvar">
      <label>Senha atual<InputText v-model="atual" type="password" autocomplete="current-password" required /></label>
      <label>Senha nova<InputText v-model="nova" type="password" autocomplete="new-password" required placeholder="pelo menos 8 caracteres" /></label>
      <label>Repita a senha nova<InputText v-model="confirmacao" type="password" autocomplete="new-password" required /></label>
      <Button type="submit" label="Trocar a senha" :loading="salvando" />
    </form>
  </section>
</template>

<style scoped>
.equipes {
  margin: 0;
  padding-left: 2rem;
}
.equipes em,
.pendente {
  font-style: normal;
  color: var(--muted-foreground);
}
.senha {
  margin-top: 1.25rem;
  max-width: 420px;
}
.formulario {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.formulario label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
