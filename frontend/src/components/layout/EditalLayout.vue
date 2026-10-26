<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import Tag from 'primevue/tag'
import { useEditais, nomeDoEdital } from '../../composables/useEditais'
import { urlDoArquivo } from '../../services/editais.service'
import { useSessao } from '../../composables/useSessao'
import { formatarBytes, formatarDataHora, situacaoDoEdital } from '../../utils/formatar'

// Casca das telas de um edital: volta à lista, nome e situação do edital, a linha do arquivo (o nome abre o PDF
// original) e as abas. Cada aba é uma rota filha com URL
// própria (o Voltar do navegador, o link direto e o recarregar continuam funcionando). O nome vem da lista de editais
// da equipe, que o AppShell já carrega; a Visão geral recarrega a lista quando a extração muda situação, órgão e cargo.

const route = useRoute()
const { eAluno } = useSessao()
const { editais, recarregar } = useEditais()

const edital = computed(() => editais.value.find((e) => e.id === route.params.id) || null)

// A situação e os pendentes das abas mudam com o trabalho em cada aba: a lista é recarregada a cada troca de aba (a
// Revisão e as Fontes também recarregam depois de cada alteração).
watch(() => route.name, (nome, anterior) => anterior && recarregar())

// Pendentes de cada aba, a partir do andamento (só depois da extração).
function pendentes(aba) {
  const andamento = edital.value?.andamento
  if (!andamento || eAluno.value) return 0
  if (aba === 'revisao') return andamento.revisao_pendentes
  if (aba === 'fontes') return andamento.fontes_pendentes
  return 0
}

// rotas: as telas que deixam a aba marcada (as questões de uma prova ficam dentro de Provas anteriores).
// doAluno: as abas que o aluno vê (etapa 4c); as outras são do trabalho do orientador e do professor.
const TODAS_AS_ABAS = [
  { rotulo: 'Visão geral', icone: 'pi-file', nome: 'edital', rotas: ['edital'], doAluno: true },
  { rotulo: 'Revisão', icone: 'pi-check-square', nome: 'revisao', rotas: ['revisao'] },
  { rotulo: 'Fontes', icone: 'pi-globe', nome: 'fontes', rotas: ['fontes'] },
  { rotulo: 'Cobertura', icone: 'pi-chart-bar', nome: 'cobertura', rotas: ['cobertura'], doAluno: true },
  { rotulo: 'Provas anteriores', icone: 'pi-file-edit', nome: 'provas', rotas: ['provas', 'questoes'] },
  { rotulo: 'Simulador', icone: 'pi-play-circle', nome: 'simulador', rotas: ['simulador'], doAluno: true }
]
const ABAS = computed(() => TODAS_AS_ABAS.filter((aba) => !eAluno.value || aba.doAluno))
</script>

<template>
  <router-link :to="{ name: 'editais' }" class="voltar-topo"><i class="pi pi-arrow-left"></i>{{ eAluno ? 'Meus editais' : 'Editais' }}</router-link>
  <div class="edital-topo">
    <h1 :title="edital ? nomeDoEdital(edital) : ''">{{ edital ? nomeDoEdital(edital) : '…' }}</h1>
    <Tag v-if="edital && !eAluno" :value="situacaoDoEdital(edital).rotulo" :severity="situacaoDoEdital(edital).severidade" class="edital-topo__situacao" />
  </div>
  <p v-if="edital" class="arquivo">
    <a :href="urlDoArquivo(edital.id)" target="_blank" rel="noopener" title="Abrir o PDF original" class="arquivo__nome">
      {{ edital.arquivo_nome }}<i class="pi pi-external-link"></i>
    </a>
    <span>{{ edital.total_paginas }} páginas</span>
    <span>{{ formatarBytes(edital.arquivo_bytes) }}</span>
    <span>enviado em {{ formatarDataHora(edital.created_at) }}</span>
  </p>

  <nav class="abas" aria-label="Telas do edital">
    <router-link
      v-for="aba in ABAS"
      :key="aba.nome"
      :to="{ name: aba.nome, params: { id: route.params.id } }"
      class="abas__aba"
      :class="{ 'abas__aba--ativa': aba.rotas.includes(route.name) }"
      :aria-current="aba.rotas.includes(route.name) ? 'page' : undefined"
    >
      <i class="pi" :class="aba.icone"></i>{{ aba.rotulo }}
      <span v-if="pendentes(aba.nome)" class="abas__pendentes" :title="`${pendentes(aba.nome)} pendentes`">{{ pendentes(aba.nome) }}</span>
    </router-link>
  </nav>

  <router-view />
</template>

<style scoped>
.edital-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.edital-topo h1 {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edital-topo__situacao {
  flex-shrink: 0;
  white-space: nowrap;
}

/* Linha do arquivo: discreta, com o nome abrindo o PDF original. */
.arquivo {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 0.5rem;
  margin: 0.2rem 0 0.75rem;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.arquivo span::before {
  content: "·";
  margin-right: 0.5rem;
}
.arquivo__nome {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--primary);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.arquivo__nome:hover {
  text-decoration: underline;
}
.arquivo__nome .pi {
  font-size: 0.7rem;
}

/* A linha cinza é uma sombra interna, não borda: o sublinhado da aba ativa a cobre sem sair da faixa, e a rolagem
   horizontal (celular) não ganha uma barra vertical por 1px a mais. */
.abas {
  display: flex;
  gap: 0.25rem;
  box-shadow: inset 0 -1px 0 var(--border);
  margin-bottom: 1.25rem;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.abas__aba {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.55rem 0.85rem;
  border-bottom: 2px solid transparent;
  color: var(--muted-foreground);
  font-size: 0.86rem;
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}
.abas__aba:hover {
  color: var(--foreground);
}
.abas__aba--ativa {
  color: var(--accent-foreground);
  border-bottom-color: var(--primary);
  font-weight: 600;
}
.abas__pendentes {
  min-width: 1.25rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: color-mix(in oklch, var(--warning) 28%, transparent);
  color: var(--warning-foreground);
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.25rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.abas__aba--ativa .pi {
  color: var(--primary);
}

@media (max-width: 767px) {
  .edital-topo h1 {
    font-size: 1.2rem;
  }
}
</style>
