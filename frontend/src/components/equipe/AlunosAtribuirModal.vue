<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { buscarEquipe } from '../../services/equipe.service'
import { atribuirAlunosAoEdital } from '../../services/desempenho.service'

// Atribui o edital a alunos da equipe (decisão de 2026-10-27: pela aba Alunos do edital, não pelo Editar do membro).
// Lista os alunos ativos que ainda não veem o edital, com busca e "marcar todos". Só o orientador abre.

const visivel = defineModel('visible', { type: Boolean, default: false })
const props = defineProps({
  editalId: { type: String, required: true },
  jaVeem: { type: Array, default: () => [] }
})
const emit = defineEmits(['atribuido'])

const disponiveis = ref([])
const marcados = ref([])
const busca = ref('')
const carregando = ref(false)
const salvando = ref(false)
const erro = ref('')

watch(visivel, async (aberto) => {
  if (!aberto) return
  marcados.value = []
  busca.value = ''
  erro.value = ''
  carregando.value = true
  try {
    const { membros } = await buscarEquipe()
    disponiveis.value = membros.filter((m) => m.papel === 'aluno' && m.ativo && !props.jaVeem.includes(m.usuario_id))
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
})

const semAcento = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const filtrados = computed(() => {
  const termo = semAcento(busca.value.trim())
  return termo ? disponiveis.value.filter((a) => semAcento(`${a.nome} ${a.email}`).includes(termo)) : disponiveis.value
})
const todosMarcados = computed(() => filtrados.value.length > 0 && filtrados.value.every((a) => marcados.value.includes(a.usuario_id)))

// Marca ou desmarca todos os que a busca mostra.
function alternarTodos() {
  const ids = filtrados.value.map((a) => a.usuario_id)
  marcados.value = todosMarcados.value ? marcados.value.filter((id) => !ids.includes(id)) : [...new Set([...marcados.value, ...ids])]
}

async function salvar() {
  erro.value = ''
  salvando.value = true
  try {
    const alunos = await atribuirAlunosAoEdital(props.editalId, marcados.value)
    visivel.value = false
    emit('atribuido', alunos)
  } catch (e) {
    erro.value = e.message
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visivel" modal header="Adicionar alunos ao edital" :closable="!salvando" class="modal-atribuir">
    <p v-if="carregando" class="dica">Carregando os alunos da equipe…</p>
    <template v-else-if="disponiveis.length">
      <InputText v-model="busca" placeholder="Buscar por nome ou e-mail" aria-label="Buscar aluno" class="busca" />
      <label v-if="filtrados.length > 1" class="opcao opcao--todos">
        <Checkbox :model-value="todosMarcados" binary @update:model-value="alternarTodos" />
        <span>Marcar todos{{ busca.trim() ? ' os encontrados' : '' }}</span>
      </label>
      <ul class="alunos">
        <li v-for="aluno in filtrados" :key="aluno.usuario_id">
          <label class="opcao">
            <Checkbox v-model="marcados" :value="aluno.usuario_id" />
            <span>
              <span class="nome">{{ aluno.nome }}</span>
              <span class="email">{{ aluno.email }}</span>
            </span>
          </label>
        </li>
        <li v-if="filtrados.length === 0" class="dica">Nenhum aluno encontrado.</li>
      </ul>
      <small class="dica">O aluno passa a ver a Visão geral, a Cobertura e o simulador deste edital, sem a revisão e as fontes.</small>
    </template>
    <p v-else-if="!erro" class="dica">
      Todos os alunos ativos da equipe já veem este edital. Para incluir um aluno novo, use Incluir na tela Membros.
    </p>
    <Message v-if="erro" severity="error" size="small" :closable="false">{{ erro }}</Message>
    <template #footer>
      <Button label="Cancelar" text severity="secondary" :disabled="salvando" @click="visivel = false" />
      <Button
        :label="marcados.length ? `Adicionar ${marcados.length} ${marcados.length === 1 ? 'aluno' : 'alunos'}` : 'Adicionar'"
        icon="pi pi-check"
        :disabled="marcados.length === 0"
        :loading="salvando"
        @click="salvar"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.busca {
  width: 100%;
  margin-bottom: 0.6rem;
}
.alunos {
  margin: 0 0 0.6rem;
  padding: 0.35rem 0.5rem;
  list-style: none;
  max-height: 18rem;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
}
.opcao {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 0;
  cursor: pointer;
}
.opcao--todos {
  padding: 0 0.5rem 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
}
.nome {
  display: block;
  font-size: 0.9rem;
}
.email {
  font-size: 0.78rem;
  color: var(--muted-foreground);
}
.dica {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
</style>

<style>
.modal-atribuir {
  width: min(460px, calc(100vw - 2rem));
}
</style>
