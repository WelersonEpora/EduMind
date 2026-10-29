<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import TrechoCitado from '../edital/TrechoCitado.vue'
import { nomeDaNorma, pendenciasDaNorma, resumoDosArtigos } from '../../utils/normas'

// Uma norma citada num item, com a correção da identificação e do trecho dos artigos. O trecho novo é expandido de
// novo pelo parser no backend. O selo abre a página do edital com a citação da norma marcada (`citacao`, calculada no
// backend: a página e o termo achado, ou null).
const props = defineProps({
  norma: { type: Object, required: true },
  item: { type: Object, required: true },
  desativado: { type: Boolean, default: false }
})
const emit = defineEmits(['salvar', 'ver-trecho'])

// No formato que o selo e o leitor de páginas esperam. `ancora`: na página do item, a busca começa no trecho dele,
// para não marcar a mesma norma citada num item anterior.
const trecho = computed(() => {
  const citacao = props.norma.citacao
  return {
    rotulo: 'Citação da norma',
    verificado: Boolean(citacao),
    pagina: citacao?.pagina ?? props.item.pagina,
    pagina_encontrada: null,
    source_excerpt: citacao?.termo ?? nomeDaNorma(props.norma),
    ancora: citacao?.pagina === props.item.pagina ? props.item.source_excerpt : null
  }
})

const CAMPOS = [
  ['tipo', 'Tipo', 'Lei, Decreto-Lei, Resolução TJSP...'],
  ['numero', 'Número', '9.099'],
  ['ano', 'Ano', '1995'],
  ['nome', 'Nome', 'Código Penal'],
  ['artigos_texto', 'Trecho dos artigos', 'artigos 293 a 305; 307 (vazio = norma inteira)']
]

const editando = ref(false)
const formulario = ref({})
const pendencias = computed(() => pendenciasDaNorma(props.norma))
const artigos = computed(() => props.norma.artigos?.artigos?.map((a) => a.numero) ?? [])

function abrir() {
  formulario.value = Object.fromEntries(CAMPOS.map(([campo]) => [campo, props.norma[campo] ?? '']))
  editando.value = true
}

function salvar() {
  const alteracoes = {}
  for (const [campo] of CAMPOS) {
    const novo = formulario.value[campo].trim() || null
    if (novo !== (props.norma[campo] ?? null)) alteracoes[campo] = novo
  }
  editando.value = false
  if (Object.keys(alteracoes).length > 0) emit('salvar', alteracoes)
}
</script>

<template>
  <li class="norma">
    <div v-if="!editando" class="norma__linha">
      <i class="pi pi-book" />
      <span class="norma__nome">{{ nomeDaNorma(norma) }}</span>
      <span class="mono" :title="artigos.length ? `Artigos: ${artigos.join(', ')}` : ''">· {{ resumoDosArtigos(norma) }}</span>
      <TrechoCitado :item="trecho" @ver="emit('ver-trecho', $event)" />
      <span v-for="pendencia in pendencias" :key="pendencia" class="aviso" :title="`Citação no edital: “${norma.artigos_texto}”`">
        <i class="pi pi-exclamation-triangle" /> {{ pendencia }}
      </span>
      <button v-if="!desativado" type="button" class="lapis" aria-label="Corrigir a norma" title="Corrigir a norma" @click="abrir">
        <i class="pi pi-pencil" />
      </button>
    </div>
    <div v-if="!editando && norma.artigos_texto" class="norma__citacao">“{{ norma.artigos_texto }}”</div>

    <form v-if="editando" class="formulario" @submit.prevent="salvar">
      <label v-for="[campo, rotulo, exemplo] in CAMPOS" :key="campo" :class="{ largo: campo === 'artigos_texto' || campo === 'nome' }">
        <span class="rotulo">{{ rotulo }}</span>
        <InputText v-model="formulario[campo]" :placeholder="exemplo" size="small" />
      </label>
      <span class="formulario__botoes">
        <Button type="submit" label="Salvar" size="small" />
        <Button label="Cancelar" size="small" text severity="secondary" @click="editando = false" />
      </span>
    </form>
  </li>
</template>

<style scoped>
.norma {
  list-style: none;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.norma__linha {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem;
}
.norma .pi-book {
  font-size: 0.75rem;
}
.norma__nome {
  color: var(--foreground);
  font-weight: 600;
}
.norma__citacao {
  margin: 0.1rem 0 0 1.1rem;
  font-family: var(--font-doc);
  font-size: 0.8rem;
}
.aviso {
  font-size: 0.75rem;
  color: var(--warning-foreground);
  background: color-mix(in oklch, var(--warning) 22%, transparent);
  border-radius: 999px;
  padding: 0 0.5rem;
  cursor: help;
}
.lapis {
  border: 0;
  background: none;
  color: var(--muted-foreground);
  cursor: pointer;
  opacity: 0.5;
}
.lapis:hover {
  opacity: 1;
  color: var(--foreground);
}
.formulario {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  padding: 0.6rem;
  margin: 0.3rem 0;
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  background: var(--muted);
}
.formulario label {
  display: grid;
  gap: 0.15rem;
}
.formulario .largo {
  grid-column: 1 / -1;
}
.formulario__botoes {
  grid-column: 1 / -1;
  display: flex;
  gap: 0.35rem;
}
</style>
