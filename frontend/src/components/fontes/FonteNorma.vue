<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import FonteDaNorma from './FonteDaNorma.vue'

// Uma norma citada no edital: confirmar a identidade (entra na biblioteca) e, depois, a URL oficial e o texto, que são
// da norma da biblioteca (FonteDaNorma, o mesmo da tela da norma).
const props = defineProps({
  fonte: { type: Object, required: true },
  ocupado: { type: Boolean, default: false }
})
const emit = defineEmits(['confirmar', 'desligar', 'buscar-url', 'definir-url', 'enviar-versao', 'processar-versao'])

const dataDoEdital = computed(() => props.fonte.vigencia?.dataDoEdital?.split('-').reverse().join('/'))

const CAMPOS = [
  ['jurisdicao', 'Jurisdição', 'BR, SP, TJSP'],
  ['tipo', 'Tipo', 'Lei, Decreto-Lei...'],
  ['numero', 'Número', '9.099'],
  ['ano', 'Ano', '1995'],
  ['nome', 'Nome', 'Código Penal']
]

const norma = computed(() => props.fonte.norma)
// Base do formulário: a norma da biblioteca que já tem a chave proposta, senão a proposta.
const base = computed(() => (norma.value && !props.fonte.confirmada ? norma.value : props.fonte.proposta) || {})
const formulario = ref({})
watch(
  base,
  (valor) => {
    formulario.value = Object.fromEntries(CAMPOS.map(([campo]) => [campo, valor[campo] ?? '']))
  },
  { immediate: true }
)

const titulo = computed(() => (props.fonte.confirmada ? norma.value.nome : base.value.nome))
const situacao = computed(() => {
  if (!props.fonte.confirmada) {
    return norma.value
      ? { rotulo: 'na biblioteca · confirmar ligação', severidade: 'info' }
      : { rotulo: 'identidade a confirmar', severidade: 'warn' }
  }
  if (norma.value.versoes.length === 0) return { rotulo: 'upload manual necessário', severidade: 'danger' }
  return { rotulo: `${norma.value.versoes.length} ${norma.value.versoes.length === 1 ? 'versão' : 'versões'}`, severidade: 'success' }
})

function confirmar() {
  emit('confirmar', { citacoes: props.fonte.citacoes.map((c) => c.id), ...formulario.value })
}
</script>

