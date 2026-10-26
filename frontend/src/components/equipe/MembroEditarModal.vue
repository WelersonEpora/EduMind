<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import { alterarMembro, atribuirEditais } from '../../services/equipe.service'
import { NOMES_DOS_PAPEIS } from '../../composables/useSessao'
import { useEditais, nomeDoEdital } from '../../composables/useEditais'

// Edita um membro da equipe (etapa 4b-2). Papel e situação, sempre. Nome, e-mail e senha só quando a conta é só desta
// equipe e não é de administrador (conta_editavel); a própria conta se muda em Minha conta. Manda só o que mudou.
// Para aluno, também os editais que ele vê (etapa 4c): o aluno só vê os editais marcados aqui.

const visivel = defineModel('visible', { type: Boolean, default: false })
const props = defineProps({
  membro: { type: Object, default: null },
  souEu: { type: Boolean, default: false }
})
const emit = defineEmits(['alterado'])

const opcoesDePapel = Object.entries(NOMES_DOS_PAPEIS).map(([valor, rotulo]) => ({ valor, rotulo }))
const opcoesDeSituacao = [
  { valor: true, rotulo: 'Ativo' },
  { valor: false, rotulo: 'Desativado' }
]

const dados = ref({})
const salvando = ref(false)
const erro = ref('')
const editaConta = computed(() => Boolean(props.membro?.conta_editavel) && !props.souEu)

// Os editais da equipe, para marcar os do aluno. Só aparece para quem já é aluno e continua aluno.
const { editais } = useEditais()
const editaEditais = computed(() => props.membro?.papel === 'aluno' && dados.value.papel === 'aluno')
const editaisMudaram = () => {
  const antes = [...(props.membro.editais || [])].sort().join()
  return editaEditais.value && antes !== [...dados.value.editais].sort().join()
}

watch(visivel, (aberto) => {
  if (!aberto || !props.membro) return
  const { nome, email, papel, ativo } = props.membro
  dados.value = { nome, email, papel, ativo, senha: '', editais: [...(props.membro.editais || [])] }
  erro.value = ''
})

function alteracoes() {
  const m = props.membro
  const d = dados.value
  const saida = {}
  if (d.papel !== m.papel) saida.papel = d.papel
  if (d.ativo !== m.ativo) saida.ativo = d.ativo
  if (editaConta.value) {
    if (d.nome.trim() !== m.nome) saida.nome = d.nome
    if (d.email.trim().toLowerCase() !== m.email) saida.email = d.email
    if (d.senha) saida.senha = d.senha
  }
  return saida
}

async function salvar() {
  const mudancas = alteracoes()
  const mudaEditais = editaisMudaram()
  if (Object.keys(mudancas).length === 0 && !mudaEditais) {
    visivel.value = false
    return
  }
  erro.value = ''
  salvando.value = true
  try {
    let membro = props.membro
    if (Object.keys(mudancas).length) membro = await alterarMembro(props.membro.id, mudancas)
    if (mudaEditais) membro = await atribuirEditais(props.membro.id, dados.value.editais)
    visivel.value = false
    emit('alterado', { membro, senhaRedefinida: Boolean(mudancas.senha) })
  } catch (e) {
    erro.value = e.message
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visivel" modal :header="membro ? `Editar ${membro.nome}` : 'Editar'" :closable="!salvando" class="modal-editar">
    <form v-if="membro" id="form-editar-membro" class="campos" @submit.prevent="salvar">
      <label>
        Papel
        <Select v-model="dados.papel" :options="opcoesDePapel" option-label="rotulo" option-value="valor" />
      </label>
      <div class="campo">
        <span class="campo__rotulo">Situação</span>
        <SelectButton v-model="dados.ativo" :options="opcoesDeSituacao" option-label="rotulo" option-value="valor" :allow-empty="false" />
        <small v-if="!dados.ativo" class="dica">Desativada, a pessoa perde o acesso a esta equipe. Nada é apagado.</small>
      </div>

      <div v-if="editaEditais" class="campo">
        <span class="campo__rotulo">Editais que este aluno vê</span>
        <ul v-if="editais.length" class="editais">
          <li v-for="edital in editais" :key="edital.id">
            <label class="editais__opcao">
              <Checkbox v-model="dados.editais" :value="edital.id" />
              <span>{{ nomeDoEdital(edital) }}</span>
            </label>
          </li>
        </ul>
        <small v-else class="dica">A equipe ainda não tem editais.</small>
        <small class="dica">O aluno só vê os editais marcados: a Visão geral e a Cobertura, sem a revisão e as fontes.</small>
      </div>

      <template v-if="editaConta">
        <label>Nome<InputText v-model="dados.nome" autocomplete="off" /></label>
        <label>E-mail<InputText v-model="dados.email" type="email" autocomplete="off" /></label>
        <label>
          Nova senha
          <InputText v-model="dados.senha" autocomplete="new-password" placeholder="deixe em branco para manter a atual" />
        </label>
      </template>
      <div v-else class="conta">
        <span class="conta__nome">{{ membro.nome }}</span>
        <span class="conta__email">{{ membro.email }}</span>
        <p class="dica">
          <template v-if="souEu">
            Para mudar o seu nome, e-mail ou senha, use <router-link :to="{ name: 'conta' }" @click="visivel = false">Minha conta</router-link>.
          </template>
          <template v-else>
            Esta conta também é usada fora desta equipe: só a própria pessoa muda o nome, o e-mail e a senha, em Minha
            conta.
          </template>
        </p>
      </div>

      <Message v-if="erro" severity="error" size="small" :closable="false">{{ erro }}</Message>
    </form>
    <template #footer>
      <Button label="Cancelar" text severity="secondary" :disabled="salvando" @click="visivel = false" />
      <Button type="submit" form="form-editar-membro" label="Salvar" icon="pi pi-check" :loading="salvando" />
    </template>
  </Dialog>
</template>

<style scoped>
.campos {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.campos label,
.campo {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
}
.campo__rotulo {
  font-weight: 600;
}
.editais {
  margin: 0;
  padding: 0.35rem 0.5rem;
  list-style: none;
  max-height: 14rem;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
}
/* .campos na frente: a regra dos rótulos do formulário (em coluna) não pode valer aqui. */
.campos .editais__opcao {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-weight: 400;
  font-size: 0.85rem;
  cursor: pointer;
}
.conta {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--muted);
}
.conta__nome {
  font-weight: 600;
}
.conta__email {
  font-size: 0.82rem;
  color: var(--muted-foreground);
}
.dica {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--muted-foreground);
}
</style>

<style>
.modal-editar {
  width: min(440px, calc(100vw - 2rem));
}
</style>
