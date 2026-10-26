<script setup>
import Message from 'primevue/message'
import { partesDoArtigo } from '../../utils/normas'

// "O que a lei diz": o texto oficial dos artigos que a questão cobra, depois da correção, com o aviso quando o artigo
// foi alterado depois do ano da prova.

defineProps({ artigos: { type: Array, required: true } })

const AVISO_DE_MUDANCA = {
  depois: 'Este artigo foi alterado depois desta prova: pela lei de hoje, a resposta pode ser outra.',
  talvez: 'Este artigo foi alterado no ano desta prova: confira se a resposta ainda vale.'
}
</script>

<template>
  <section v-if="artigos.length" class="painel artigos">
    <div class="painel__cabecalho"><h2>O que a lei diz</h2></div>
    <div class="painel__corpo">
      <div v-for="artigo in artigos" :key="`${artigo.norma.id}-${artigo.numero}`" class="artigo">
        <div class="artigo__titulo">
          <b>{{ artigo.norma.nome }}, art. {{ artigo.numero }}</b>
          <span v-if="artigo.papel === 'relacionado'" class="pendente">relacionado</span>
          <span v-if="artigo.revogado" class="selo-aviso">revogado</span>
        </div>
        <Message v-if="artigo.mudou_depois_da_prova" severity="warn" size="small" :closable="false">
          {{ AVISO_DE_MUDANCA[artigo.mudou_depois_da_prova] }}
        </Message>
        <p v-if="artigo.texto" class="documento artigo__texto">
          <template v-for="(parte, i) in partesDoArtigo(artigo.texto)" :key="i">
            <span v-if="parte.nota" class="nota-de-redacao">{{ parte.texto }}</span>
            <template v-else>{{ parte.texto }}</template>
          </template>
        </p>
        <p v-else class="pendente">Este artigo não foi encontrado no texto da norma guardado no EduMind.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.artigos {
  margin-top: 1.25rem;
}
.artigos .painel__corpo {
  display: grid;
  gap: 1.25rem;
}
.artigo {
  display: grid;
  gap: 0.5rem;
}
.artigo__titulo {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.6rem;
}
.artigo__texto {
  margin: 0;
  max-height: 26rem;
  overflow: auto;
}
.nota-de-redacao {
  font-size: 0.8em;
  color: var(--muted-foreground);
}
.pendente {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.selo-aviso {
  font-size: 0.72rem;
  color: var(--warning-foreground);
  background: color-mix(in oklch, var(--warning) 22%, transparent);
  border-radius: 999px;
  padding: 0.05rem 0.55rem;
}
</style>