<template>
  <article class="painel fonte">
    <div class="painel__cabecalho">
      <h2>{{ titulo }}</h2>
      <Tag :value="situacao.rotulo" :severity="situacao.severidade" />
    </div>

    <div class="painel__corpo corpo">
      <section>
        <span class="rotulo">Citado no edital</span>
        <ul class="citacoes">
          <li v-for="citacao in fonte.citacoes" :key="citacao.id">
            {{ citacao.item_texto }}
            <span v-if="citacao.artigos_texto" class="mono citacao__artigos">· {{ citacao.artigos_texto }}</span>
          </li>
        </ul>
      </section>

      <!-- Identidade a confirmar -->
      <section v-if="!fonte.confirmada" class="identidade">
        <ul v-if="fonte.proposta?.alertas?.length" class="alertas">
          <li v-for="alerta in fonte.proposta.alertas" :key="alerta"><i class="pi pi-exclamation-triangle" /> {{ alerta }}</li>
        </ul>
        <p v-if="fonte.proposta?.doCatalogo" class="nota">Identificada pelo catálogo dos grandes códigos.</p>
        <form class="formulario" @submit.prevent="confirmar">
          <label v-for="[campo, rotulo, exemplo] in CAMPOS" :key="campo" :class="{ largo: campo === 'nome' }">
            <span class="rotulo">{{ rotulo }}</span>
            <InputText v-model="formulario[campo]" :placeholder="exemplo" size="small" />
          </label>
          <span class="formulario__botoes">
            <Button type="submit" :label="norma ? 'Confirmar e ligar à biblioteca' : 'Confirmar e incluir na biblioteca'" icon="pi pi-check" size="small" :disabled="ocupado" />
          </span>
        </form>
      </section>

      <!-- Norma confirmada: URL oficial e versões -->
      <template v-else>
        <p class="identificacao mono">
          {{ norma.chave }}
          <button type="button" class="link" :disabled="ocupado" @click="emit('desligar', fonte)">desfazer a confirmação</button>
        </p>

        <section v-if="fonte.vigencia && (fonte.vigencia.alteradosDepois || fonte.vigencia.talvezDepois)" class="vigencia">
          <i class="pi pi-exclamation-triangle" />
          <span>
            O texto enviado é mais novo que o edital ({{ dataDoEdital }}):
            <b>{{ fonte.vigencia.alteradosDepois }}</b> {{ fonte.vigencia.alteradosDepois === 1 ? 'artigo alterado' : 'artigos alterados' }} depois
            <template v-if="fonte.vigencia.talvezDepois"> e {{ fonte.vigencia.talvezDepois }} no mesmo ano (a nota só traz o ano)</template>.
            <template v-if="fonte.vigencia.citadosAlteradosDepois.length">
              Cobrados no edital: <b>{{ fonte.vigencia.citadosAlteradosDepois.join(', ') }}</b>.
            </template>
            <template v-if="fonte.vigencia.citadosTalvezDepois.length">
              Talvez: {{ fonte.vigencia.citadosTalvezDepois.join(', ') }}.
            </template>
            <template v-if="!fonte.vigencia.citadosAlteradosDepois.length && !fonte.vigencia.citadosTalvezDepois.length">
              Nenhum deles é cobrado no edital.
            </template>
          </span>
        </section>

        <FonteDaNorma
          :norma="norma"
          :ocupado="ocupado"
          @buscar-url="emit('buscar-url', $event)"
          @definir-url="(n, url) => emit('definir-url', n, url)"
          @enviar-versao="(n, arquivo) => emit('enviar-versao', n, arquivo)"
          @processar-versao="(n, versao) => emit('processar-versao', n, versao)"
        />
      </template>
    </div>
  </article>
</template>

<style scoped>
/* Item da grade das Fontes: sem isso, um conteúdo largo estica o card além da coluna. */
.fonte {
  min-width: 0;
}
.corpo {
  display: grid;
  gap: 0.9rem;
}
.citacoes {
  margin: 0.25rem 0 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.2rem;
  font-size: 0.9rem;
  /* URLs longas do edital ("Disponível em: <https://...>") quebram em qualquer ponto em vez de alargar o card. */
  overflow-wrap: anywhere;
}
.citacao__artigos {
  color: var(--muted-foreground);
}
.alertas {
  margin: 0 0 0.5rem;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}
.alertas li {
  list-style: none;
  font-size: 0.85rem;
  color: var(--warning-foreground);
  background: color-mix(in oklch, var(--warning) 22%, transparent);
  border-radius: 0.35rem;
  padding: 0.25rem 0.5rem;
}
.nota {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.formulario {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr) 7rem 5rem;
  gap: 0.5rem;
}
.formulario label {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
/* O campo de texto tem largura mínima própria; sem isso, estoura as colunas estreitas (Ano) para fora do card. */
.formulario :deep(input) {
  width: 100%;
  min-width: 0;
}
.formulario .largo,
.formulario__botoes {
  grid-column: 1 / -1;
}
.identificacao {
  margin: 0;
  color: var(--muted-foreground);
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
}
.link {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 0.8rem;
  color: var(--muted-foreground);
  text-decoration: underline;
  cursor: pointer;
}
.vigencia {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.85rem;
  padding: 0.5rem 0.7rem;
  border-radius: 0.4rem;
  color: var(--warning-foreground);
  background: color-mix(in oklch, var(--warning) 20%, transparent);
}
</style>
