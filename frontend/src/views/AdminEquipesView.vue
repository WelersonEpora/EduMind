<script setup>
import { onMounted, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { alterarContaNaPlataforma, criarEquipeNaPlataforma, listarEquipesDaPlataforma } from '../services/equipe.service'
import { useSessao } from '../composables/useSessao'

// Administração da plataforma (etapa 4b-2): todas as equipes e a criação de uma nova, já com o orientador.
// Só para o administrador; funciona mesmo sem ele estar em nenhuma equipe. O administrador também corrige o nome, o
// e-mail e a senha do orientador (menos de outro administrador, que muda a sua em Minha conta).

const toast = useToast()
const { carregar: recarregarSessao } = useSessao()

const equipes = ref([])
const erro = ref(null)

async function carregar() {
  try {
    equipes.value = await listarEquipesDaPlataforma()
  } catch (e) {
    erro.value = e.message
  }
}
onMounted(carregar)

const vazio = () => ({ nome: '', orientador: { nome: '', email: '', senha: '' } })
const nova = ref(vazio())
const criando = ref(false)

async function criar() {
  criando.value = true
  try {
    const { data: equipe, contaJaExistia } = await criarEquipeNaPlataforma(nova.value)
    toast.add({
      severity: 'success',
      summary: `Equipe "${equipe.nome}" criada`,
      detail: contaJaExistia
        ? 'Quem vai orientar já tinha conta: entra com a senha que já usava.'
        : 'Passe o e-mail e a senha inicial para quem vai orientar. Os professores e alunos são incluídos na tela Membros.',
      life: 9000
    })
    nova.value = vazio()
    await carregar()
    // O próprio administrador pode ter se posto como orientador da equipe nova.
    await recarregarSessao()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não criou a equipe', detail: e.message, life: 6000 })
  } finally {
    criando.value = false
  }
}

// Edição da conta de um orientador: manda só o que mudou.
const editando = ref(null)
const dadosDaConta = ref({})
const salvandoConta = ref(false)
const erroDaConta = ref('')

function editar(orientador) {
  editando.value = orientador
  dadosDaConta.value = { nome: orientador.nome, email: orientador.email, senha: '' }
  erroDaConta.value = ''
}

async function salvarConta() {
  const o = editando.value
  const d = dadosDaConta.value
  const mudancas = {}
  if (d.nome.trim() !== o.nome) mudancas.nome = d.nome
  if (d.email.trim().toLowerCase() !== o.email) mudancas.email = d.email
  if (d.senha) mudancas.senha = d.senha
  if (Object.keys(mudancas).length === 0) {
    editando.value = null
    return
  }
  salvandoConta.value = true
  erroDaConta.value = ''
  try {
    await alterarContaNaPlataforma(o.usuario_id, mudancas)
    editando.value = null
    toast.add({
      severity: 'success',
      summary: 'Conta atualizada',
      detail: mudancas.senha ? 'Passe a senha nova para a pessoa.' : undefined,
      life: 6000
    })
    await carregar()
  } catch (e) {
    erroDaConta.value = e.message
  } finally {
    salvandoConta.value = false
  }
}
</script>

<template>
  <div class="pagina-cabecalho">
    <div>
      <h1>Equipes da plataforma</h1>
      <p>Cada orientador trabalha numa equipe. Crie a equipe já com o orientador, que inclui os professores e os alunos.</p>
    </div>
  </div>

  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <section v-else class="painel">
    <table class="tabela">
      <thead>
        <tr>
          <th>Equipe</th>
          <th>Orientadores</th>
          <th>Membros ativos</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="equipe in equipes" :key="equipe.id">
          <td class="nome">{{ equipe.nome }}</td>
          <td>
            <span v-for="o in equipe.orientadores" :key="o.email" class="orientador">
              {{ o.nome }} <em>{{ o.email }}</em>
              <Button
                v-if="!o.admin"
                icon="pi pi-pencil"
                text
                rounded
                size="small"
                severity="secondary"
                :aria-label="`Editar ${o.nome}`"
                title="Corrigir nome, e-mail ou senha"
                @click="editar(o)"
              />
            </span>
            <span v-if="equipe.orientadores.length === 0" class="pendente">sem orientador ativo</span>
          </td>
          <td class="mono">{{ equipe.membros_ativos }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="equipes.length === 0" class="painel__corpo pendente">Nenhuma equipe ainda.</p>
  </section>

  <section class="painel nova">
    <div class="painel__cabecalho"><h2>Nova equipe</h2></div>
    <form class="painel__corpo formulario" @submit.prevent="criar">
      <label>Nome da equipe<InputText v-model="nova.nome" required autocomplete="off" /></label>
      <label>Nome do orientador<InputText v-model="nova.orientador.nome" autocomplete="off" /></label>
      <label>E-mail do orientador<InputText v-model="nova.orientador.email" type="email" required autocomplete="off" /></label>
      <label>
        Senha inicial
        <InputText v-model="nova.orientador.senha" autocomplete="new-password" placeholder="pelo menos 8 caracteres" />
      </label>
      <Button type="submit" label="Criar equipe" icon="pi pi-plus" :loading="criando" />
    </form>
    <p class="painel__corpo dica">Se o e-mail do orientador já tem conta, nome e senha não são usados.</p>
  </section>

  <Dialog
    :visible="Boolean(editando)"
    modal
    :header="editando ? `Editar ${editando.nome}` : 'Editar'"
    :closable="!salvandoConta"
    :style="{ width: 'min(440px, calc(100vw - 2rem))' }"
    @update:visible="(v) => !v && (editando = null)"
  >
    <form v-if="editando" id="form-editar-conta" class="campos" @submit.prevent="salvarConta">
      <label>Nome<InputText v-model="dadosDaConta.nome" autocomplete="off" /></label>
      <label>E-mail<InputText v-model="dadosDaConta.email" type="email" autocomplete="off" /></label>
      <label>
        Nova senha
        <InputText v-model="dadosDaConta.senha" autocomplete="new-password" placeholder="deixe em branco para manter a atual" />
      </label>
      <p class="dica">A conta vale em todas as equipes em que a pessoa está.</p>
      <Message v-if="erroDaConta" severity="error" size="small" :closable="false">{{ erroDaConta }}</Message>
    </form>
    <template #footer>
      <Button label="Cancelar" text severity="secondary" :disabled="salvandoConta" @click="editando = null" />
      <Button type="submit" form="form-editar-conta" label="Salvar" icon="pi pi-check" :loading="salvandoConta" />
    </template>
  </Dialog>
</template>

<style scoped>
.tabela {
  width: 100%;
  border-collapse: collapse;
}
.tabela th {
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border);
}
.tabela td {
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.nome {
  font-weight: 600;
}
.orientador {
  display: block;
}
.orientador em,
.pendente {
  font-style: normal;
  color: var(--muted-foreground);
}
.nova {
  margin-top: 1.25rem;
}
.formulario {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  align-items: end;
}
.formulario label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
}
.dica {
  padding-top: 0;
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.campos {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.campos label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
