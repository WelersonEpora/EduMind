<script setup>
// Resultado por disciplina (treino e prova completa). emBranco: mostra a coluna das questões sem resposta.

defineProps({
  linhas: { type: Array, required: true },
  emBranco: { type: Boolean, default: false }
})

const percentual = (a, t) => (t ? Math.round((100 * a) / t) : 0)
</script>

<template>
  <table class="tabela-resultado">
    <thead>
      <tr>
        <th>Disciplina</th>
        <th class="numero">Acertos</th>
        <th v-if="emBranco" class="numero">Em branco</th>
        <th class="numero">%</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="linha in linhas" :key="linha.disciplina">
        <td>{{ linha.disciplina }}</td>
        <td class="numero">{{ linha.acertos }} de {{ linha.total }}</td>
        <td v-if="emBranco" class="numero">{{ linha.em_branco }}</td>
        <td class="numero">{{ percentual(linha.acertos, linha.total) }}%</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.tabela-resultado {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.tabela-resultado th {
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--border);
}
.tabela-resultado td {
  padding: 0.45rem 0.5rem;
  border-bottom: 1px solid var(--border);
}
.numero {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
