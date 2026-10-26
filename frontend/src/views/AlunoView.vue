<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Message from 'primevue/message'
import DesempenhoDoAluno from '../components/simulador/DesempenhoDoAluno.vue'
import { buscarDesempenhoDoAluno } from '../services/desempenho.service'

// O desempenho de um aluno no edital (etapa 5c), para o orientador e o professor: o mesmo que o aluno vê, só leitura.

const route = useRoute()
const dados = ref(null)
const erro = ref(null)

async function carregar() {
  dados.value = null
  erro.value = null
  try {
    dados.value = await buscarDesempenhoDoAluno(route.params.id, route.params.alunoId)
  } catch (e) {
    erro.value = e.message
  }
}
watch(() => [route.params.id, route.params.alunoId], carregar, { immediate: true })
</script>

<template>
  <router-link :to="{ name: 'alunos', params: { id: route.params.id } }" class="voltar">
    <i class="pi pi-arrow-left"></i>Alunos
  </router-link>

  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <section v-if="dados" class="painel">
    <div class="painel__cabecalho">
      <h2>{{ dados.aluno.nome }}</h2>
      <span class="email">{{ dados.aluno.email }}</span>
    </div>
    <div class="painel__corpo">
      <DesempenhoDoAluno :desempenho="dados" :edital-id="route.params.id" />
    </div>
  </section>
</template>

<style scoped>
.voltar {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: var(--muted-foreground);
  text-decoration: none;
}
.voltar:hover {
  color: var(--primary);
}
.email {
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
</style>
