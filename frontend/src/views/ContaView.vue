<script setup>
import { computed, ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { alterarConta, trocarSenha } from '../services/auth.service'
import { useSessao, NOMES_DOS_PAPEIS } from '../composables/useSessao'

// Minha conta (etapa 4b-2): quem sou, em que equipes estou, o nome e o e-mail e a troca da senha (a inicial é passada
// por quem incluiu). O e-mail é o login: mudar pede a senha atual.

const toast = useToast()
const { usuario, carregar } = useSessao()

const conta = ref({ nome: '', email: '', atual: '' })
const salvandoConta = ref(false)
watch(
  usuario,
  (u) => {
    conta.value = { nome: u?.nome || '', email: u?.email || '', atual: '' }
  },
  { immediate: true }
)
const mudaEmail = computed(() => conta.value.email.trim().toLowerCase() !== (usuario.value?.email || ''))

async function salvarConta() {
  const dados = {}
  if (conta.value.nome.trim() !== usuario.value?.nome) dados.nome = conta.value.nome
  if (mudaEmail.value) Object.assign(dados, { email: conta.value.email, atual: conta.value.atual })
  if (Object.keys(dados).length === 0) return
  salvandoConta.value = true
  try {
    await alterarConta(dados)
    await carregar()
    toast.add({ severity: 'success', summary: 'Conta atualizada', detail: dados.email ? 'Entre com o e-mail novo a partir de agora.' : undefined, life: 5000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não alterou a conta', detail: e.message, life: 6000 })
  } finally {
    salvandoConta.value = false
  }
}

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
    <div class="painel__cabecalho"><h2>Nome e e-mail</h2></div>
    <form class="painel__corpo formulario" @submit.prevent="salvarConta">
      <label>Nome<InputText v-model="conta.nome" required autocomplete="name" /></label>
      <label>E-mail<InputText v-model="conta.email" type="email" required autocomplete="email" /></label>
      <label v-if="mudaEmail">
        Senha atual
        <InputText v-model="conta.atual" type="password" autocomplete="current-password" required placeholder="para mudar o e-mail" />
      </label>
      <Button type="submit" label="Salvar" :loading="salvandoConta" />
    </form>
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
