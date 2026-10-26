<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useSessao } from '../composables/useSessao'
import { destinoSeguro } from '../router/destino'

// Entrada no sistema (etapa 4a). Depois do login, volta para a tela que a pessoa tentou abrir.

const route = useRoute()
const router = useRouter()
const { entrar } = useSessao()

const email = ref('')
const senha = ref('')
const erro = ref('')
const entrando = ref(false)

async function enviar() {
  erro.value = ''
  entrando.value = true
  try {
    await entrar(email.value, senha.value)
    router.replace(destinoSeguro(route.query.voltar))
  } catch (e) {
    erro.value = e.message
  } finally {
    entrando.value = false
  }
}
</script>

<template>
  <main class="login">
    <form class="login__cartao" @submit.prevent="enviar">
      <div class="login__marca">Edu<b>Mind</b></div>
      <p class="login__sub">apoio ao orientador</p>

      <label for="email">E-mail</label>
      <InputText id="email" v-model="email" type="email" autocomplete="username" required autofocus fluid />

      <label for="senha">Senha</label>
      <InputText id="senha" v-model="senha" type="password" autocomplete="current-password" required fluid />

      <Message v-if="erro" severity="error" size="small" class="login__erro">{{ erro }}</Message>

      <Button type="submit" :label="entrando ? 'Entrando…' : 'Entrar'" :loading="entrando" fluid />
    </form>
  </main>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: var(--background);
}
.login__cartao {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 1.75rem;
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.login__marca {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.6rem;
  text-align: center;
}
.login__marca b {
  color: var(--primary);
}
.login__sub {
  margin: 0 0 1rem;
  text-align: center;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
label {
  font-size: 0.82rem;
  font-weight: 600;
  margin-top: 0.4rem;
}
.login__erro {
  margin: 0.5rem 0 0;
}
.login__cartao :deep(.p-button) {
  margin-top: 1rem;
}
</style>
