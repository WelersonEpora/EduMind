<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Message from 'primevue/message'
import QuestaoSimulada from '../components/simulador/QuestaoSimulada.vue'
import ArtigosDaQuestao from '../components/simulador/ArtigosDaQuestao.vue'
import TabelaDeResultado from '../components/simulador/TabelaDeResultado.vue'
import { buscarProvaCompleta, guardarQuestaoDaProva, entregarProvaCompleta } from '../services/simulador.service'
import { duracaoLegivel, relogio } from '../utils/formatar'

// Prova completa cronometrada (etapa 5b). A prova fica no servidor, com a hora de término: cada resposta e cada
// marcação são guardadas na hora, sem correção, e recarregar a página não reinicia o relógio. Quando o tempo acaba, a
// prova é entregue com o que foi respondido. Entregue, a tela mostra o resultado e a correção de cada questão.

const route = useRoute()
const toast = useToast()

const simulado = ref(null)
const erro = ref(null)
const indice = ref(0)
const entregando = ref(false)

// O relógio conta a partir do que o servidor disse que resta (o relógio do computador pode estar errado).
const restante = ref(0)
let fimLocal = 0
let temporizador = null
function acertarRelogio(segundos) {
  fimLocal = Date.now() + segundos * 1000
  restante.value = segundos
}
function pararRelogio() {
  clearInterval(temporizador)
  temporizador = null
}
function ligarRelogio() {
  pararRelogio()
  temporizador = setInterval(() => {
    restante.value = Math.max(0, Math.round((fimLocal - Date.now()) / 1000))
    if (restante.value === 0) {
      pararRelogio()
      entregar({ porTempo: true })
    }
  }, 1000)
}
onBeforeUnmount(pararRelogio)

function mostrar(estado) {
  simulado.value = estado
  if (estado.resultado) {
    pararRelogio()
  } else {
    acertarRelogio(estado.restante_segundos)
    ligarRelogio()
  }
}

async function carregar() {
  simulado.value = null
  erro.value = null
  indice.value = 0
  try {
    mostrar(await buscarProvaCompleta(route.params.id, route.params.simuladoId))
  } catch (e) {
    erro.value = e.message
  }
}
watch(() => route.params.simuladoId, carregar, { immediate: true })

const entregue = computed(() => Boolean(simulado.value?.resultado))
const questoes = computed(() => simulado.value?.questoes || [])
const questao = computed(() => questoes.value[indice.value])
const respondidas = computed(() => questoes.value.filter((q) => simulado.value.respostas[q.id]).length)
const marcadas = computed(() => new Set(simulado.value?.marcadas || []))
const nomeDaProva = computed(() => {
  const p = simulado.value?.prova
  return p ? `${p.banca || 'Banca não informada'} ${p.ano || ''}`.trim() : ''
})

// No celular, o mapa fica recolhido (são até 100 números antes da questão).
const mapaAberto = ref(false)

function irPara(i) {
  indice.value = i
  mapaAberto.value = false
  window.scrollTo({ top: 0 })
}

// Guarda na hora; se o servidor recusar, volta como estava.
async function guardar(campos, desfazer) {
  try {
    const guardado = await guardarQuestaoDaProva(route.params.id, simulado.value.id, questao.value.id, campos)
    acertarRelogio(guardado.restante_segundos)
  } catch (e) {
    desfazer()
    toast.add({ severity: 'error', summary: 'Não foi possível guardar', detail: e.message, life: 6000 })
    if (e.response?.status === 409) carregar()
  }
}

function escolher(letra) {
  const id = questao.value.id
  const antes = simulado.value.respostas[id] || null
  simulado.value.respostas = { ...simulado.value.respostas, [id]: letra }
  guardar({ resposta: letra }, () => (simulado.value.respostas = { ...simulado.value.respostas, [id]: antes }))
}

