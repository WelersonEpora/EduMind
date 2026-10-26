<script setup>
import { computed, onMounted, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { alterarMembro, buscarEquipe, renomearEquipe } from '../services/equipe.service'
import MembroIncluirModal from '../components/equipe/MembroIncluirModal.vue'
import { useSessao, NOMES_DOS_PAPEIS } from '../composables/useSessao'

// A equipe atual e os membros dela (etapa 4b-2). Todos veem; só o orientador inclui, muda o papel, desativa e
// renomeia. Quem é incluído com um e-mail que já tem conta entra com a senha que já tinha.

const toast = useToast()
const { usuario, equipeAtual, carregar: recarregarSessao } = useSessao()

const equipe = ref(null)
const erro = ref(null)
const souOrientador = computed(() => equipeAtual.value?.papel === 'orientador')
const opcoesDePapel = Object.entries(NOMES_DOS_PAPEIS).map(([valor, rotulo]) => ({ valor, rotulo }))

async function carregar() {
  try {
    equipe.value = await buscarEquipe()
  } catch (e) {
    erro.value = e.message
  }
}
onMounted(carregar)

// Renomear
const editandoNome = ref(false)
const nomeNovo = ref('')
function editarNome() {
  nomeNovo.value = equipe.value.nome
  editandoNome.value = true
}
async function salvarNome() {
  try {
    equipe.value = await renomearEquipe(nomeNovo.value)
    editandoNome.value = false
    await recarregarSessao()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não renomeou', detail: e.message, life: 6000 })
  }
}

// Incluir: o formulário fica no modal; aqui só o aviso e a lista nova.
const incluirAberto = ref(false)
async function aoIncluir({ data: membro, contaJaExistia }) {
  toast.add({
    severity: 'success',
    summary: `${membro.nome} entrou na equipe`,
    detail: contaJaExistia
      ? 'Esta pessoa já tinha conta: ela entra com a senha que já usava (a senha informada não foi usada).'
      : 'Passe o e-mail e a senha inicial para a pessoa. A senha pode ser trocada depois em "Minha conta".',
    life: 9000
  })
  await carregar()
}

// Alterar papel ou ativar/desativar. Mexer em si mesmo atualiza a sessão (o menu e o papel mudam).
async function alterar(membro, alteracoes) {
  try {
    await alterarMembro(membro.id, alteracoes)
    if (membro.usuario_id === usuario.value?.id) await recarregarSessao()
    await carregar()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não alterou', detail: e.message, life: 6000 })
    await carregar()
  }
}
</script>

<template>
  <div class="pagina-cabecalho">
    <div>
      <h1 v-if="!editandoNome">{{ equipe?.nome || 'Equipe' }}</h1>
      <form v-else class="renomear" @submit.prevent="salvarNome">
        <InputText v-model="nomeNovo" aria-label="Nome da equipe" autofocus />
        <Button type="submit" label="Salvar" size="small" />
        <Button type="button" label="Cancelar" size="small" text @click="editandoNome = false" />
      </form>
      <p>
        Os editais e as provas desta equipe só aparecem para os membros dela. A biblioteca de normas é de todas as
        equipes.
      </p>
    </div>
    <Button v-if="souOrientador && equipe && !editandoNome" label="Renomear" icon="pi pi-pencil" text @click="editarNome" />
  </div>

  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <template v-else-if="equipe">
    <section class="painel">
      <div class="painel__cabecalho">
        <h2>Membros</h2>
        <Button v-if="souOrientador" label="Incluir" icon="pi pi-plus" size="small" @click="incluirAberto = true" />
      </div>
      <table class="tabela">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Papel</th>
            <th>Situação</th>
            <th v-if="souOrientador"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="membro in equipe.membros" :key="membro.id" :class="{ inativo: !membro.ativo }">
            <td>
              <span class="nome">{{ membro.nome }}<em v-if="membro.usuario_id === usuario?.id"> (você)</em></span>
              <span class="email">{{ membro.email }}</span>
            </td>
            <td>
              <Select
                v-if="souOrientador"
                :model-value="membro.papel"
                :options="opcoesDePapel"
                option-label="rotulo"
                option-value="valor"
                size="small"
                :aria-label="`Papel de ${membro.nome}`"
                @update:model-value="(papel) => alterar(membro, { papel })"
              />
              <span v-else>{{ NOMES_DOS_PAPEIS[membro.papel] }}</span>
            </td>
            <td><Tag :value="membro.ativo ? 'ativo' : 'desativado'" :severity="membro.ativo ? 'success' : 'secondary'" /></td>
            <td v-if="souOrientador" class="acoes">
              <Button
                :label="membro.ativo ? 'Desativar' : 'Reativar'"
                size="small"
                text
                :severity="membro.ativo ? 'danger' : 'secondary'"
                @click="alterar(membro, { ativo: !membro.ativo })"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <MembroIncluirModal v-if="souOrientador" v-model:visible="incluirAberto" @incluido="aoIncluir" />
  </template>
</template>

<style scoped>
.renomear {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
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
  vertical-align: middle;
}
.nome {
  font-weight: 600;
  display: block;
}
.nome em {
  font-weight: 400;
  color: var(--muted-foreground);
}
.email {
  color: var(--muted-foreground);
  font-size: 0.82rem;
}
.inativo .nome,
.inativo .email {
  opacity: 0.6;
}
.acoes {
  text-align: right;
}
@media (max-width: 767px) {
  .tabela th:nth-child(3),
  .tabela td:nth-child(3) {
    display: none;
  }
}
</style>
