<script setup>
import { computed } from 'vue'
import Message from 'primevue/message'
import TrechoCitado from './TrechoCitado.vue'
import { formatarDataHora } from '../../utils/formatar'

// Metadados extraídos pela IA (etapa 1b-1), cada item com o selo da conferência do trecho.
const props = defineProps({
  metadados: { type: Object, required: true }
})
const emit = defineEmits(['ver-trecho'])

const CAMPOS = [
  ['banca', 'Banca'],
  ['orgao', 'Órgão'],
  ['cargo', 'Cargo'],
  ['data_publicacao', 'Data de publicação']
]

function formatarValor(chave, valor) {
  if (chave === 'data_publicacao' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor.split('-').reverse().join('/')
  return valor
}

// Todos os itens que trazem trecho, para o resumo da conferência.
const itens = computed(() => {
  const m = props.metadados
  return [
    ...Object.values(m.campos).filter(Boolean),
    ...m.blocos.flatMap((bloco) => [bloco, ...bloco.disciplinas]),
    ...m.regras_de_corte,
    ...(m.discursiva ? [m.discursiva] : [])
  ]
})
const verificados = computed(() => itens.value.filter((item) => item.verificado).length)

const totalDeQuestoes = computed(() => {
  const disciplinas = props.metadados.blocos.flatMap((bloco) => bloco.disciplinas)
  if (disciplinas.length === 0 || disciplinas.some((d) => d.questoes == null)) return null
  return disciplinas.reduce((soma, d) => soma + d.questoes, 0)
})

const ver = (item) => emit('ver-trecho', item)
</script>

<template>
  <div class="metadados">
    <p class="resumo">
      <b>{{ verificados }} de {{ itens.length }}</b> trechos conferidos na página citada. Clique no selo para ver o
      trecho no texto.
    </p>

    <Message v-for="aviso in metadados.avisos" :key="aviso" severity="warn" :closable="false">{{ aviso }}</Message>

    <dl class="campos">
      <div v-for="[chave, rotulo] in CAMPOS" :key="chave" class="linha">
        <dt class="rotulo">{{ rotulo }}</dt>
        <dd v-if="metadados.campos[chave]">
          <span>{{ formatarValor(chave, metadados.campos[chave].valor) }}</span>
          <TrechoCitado :item="metadados.campos[chave]" @ver="ver" />
        </dd>
        <dd v-else class="ausente">não encontrado no edital</dd>
      </div>
    </dl>

    <h3>
      Prova objetiva
      <span v-if="totalDeQuestoes != null" class="mono">· {{ totalDeQuestoes }} questões</span>
    </h3>
    <p v-if="metadados.blocos.length === 0" class="ausente">Nenhum bloco ou disciplina encontrado no edital.</p>
    <div v-for="(bloco, i) in metadados.blocos" :key="i" class="bloco">
      <div class="bloco__titulo">
        <b>{{ bloco.nome }}</b>
        <TrechoCitado :item="bloco" @ver="ver" />
      </div>
      <table class="disciplinas">
        <tbody>
          <tr v-for="(disciplina, j) in bloco.disciplinas" :key="j">
            <td>{{ disciplina.nome }}</td>
            <td class="mono questoes">{{ disciplina.questoes ?? '—' }}</td>
            <td class="selo"><TrechoCitado :item="disciplina" @ver="ver" /></td>
          </tr>
        </tbody>
      </table>
    </div>

    <h3>Regras de corte</h3>
    <p v-if="metadados.regras_de_corte.length === 0" class="ausente">Nenhuma regra de corte encontrada no edital.</p>
    <ul class="lista">
      <li v-for="(regra, i) in metadados.regras_de_corte" :key="i">
        <span>{{ regra.descricao }}</span>
        <TrechoCitado :item="regra" @ver="ver" />
      </li>
    </ul>

    <h3>Prova discursiva</h3>
    <p v-if="!metadados.discursiva" class="ausente">Não encontrada no edital.</p>
    <ul v-else class="lista">
      <li>
        <span>{{ metadados.discursiva.descricao }}</span>
        <TrechoCitado :item="metadados.discursiva" @ver="ver" />
      </li>
    </ul>

    <p v-if="metadados.extracao" class="rodape mono">
      Extraído em {{ formatarDataHora(metadados.extracao.concluida_em) }}
      <template v-for="chamada in metadados.extracao.chamadas || []" :key="chamada.prompt">
        <br />{{ chamada.prompt }} · {{ chamada.modelo }} · chave {{ chamada.chave }} · {{ chamada.tokens ?? '?' }} tokens
      </template>
    </p>
  </div>
</template>

<style scoped>
.metadados {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
}
.resumo,
.ausente {
  margin: 0;
  color: var(--muted-foreground);
}
.campos {
  margin: 0;
  display: grid;
}
.linha {
  display: grid;
  grid-template-columns: 9rem minmax(0, 1fr);
  gap: 0.5rem;
  align-items: baseline;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--border);
}
.linha dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.linha dd.ausente {
  font-weight: 400;
}
h3 {
  margin: 0.5rem 0 0;
  font-size: 0.95rem;
}
.bloco {
  display: grid;
  gap: 0.35rem;
}
.bloco__titulo,
.lista li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
}
.disciplinas {
  width: 100%;
  border-collapse: collapse;
}
.disciplinas td {
  padding: 0.3rem 0.25rem;
  border-bottom: 1px solid var(--border);
}
.questoes {
  text-align: right;
  width: 3rem;
}
.selo {
  text-align: right;
  width: 1%;
}
.lista {
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.4rem;
}
.rodape {
  margin: 0.5rem 0 0;
  color: var(--muted-foreground);
}
</style>
