<script setup>
import { computed } from 'vue'
import TrechoCitado from '../edital/TrechoCitado.vue'
import BotoesDeRevisao from './BotoesDeRevisao.vue'
import TextoEditavel from './TextoEditavel.vue'

// Revisão dos metadados: cada item com aprovar ou rejeitar, corrigir o texto (e o número de questões nas
// disciplinas). Cada linha é identificada pelo caminho que o backend usa ("campos.banca", "blocos.0.disciplinas.1").
const props = defineProps({
  metadados: { type: Object, required: true },
  desativado: { type: Boolean, default: false }
})
const emit = defineEmits(['ver-trecho', 'revisar'])

const ROTULOS = { banca: 'Banca', orgao: 'Órgão', cargo: 'Cargo', data_publicacao: 'Data de publicação (AAAA-MM-DD)' }

// As linhas na ordem da tela: { caminho, rotulo, item, campo (o que se edita), disciplina? }.
const linhas = computed(() => {
  const m = props.metadados
  const resultado = []
  for (const [chave, rotulo] of Object.entries(ROTULOS)) {
    if (m.campos[chave]) resultado.push({ caminho: `campos.${chave}`, rotulo, item: m.campos[chave], campo: 'valor' })
  }
  m.blocos.forEach((bloco, i) => {
    resultado.push({ caminho: `blocos.${i}`, rotulo: 'Bloco', item: bloco, campo: 'nome' })
    bloco.disciplinas.forEach((disciplina, j) => {
      resultado.push({ caminho: `blocos.${i}.disciplinas.${j}`, rotulo: 'Disciplina', item: disciplina, campo: 'nome', disciplina: true })
    })
  })
  m.regras_de_corte.forEach((regra, i) => {
    resultado.push({ caminho: `regras_de_corte.${i}`, rotulo: 'Regra de corte', item: regra, campo: 'descricao' })
  })
  if (m.discursiva) resultado.push({ caminho: 'discursiva', rotulo: 'Discursiva', item: m.discursiva, campo: 'descricao' })
  return resultado
})

// Grava ao sair do campo ou apertar Enter (evento "change"), não a cada tecla. Vazio = não informado.
function salvarQuestoes(linha, evento) {
  const texto = evento.target.value.trim()
  const valor = texto === '' ? null : Number(texto)
  if (valor !== null && !(Number.isInteger(valor) && valor >= 0)) {
    evento.target.value = linha.item.questoes ?? ''
    return
  }
  if (valor !== linha.item.questoes) emit('revisar', linha.caminho, { questoes: valor })
}
</script>

<template>
  <ul class="metadados">
    <li v-for="linha in linhas" :key="linha.caminho" class="linha" :class="[`linha--${linha.item.status || 'rascunho'}`, { 'linha--recuo': linha.disciplina }]">
      <BotoesDeRevisao
        :status="linha.item.status || 'rascunho'"
        :desativado="desativado"
        @mudar="emit('revisar', linha.caminho, { status: $event })"
      />
      <span class="rotulo linha__rotulo">{{ linha.rotulo }}</span>
      <TextoEditavel
        class="linha__texto"
        :texto="linha.item[linha.campo]"
        :editado="linha.item.editado === true"
        :desativado="desativado"
        @salvar="emit('revisar', linha.caminho, { [linha.campo]: $event })"
      />
      <span v-if="linha.disciplina" class="questoes">
        <input
          class="p-inputtext questoes__campo"
          type="number"
          min="0"
          :value="linha.item.questoes ?? ''"
          :disabled="desativado"
          aria-label="Número de questões"
          @change="salvarQuestoes(linha, $event)"
        />
        questões
      </span>
      <TrechoCitado :item="linha.item" @ver="emit('ver-trecho', $event)" />
    </li>
  </ul>
</template>

<style scoped>
.metadados {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.15rem;
}
.linha {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 0.25rem 0.4rem;
  border-left: 3px solid transparent;
  border-radius: 0.25rem;
}
.linha--recuo {
  margin-left: 1.5rem;
}
.linha__rotulo {
  width: 7.5rem;
  flex-shrink: 0;
  padding-top: 0.45rem;
}
.linha__texto {
  flex: 1;
  min-width: 12rem;
  padding-top: 0.3rem;
}
.linha :deep(.trecho) {
  margin-top: 0.3rem;
}
.linha--aprovado {
  border-left-color: var(--positive);
  background: color-mix(in oklch, var(--positive) 6%, transparent);
}
.linha--rejeitado {
  border-left-color: var(--negative);
  background: color-mix(in oklch, var(--negative) 5%, transparent);
}
.linha--rejeitado .linha__texto {
  text-decoration: line-through;
  color: var(--muted-foreground);
}
.questoes {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.questoes__campo {
  width: 3.5rem;
  padding: 0.25rem 0.4rem;
  text-align: center;
}
</style>
