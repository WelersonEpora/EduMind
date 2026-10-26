<script setup>
import { textoCorrido } from '../../utils/formatar'

// Uma questão no simulador (treino e prova completa): origem, texto de apoio, enunciado e alternativas como botões.
// Sem gabarito, marca a escolhida; com gabarito (depois de corrigida), a certa em verde e a escolhida errada em
// vermelho. As ações (Responder, Próxima...) vêm no slot.

const props = defineProps({
  questao: { type: Object, required: true },
  origem: { type: String, required: true },
  gabaritoNaoOficial: { type: Boolean, default: false },
  escolha: { type: String, default: null },
  gabarito: { type: String, default: null },
  bloqueada: { type: Boolean, default: false }
})
const emit = defineEmits(['update:escolha'])

function classeDaAlternativa(letra) {
  if (!props.gabarito) return { 'alternativa--escolhida': props.escolha === letra }
  return {
    'alternativa--certa': letra === props.gabarito,
    'alternativa--errada': letra === props.escolha && props.escolha !== props.gabarito
  }
}
</script>

<template>
  <article class="painel questao">
    <div class="painel__cabecalho">
      <span class="questao__origem">{{ origem }}</span>
      <span class="questao__selos">
        <slot name="selos" />
        <span v-if="gabaritoNaoOficial" class="selo-aviso" title="O gabarito desta prova não é o oficial definitivo">gabarito não oficial</span>
      </span>
    </div>
    <div class="painel__corpo">
      <div v-if="questao.texto_apoio" class="documento apoio">{{ textoCorrido(questao.texto_apoio) }}</div>
      <p class="enunciado">{{ textoCorrido(questao.enunciado) }}</p>

      <div class="alternativas" role="radiogroup" aria-label="Alternativas">
        <button
          v-for="alternativa in questao.alternativas"
          :key="alternativa.letra"
          type="button"
          role="radio"
          :aria-checked="escolha === alternativa.letra"
          class="alternativa"
          :class="classeDaAlternativa(alternativa.letra)"
          :disabled="bloqueada || Boolean(gabarito)"
          @click="emit('update:escolha', alternativa.letra)"
        >
          <span class="alternativa__letra">{{ alternativa.letra }}</span>
          <span>{{ textoCorrido(alternativa.texto) }}</span>
        </button>
      </div>

      <slot />
    </div>
  </article>
</template>

<style scoped>
.questao__origem {
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.questao__selos {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.selo-aviso {
  font-size: 0.72rem;
  color: var(--warning-foreground);
  background: color-mix(in oklch, var(--warning) 22%, transparent);
  border-radius: 999px;
  padding: 0.05rem 0.55rem;
}
.apoio {
  margin-bottom: 1rem;
  white-space: pre-line;
}
.enunciado {
  margin: 0 0 1rem;
  font-size: 1rem;
  line-height: 1.6;
  white-space: pre-line;
}
.alternativas {
  display: grid;
  gap: 0.5rem;
}
.alternativa {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: 0.95rem;
  line-height: 1.5;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--card);
  color: var(--foreground);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.alternativa:hover:not(:disabled) {
  border-color: var(--primary);
}
.alternativa:disabled {
  cursor: default;
}
.alternativa__letra {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 50%;
  border: 1px solid var(--border);
  font-weight: 700;
  font-size: 0.85rem;
}
.alternativa--escolhida {
  border-color: var(--primary);
  background: var(--accent);
}
.alternativa--escolhida .alternativa__letra {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}
.alternativa--certa {
  border-color: var(--positive);
  background: color-mix(in oklch, var(--positive) 12%, transparent);
}
.alternativa--certa .alternativa__letra {
  background: var(--positive);
  border-color: var(--positive);
  color: white;
}
.alternativa--errada {
  border-color: var(--negative);
  background: color-mix(in oklch, var(--negative) 10%, transparent);
}
.alternativa--errada .alternativa__letra {
  background: var(--negative);
  border-color: var(--negative);
  color: white;
}
</style>
