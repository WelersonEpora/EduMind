<script setup>
// Um passo da página Como funciona: número, título, onde fica na tela, o texto (slot), quem faz e, ao lado, um recorte
// ilustrativo da tela (slot "recorte"). Com ia, o passo fica em violeta e mostra o que a IA faz e o que o orientador
// confere; com semIa, uma linha dizendo que ali não há IA.

defineProps({
  numero: { type: Number, required: true },
  titulo: { type: String, required: true },
  // Caminho até a tela: ['Edital', 'Revisão'].
  onde: { type: Array, required: true },
  quem: { type: Array, required: true },
  quemObservacao: { type: String, default: '' },
  // { faz, confere }
  ia: { type: Object, default: null },
  semIa: { type: String, default: '' },
  // Título do recorte; nos passos com IA, ganha o ícone.
  recorteTitulo: { type: String, required: true }
})
</script>

<template>
  <li :id="`passo-${numero}`" class="passo" :class="{ 'passo--ia': ia }">
    <span class="passo__numero">{{ numero }}</span>

    <div class="passo__texto">
      <h3>
        {{ titulo }}
        <span v-if="ia" class="selo-ia"><i class="pi pi-sparkles"></i>IA</span>
      </h3>
      <div class="onde">
        <template v-for="(parte, i) in onde" :key="parte">
          <i v-if="i" class="pi pi-angle-right"></i><b>{{ parte }}</b>
        </template>
      </div>
      <slot />
      <div v-if="ia" class="ia-caixa">
        <div><b><i class="pi pi-sparkles"></i>A IA faz</b>{{ ia.faz }}</div>
        <div class="ia-caixa__voce"><b>Você confere</b>{{ ia.confere }}</div>
      </div>
      <div v-if="semIa" class="sem-ia"><span>sem IA</span>{{ semIa }}</div>
      <div class="quem">
        {{ numero === 8 ? 'Quem vê:' : 'Quem faz:' }}
        <span v-for="papel in quem" :key="papel" class="quem__papel">{{ papel }}</span>
        <template v-if="quemObservacao">· {{ quemObservacao }}</template>
      </div>
    </div>

    <div class="recorte" :class="{ 'recorte--ia': ia }" aria-hidden="true">
      <span class="recorte__titulo"><i v-if="ia" class="pi pi-sparkles"></i>{{ recorteTitulo }}</span>
      <slot name="recorte" />
    </div>
  </li>
</template>

<style scoped>
.passo {
  display: grid;
  grid-template-columns: 2.4rem minmax(0, 62ch) minmax(0, 320px);
  justify-content: start;
  gap: 0.25rem 2rem;
  padding: 1.1rem 0;
  scroll-margin-top: 72px;
}
.passo + .passo {
  border-top: 1px dashed var(--border);
}
.passo__numero {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.95rem;
  background: var(--primary);
  color: var(--primary-foreground);
}
.passo--ia .passo__numero {
  background: var(--ia);
  box-shadow: 0 0 0 4px var(--ia-bg);
}
.passo__texto {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}
.passo__texto :deep(p) {
  margin: 0;
  max-width: 62ch;
}
.passo__texto :deep(ul) {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-width: 62ch;
}
.passo__texto :deep(li::marker) {
  color: var(--primary);
}
h3 {
  font-family: var(--font-display);
  font-size: 1.05rem;
  margin-top: 0.2rem;
}
.selo-ia {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font: 700 0.64rem var(--font-sans);
  letter-spacing: 0.07em;
  text-transform: uppercase;
  background: var(--ia);
  color: var(--primary-foreground);
  padding: 0.14rem 0.45rem;
  border-radius: 5px;
  vertical-align: 3px;
  margin-left: 0.35rem;
}
.selo-ia .pi {
  font-size: 0.7rem;
}
.onde {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.76rem;
  color: var(--muted-foreground);
}
.onde b {
  font-weight: 600;
  color: var(--accent-foreground);
  background: var(--accent);
  padding: 0.05rem 0.45rem;
  border-radius: 5px;
}
.onde .pi {
  font-size: 0.65rem;
}
.ia-caixa {
  border: 1px solid color-mix(in oklab, var(--ia) 35%, transparent);
  background: var(--ia-bg);
  border-radius: 10px;
  padding: 0.65rem 0.8rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.6rem 1.1rem;
  max-width: 62ch;
  font-size: 0.84rem;
}
.ia-caixa > div {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.ia-caixa b {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ia-foreground);
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.ia-caixa .ia-caixa__voce b {
  color: var(--accent-foreground);
}
.sem-ia {
  font-size: 0.8rem;
  color: var(--muted-foreground);
  max-width: 62ch;
}
.sem-ia span {
  margin-right: 0.45rem;
  font: 700 0.62rem var(--font-sans);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0.05rem 0.4rem;
  background: var(--muted);
  white-space: nowrap;
}
.quem {
  font-size: 0.76rem;
  color: var(--muted-foreground);
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  align-items: center;
}
.quem__papel {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.05rem 0.45rem;
  border-radius: 5px;
  border: 1px solid var(--border);
  color: var(--foreground);
}

.recorte {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem 0.85rem;
  font-size: 0.8rem;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
  box-shadow: 0 1px 2px color-mix(in oklab, var(--foreground) 6%, transparent);
}
.recorte--ia {
  border-color: color-mix(in oklab, var(--ia) 45%, var(--border));
}
.recorte__titulo {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted-foreground);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.recorte--ia .recorte__titulo {
  color: var(--ia-foreground);
}
.recorte__titulo .pi {
  font-size: 0.7rem;
}

@media (max-width: 900px) {
  .passo {
    grid-template-columns: 2.4rem minmax(0, 1fr);
  }
  .recorte {
    grid-column: 2;
    margin-top: 0.4rem;
  }
}
@media (max-width: 560px) {
  .passo {
    grid-template-columns: minmax(0, 1fr);
  }
  .recorte {
    grid-column: 1;
  }
  .ia-caixa {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
