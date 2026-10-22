<script setup>
import { ref } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { urlDoArquivoDaProva } from '../../services/provas.service'

// Uma questão lida da prova: problemas da conferência, texto de apoio, enunciado, alternativas com o gabarito e as
// decisões do orientador (validar, descartar, corrigir o gabarito ou o texto).
const props = defineProps({
  questao: { type: Object, required: true },
  provaId: { type: String, required: true },
  ocupado: { type: Boolean, default: false }
})
const emit = defineEmits(['revisar'])

const STATUS = {
  valida: { rotulo: 'válida', severidade: 'success' },
  a_revisar: { rotulo: 'a revisar', severidade: 'warn' },
  descartada: { rotulo: 'descartada', severidade: 'secondary' }
}
const LETRAS = ['A', 'B', 'C', 'D', 'E'].map((letra) => ({ letra }))

// Correção do texto (quando a IA copiou errado): enunciado e alternativas.
const editando = ref(false)
const rascunho = ref({ enunciado: '', alternativas: [] })
function editar() {
  rascunho.value = { enunciado: props.questao.enunciado, alternativas: props.questao.alternativas.map((a) => ({ ...a })) }
  editando.value = true
}
function salvar() {
  emit('revisar', { enunciado: rascunho.value.enunciado, alternativas: rascunho.value.alternativas })
  editando.value = false
}
</script>

<template>
  <article class="painel questao" :class="`questao--${questao.status}`">
    <div class="painel__cabecalho cabecalho">
      <div>
        <h3>Questão {{ questao.numero }}</h3>
        <span class="disciplina">{{ questao.disciplina || 'sem disciplina' }}</span>
      </div>
      <div class="marcas">
        <Tag v-if="questao.anulada" value="anulada" severity="danger" />
        <Tag v-if="questao.editada" value="corrigida" severity="info" />
        <Tag :value="STATUS[questao.status].rotulo" :severity="STATUS[questao.status].severidade" />
      </div>
    </div>

    <div class="painel__corpo corpo">
      <ul v-if="questao.problemas.length" class="problemas">
        <li v-for="problema in questao.problemas" :key="problema"><i class="pi pi-exclamation-triangle" /> {{ problema }}</li>
      </ul>

      <details v-if="questao.texto_apoio" class="apoio">
        <summary>Texto de apoio</summary>
        <p>{{ questao.texto_apoio }}</p>
      </details>

      <template v-if="editando">
        <Textarea v-model="rascunho.enunciado" auto-resize rows="3" class="campo" />
        <div v-for="alternativa in rascunho.alternativas" :key="alternativa.letra" class="alternativa-edicao">
          <b>({{ alternativa.letra }})</b>
          <Textarea v-model="alternativa.texto" auto-resize rows="1" class="campo" />
        </div>
        <div class="acoes">
          <Button label="Salvar correção" size="small" :disabled="ocupado" @click="salvar" />
          <Button label="Cancelar" size="small" severity="secondary" text @click="editando = false" />
        </div>
      </template>
      <template v-else>
        <p class="enunciado">{{ questao.enunciado }}</p>
        <ol class="alternativas">
          <li
            v-for="alternativa in questao.alternativas"
            :key="alternativa.letra"
            :class="{ 'alternativa--correta': alternativa.letra === questao.gabarito }"
          >
            <b>({{ alternativa.letra }})</b> {{ alternativa.texto }}
            <i v-if="alternativa.letra === questao.gabarito" class="pi pi-check" title="Gabarito" />
          </li>
        </ol>
      </template>

      <div class="acoes">
        <span class="gabarito">
          Gabarito
          <Select
            :model-value="questao.gabarito"
            :options="LETRAS"
            option-label="letra"
            option-value="letra"
            placeholder="—"
            show-clear
            size="small"
            :disabled="ocupado"
            @update:model-value="emit('revisar', { gabarito: $event ?? null })"
          />
        </span>
        <Button v-if="questao.status !== 'valida'" label="Validar" icon="pi pi-check" size="small" :disabled="ocupado" @click="emit('revisar', { status: 'valida' })" />
        <Button
          v-if="questao.status !== 'descartada'"
          label="Descartar"
          size="small"
          severity="secondary"
          outlined
          :disabled="ocupado"
          @click="emit('revisar', { status: 'descartada' })"
        />
        <Button
          v-if="questao.status !== 'a_revisar'"
          label="Voltar para revisão"
          size="small"
          severity="secondary"
          text
          :disabled="ocupado"
          @click="emit('revisar', { status: 'a_revisar' })"
        />
        <Button v-if="!editando" label="Corrigir texto" size="small" severity="secondary" text @click="editar" />
        <a v-if="questao.pagina" :href="`${urlDoArquivoDaProva(provaId, 'prova')}#page=${questao.pagina}`" target="_blank" rel="noopener" class="pdf">
          ver no PDF (p. {{ questao.pagina }})
        </a>
      </div>
    </div>
  </article>
</template>

<style scoped>
.questao {
  min-width: 0;
}
.questao--a_revisar {
  border-color: var(--warning);
}
.questao--descartada {
  opacity: 0.65;
}
.cabecalho {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}
.cabecalho h3 {
  margin: 0;
  font-size: 0.95rem;
}
.disciplina {
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.marcas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.corpo {
  display: grid;
  gap: 0.6rem;
}
.problemas {
  margin: 0;
  padding: 0.5rem 0.7rem;
  list-style: none;
  border-radius: 0.4rem;
  font-size: 0.85rem;
  color: var(--warning-foreground);
  background: color-mix(in oklch, var(--warning) 20%, transparent);
}
.apoio summary {
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.apoio p {
  white-space: pre-wrap;
  font-family: var(--font-doc);
  font-size: 0.9rem;
}
.enunciado {
  margin: 0;
  white-space: pre-wrap;
  font-family: var(--font-doc);
  line-height: 1.5;
}
.alternativas {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
  font-family: var(--font-doc);
}
.alternativas li {
  padding: 0.2rem 0.4rem;
  border-radius: 0.3rem;
}
.alternativa--correta {
  background: color-mix(in oklch, var(--positive) 16%, transparent);
}
.alternativa-edicao {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  gap: 0.4rem;
  align-items: start;
}
.campo {
  width: 100%;
}
.acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.gabarito {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.pdf {
  font-size: 0.8rem;
  margin-left: auto;
}
</style>