function limpar() {
  const id = questao.value.id
  const antes = simulado.value.respostas[id]
  const { [id]: _, ...resto } = simulado.value.respostas
  simulado.value.respostas = resto
  guardar({ resposta: null }, () => (simulado.value.respostas = { ...simulado.value.respostas, [id]: antes }))
}

function alternarMarcada() {
  const id = questao.value.id
  const marcada = !marcadas.value.has(id)
  const aplicar = (sim) => {
    simulado.value.marcadas = sim ? [...simulado.value.marcadas.filter((m) => m !== id), id] : simulado.value.marcadas.filter((m) => m !== id)
  }
  aplicar(marcada)
  guardar({ marcada }, () => aplicar(!marcada))
}

async function entregar({ porTempo = false } = {}) {
  if (!porTempo) {
    const emBranco = questoes.value.length - respondidas.value
    const partes = []
    if (emBranco) partes.push(`${emBranco} ${emBranco === 1 ? 'questão em branco' : 'questões em branco'}`)
    if (marcadas.value.size) partes.push(`${marcadas.value.size} ${marcadas.value.size === 1 ? 'marcada' : 'marcadas'} para revisar`)
    if (!window.confirm(`Entregar a prova?${partes.length ? `\n\nAinda há ${partes.join(' e ')}.` : ''}\n\nDepois de entregar, não dá para mudar as respostas.`)) return
  }
  entregando.value = true
  try {
    mostrar(await entregarProvaCompleta(route.params.id, simulado.value.id))
    indice.value = 0
    window.scrollTo({ top: 0 })
    if (porTempo) toast.add({ severity: 'info', summary: 'O tempo acabou', detail: 'A prova foi entregue com o que você respondeu.', life: 8000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível entregar', detail: e.message, life: 6000 })
  } finally {
    entregando.value = false
  }
}

// O mapa das questões: durante a prova, respondida, em branco e marcada; depois, certa, errada e em branco.
function classeNoMapa(q, i) {
  const classes = { 'mapa__questao--atual': i === indice.value }
  if (entregue.value) {
    if (!q.resposta) classes['mapa__questao--branco'] = true
    else classes[q.acertou ? 'mapa__questao--certa' : 'mapa__questao--errada'] = true
  } else {
    if (simulado.value.respostas[q.id]) classes['mapa__questao--respondida'] = true
    if (marcadas.value.has(q.id)) classes['mapa__questao--marcada'] = true
  }
  return classes
}

const percentual = (a, t) => (t ? Math.round((100 * a) / t) : 0)
</script>

<template>
  <router-link :to="{ name: 'simulador', params: { id: route.params.id } }" class="voltar">
    <i class="pi pi-arrow-left"></i>Simulador
  </router-link>

  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <template v-if="simulado">
    <!-- Barra da prova: nome, relógio e entrega -->
    <div class="barra" :class="{ 'barra--fim': !entregue && restante <= 300 }">
      <div class="barra__prova">
        <b>{{ nomeDaProva }}</b>
        <span class="discreto">
          {{ questoes.length }} questões<template v-if="questoes.length < simulado.prova.total"> de {{ simulado.prova.total }}</template>
          · {{ duracaoLegivel(simulado.duracao_minutos) }}<template v-if="simulado.duracao_estimada"> (estimado)</template>
        </span>
      </div>
      <template v-if="!entregue">
        <span class="discreto">{{ respondidas }} de {{ questoes.length }} respondidas</span>
        <span class="barra__relogio mono" role="timer" :aria-label="`Tempo restante: ${relogio(restante)}`">
          <i class="pi pi-stopwatch"></i>{{ relogio(restante) }}
        </span>
        <Button label="Entregar" icon="pi pi-send" size="small" :loading="entregando" @click="entregar()" />
      </template>
      <span v-else class="discreto">Entregue</span>
    </div>

    <!-- Resultado -->
    <section v-if="entregue" class="painel resultado">
      <div class="painel__cabecalho"><h2>Resultado</h2></div>
      <div class="painel__corpo">
        <p class="nota-final">
          <b>{{ simulado.resultado.acertos }}</b> de {{ simulado.resultado.total }} questões
          <span class="mono">({{ percentual(simulado.resultado.acertos, simulado.resultado.total) }}%)</span>
          <span v-if="simulado.resultado.em_branco" class="discreto"> · {{ simulado.resultado.em_branco }} em branco</span>
        </p>
        <TabelaDeResultado :linhas="simulado.resultado.por_disciplina" em-branco />
        <p class="discreto rodape">Abaixo, cada questão com a resposta certa e o texto da lei. Clique nos números para navegar.</p>
      </div>
    </section>

    <!-- Mapa das questões -->
    <Button
      class="mapa-alternar"
      :label="mapaAberto ? 'Esconder as questões' : `Questão ${questao?.numero ?? ''} · ver todas`"
      :icon="mapaAberto ? 'pi pi-chevron-up' : 'pi pi-th-large'"
      size="small"
      outlined
      severity="secondary"
      @click="mapaAberto = !mapaAberto"
    />
    <nav class="mapa" :class="{ 'mapa--aberto': mapaAberto }" aria-label="Questões da prova">
      <button
        v-for="(q, i) in questoes"
        :key="q.id"
        type="button"
        class="mapa__questao mono"
        :class="classeNoMapa(q, i)"
        :aria-current="i === indice ? 'true' : undefined"
        :title="`Questão ${q.numero} · ${q.disciplina.texto}`"
        @click="irPara(i)"
      >
        {{ q.numero }}
      </button>
    </nav>
    <p class="legenda discreto" :class="{ 'legenda--aberta': mapaAberto }">
      <template v-if="!entregue">
        <span><i class="ponto ponto--respondida"></i>respondida</span>
        <span><i class="ponto"></i>em branco</span>
        <span><i class="ponto ponto--marcada"></i>marcada para revisar</span>
      </template>
      <template v-else>
        <span><i class="ponto ponto--certa"></i>certa</span>
        <span><i class="ponto ponto--errada"></i>errada</span>
        <span><i class="ponto"></i>em branco</span>
      </template>
    </p>

    <!-- A questão -->
    <QuestaoSimulada
      v-if="questao"
      :questao="questao"
      :origem="`Questão ${questao.numero} · ${questao.disciplina.texto}`"
      :gabarito-nao-oficial="!simulado.prova.gabarito_oficial && entregue"
      :escolha="entregue ? questao.resposta : simulado.respostas[questao.id] || null"
      :gabarito="entregue ? questao.gabarito : null"
      :bloqueada="entregando"
      @update:escolha="escolher"
    >
      <template #selos>
        <span v-if="!entregue && marcadas.has(questao.id)" class="selo-marcada"><i class="pi pi-flag-fill"></i> marcada</span>
      </template>

      <div class="acoes">
        <template v-if="!entregue">
          <Button
            :label="marcadas.has(questao.id) ? 'Desmarcar' : 'Marcar para revisar'"
            :icon="marcadas.has(questao.id) ? 'pi pi-flag-fill' : 'pi pi-flag'"
            size="small"
            text
            severity="secondary"
            @click="alternarMarcada"
          />
          <Button v-if="simulado.respostas[questao.id]" label="Limpar resposta" size="small" text severity="secondary" @click="limpar" />
        </template>
        <span v-else class="veredito" :class="questao.acertou ? 'veredito--certo' : 'veredito--errado'">
          <i class="pi" :class="questao.acertou ? 'pi-check-circle' : 'pi-times-circle'"></i>
          <template v-if="questao.acertou">Você acertou.</template>
          <template v-else-if="questao.resposta">Você marcou {{ questao.resposta }}; a resposta certa é {{ questao.gabarito }}.</template>
          <template v-else>Em branco; a resposta certa é {{ questao.gabarito }}.</template>
        </span>
        <span class="navegacao">
          <Button icon="pi pi-arrow-left" label="Anterior" size="small" outlined severity="secondary" :disabled="indice === 0" @click="irPara(indice - 1)" />
          <Button icon="pi pi-arrow-right" icon-pos="right" label="Próxima" size="small" outlined :disabled="indice === questoes.length - 1" @click="irPara(indice + 1)" />
        </span>
      </div>
    </QuestaoSimulada>

    <ArtigosDaQuestao v-if="entregue && questao" :artigos="questao.artigos" />
  </template>
</template>

<style scoped>
.voltar {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: var(--muted-foreground);
  text-decoration: none;
}
.voltar:hover {
  color: var(--primary);
}
.barra {
  position: sticky;
  /* logo abaixo da barra de cima do sistema (56px) */
  top: 64px;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.25rem;
  padding: 0.7rem 1rem;
  margin-bottom: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  background: var(--card);
}
.barra__prova {
  display: grid;
  margin-right: auto;
}
.barra__relogio {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1.15rem;
  font-weight: 600;
}
.barra--fim .barra__relogio {
  color: var(--negative);
}
.discreto {
  font-size: 0.82rem;
  color: var(--muted-foreground);
}
.resultado {
  margin-bottom: 1.25rem;
}
.nota-final {
  margin: 0 0 1rem;
  font-size: 1.4rem;
  font-family: var(--font-display);
}
.rodape {
  margin: 1rem 0 0;
}

.mapa {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.mapa__questao {
  min-width: 2.2rem;
  height: 2rem;
  padding: 0 0.3rem;
  border: 1px solid var(--border);
  border-radius: 0.35rem;
  background: var(--card);
  color: var(--foreground);
  font-size: 0.8rem;
  cursor: pointer;
}
.mapa__questao:hover {
  border-color: var(--primary);
}
.mapa__questao--respondida {
  background: var(--accent);
  border-color: var(--primary);
}
.mapa__questao--marcada {
  box-shadow: inset 0 -3px 0 var(--warning);
}
.mapa__questao--certa {
  background: color-mix(in oklch, var(--positive) 18%, transparent);
  border-color: var(--positive);
}
.mapa__questao--errada {
  background: color-mix(in oklch, var(--negative) 14%, transparent);
  border-color: var(--negative);
}
.mapa__questao--atual {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
  font-weight: 700;
}
.legenda {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 0.5rem 0 1rem;
}
.legenda span {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.ponto {
  display: inline-block;
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 0.2rem;
  border: 1px solid var(--border);
  background: var(--card);
}
.ponto--respondida {
  background: var(--accent);
  border-color: var(--primary);
}
.ponto--marcada {
  box-shadow: inset 0 -3px 0 var(--warning);
}
.ponto--certa {
  background: color-mix(in oklch, var(--positive) 18%, transparent);
  border-color: var(--positive);
}
.ponto--errada {
  background: color-mix(in oklch, var(--negative) 14%, transparent);
  border-color: var(--negative);
}

.selo-marcada {
  font-size: 0.72rem;
  color: var(--warning-foreground);
  background: color-mix(in oklch, var(--warning) 22%, transparent);
  border-radius: 999px;
  padding: 0.05rem 0.55rem;
}
.acoes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-top: 1.25rem;
}
.navegacao {
  display: inline-flex;
  gap: 0.5rem;
  margin-left: auto;
}
.veredito {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
}
.veredito--certo {
  color: var(--positive);
}
.veredito--errado {
  color: var(--negative);
}

.mapa-alternar {
  display: none;
}
@media (max-width: 640px) {
  .mapa-alternar {
    display: inline-flex;
    margin-bottom: 0.75rem;
  }
  .mapa:not(.mapa--aberto),
  .legenda:not(.legenda--aberta) {
    display: none;
  }
  .barra {
    top: 56px;
    padding: 0.5rem 0.75rem;
  }
}
</style>
