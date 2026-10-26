<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import QuestaoSimulada from '../components/simulador/QuestaoSimulada.vue'
import ArtigosDaQuestao from '../components/simulador/ArtigosDaQuestao.vue'
import TabelaDeResultado from '../components/simulador/TabelaDeResultado.vue'
import DesempenhoDoAluno from '../components/simulador/DesempenhoDoAluno.vue'
import { buscarMeuDesempenho, treinarCadernoDeErros } from '../services/desempenho.service'
import {
  buscarResumoDoSimulador,
  iniciarTreino,
  responderQuestao,
  iniciarProvaCompleta,
  desistirDaProvaCompleta
} from '../services/simulador.service'
import { useSessao } from '../composables/useSessao'
import { duracaoLegivel } from '../utils/formatar'

// Simulador (etapas 5a, 5b e 5c). No início, o treino por disciplina, a prova completa e o desempenho do usuário, com o
// caderno de erros. O treino tem três momentos:
// escolher as disciplinas e a quantidade, responder uma questão por vez (a correção vem do servidor, com o texto dos
// artigos que a questão cobra) e ver o resultado, com a opção de refazer as erradas. A prova completa abre na sua
// própria tela (SimuladoView).

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { eAluno } = useSessao()

const resumo = ref(null)
const erro = ref(null)
const momento = ref('inicio')

// Início
const escolhidas = ref([])
const OPCOES_DE_QUANTIDADE = [
  { valor: 10, rotulo: '10' },
  { valor: 20, rotulo: '20' },
  { valor: null, rotulo: 'Todas' }
]
const quantidade = ref(10)
const disponiveis = computed(() =>
  (resumo.value?.disciplinas || []).filter((d) => escolhidas.value.includes(d.id)).reduce((soma, d) => soma + d.questoes, 0)
)
const vaiTer = computed(() => (quantidade.value == null ? disponiveis.value : Math.min(quantidade.value, disponiveis.value)))
const provasNaoOficiais = computed(() => (resumo.value?.provas || []).filter((p) => p.gabarito_situacao !== 'oficial_definitivo').length)

async function carregar(id) {
  resumo.value = null
  erro.value = null
  momento.value = 'inicio'
  try {
    resumo.value = await buscarResumoDoSimulador(id)
    escolhidas.value = resumo.value.disciplinas.map((d) => d.id)
  } catch (e) {
    erro.value = e.message
  }
}
watch(() => route.params.id, carregar, { immediate: true })

// Desempenho e caderno de erros: recarregados a cada volta ao início (depois de um treino).
const desempenho = ref(null)
async function carregarDesempenho() {
  try {
    desempenho.value = await buscarMeuDesempenho(route.params.id)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível carregar o desempenho', detail: e.message, life: 6000 })
  }
}
watch([() => route.params.id, momento], ([, m]) => m === 'inicio' && carregarDesempenho(), { immediate: true })

async function treinarCaderno() {
  try {
    const lista = await treinarCadernoDeErros(route.params.id)
    if (lista.length === 0) throw new Error('O caderno de erros está vazio.')
    comecar(lista)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível começar', detail: e.message, life: 6000 })
  }
}

function alternarTodas() {
  escolhidas.value = escolhidas.value.length === resumo.value.disciplinas.length ? [] : resumo.value.disciplinas.map((d) => d.id)
}

// Prova completa
const nomeDaProva = (prova) => `${prova.banca || 'Banca não informada'} ${prova.ano || ''}`.trim()
const provaEmAndamento = computed(() => {
  const andamento = resumo.value?.em_andamento
  return andamento ? resumo.value.provas.find((p) => p.id === andamento.prova_id) || null : null
})
const iniciando = ref(null)

function abrirProva(simuladoId) {
  router.push({ name: 'simulado', params: { id: route.params.id, simuladoId } })
}

async function fazerProva(prova) {
  const aviso = prova.questoes < prova.total ? `\n\nSó ${prova.questoes} das ${prova.total} questões estão disponíveis; as outras ainda estão em revisão.` : ''
  if (!window.confirm(`Começar a prova ${nomeDaProva(prova)}? Você terá ${duracaoLegivel(prova.duracao_minutos)} e o relógio não para.${aviso}`)) return
  iniciando.value = prova.id
  try {
    abrirProva((await iniciarProvaCompleta(route.params.id, prova.id)).id)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível começar', detail: e.message, life: 6000 })
  } finally {
    iniciando.value = null
  }
}

async function desistir() {
  if (!window.confirm('Desistir da prova em andamento? As respostas dela são descartadas.')) return
  try {
    await desistirDaProvaCompleta(route.params.id, resumo.value.em_andamento.id)
    await carregar(route.params.id)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível desistir', detail: e.message, life: 6000 })
  }
}

// Treino
const questoes = ref([])
const indice = ref(0)
const escolha = ref(null)
const correcao = ref(null)
const respondendo = ref(false)
const resultados = ref([])
const questao = computed(() => questoes.value[indice.value])
const acertos = computed(() => resultados.value.filter((r) => r.acertou).length)
const ultima = computed(() => indice.value === questoes.value.length - 1)

function comecar(lista) {
  questoes.value = lista
  indice.value = 0
  resultados.value = []
  escolha.value = null
  correcao.value = null
  momento.value = 'questao'
}

async function iniciar() {
  try {
    const lista = await iniciarTreino(route.params.id, { disciplinas: escolhidas.value, quantidade: quantidade.value })
    if (lista.length === 0) throw new Error('Nenhuma questão nas disciplinas escolhidas.')
    comecar(lista)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível começar', detail: e.message, life: 6000 })
  }
}

async function responder() {
  respondendo.value = true
  try {
    correcao.value = await responderQuestao(route.params.id, questao.value.id, escolha.value)
    resultados.value.push({ questao: questao.value, resposta: escolha.value, acertou: correcao.value.acertou })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível corrigir', detail: e.message, life: 6000 })
  } finally {
    respondendo.value = false
  }
}

function proxima() {
  if (ultima.value) {
    momento.value = 'fim'
    return
  }
  indice.value += 1
  escolha.value = null
  correcao.value = null
  window.scrollTo({ top: 0 })
}

// Fim
const porDisciplina = computed(() => {
  const mapa = new Map()
  for (const r of resultados.value) {
    const chave = r.questao.disciplina.texto
    if (!mapa.has(chave)) mapa.set(chave, { disciplina: chave, total: 0, acertos: 0 })
    const linha = mapa.get(chave)
    linha.total += 1
    if (r.acertou) linha.acertos += 1
  }
  return [...mapa.values()]
})
const erradas = computed(() => resultados.value.filter((r) => !r.acertou).map((r) => r.questao))
const percentual = (a, t) => (t ? Math.round((100 * a) / t) : 0)
</script>

<template>
  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <!-- Início: treino por disciplina e prova completa -->
  <template v-if="resumo && momento === 'inicio'">
    <div class="pagina-cabecalho">
      <p>
        Treine com as questões das provas anteriores da banca, separadas pelas disciplinas do edital, ou faça uma prova
        inteira com o tempo da prova real.
      </p>
    </div>

    <Message v-if="resumo.total === 0" severity="info" :closable="false">
      <template v-if="eAluno">Ainda não há questões para treinar neste edital. Avise o seu orientador.</template>
      <template v-else>
        Ainda não há questões para treinar: escolha provas na aba Provas anteriores e revise as questões. Entram as
        válidas, com gabarito, não anuladas e sem imagem.
      </template>
    </Message>

    <template v-else>
      <Message v-if="resumo.em_andamento" severity="warn" :closable="false" class="em-andamento">
        <span>
          Você tem uma prova em andamento<template v-if="provaEmAndamento">: <b>{{ nomeDaProva(provaEmAndamento) }}</b></template>.
          O relógio continua correndo.
        </span>
        <span class="em-andamento__botoes">
          <Button label="Continuar a prova" icon="pi pi-arrow-right" icon-pos="right" size="small" @click="abrirProva(resumo.em_andamento.id)" />
          <Button label="Desistir" size="small" text severity="secondary" @click="desistir" />
        </span>
      </Message>

      <section class="painel inicio">
        <div class="painel__cabecalho">
          <h2>Treino por disciplina</h2>
          <Button :label="escolhidas.length === resumo.disciplinas.length ? 'Desmarcar todas' : 'Marcar todas'" size="small" text @click="alternarTodas" />
        </div>
        <div class="painel__corpo">
          <p class="explicacao">Uma questão por vez. Depois de responder, você vê a resposta certa e o texto oficial dos artigos que a questão cobra.</p>
          <ul class="disciplinas">
            <li v-for="disciplina in resumo.disciplinas" :key="disciplina.id">
              <label>
                <Checkbox v-model="escolhidas" :value="disciplina.id" />
                <span class="disciplinas__nome">{{ disciplina.texto }}</span>
                <span class="mono disciplinas__total">{{ disciplina.questoes }}</span>
              </label>
            </li>
          </ul>
          <div class="comecar">
            <div class="quantidade">
              <span class="rotulo">Questões</span>
              <SelectButton v-model="quantidade" :options="OPCOES_DE_QUANTIDADE" option-label="rotulo" option-value="valor" :allow-empty="false" />
            </div>
            <Button :label="`Começar treino (${vaiTer})`" icon="pi pi-play" :disabled="vaiTer === 0" @click="iniciar" />
          </div>
        </div>
      </section>

      <section class="painel provas-completas">
        <div class="painel__cabecalho"><h2>Prova completa</h2></div>
        <div class="painel__corpo">
          <p class="explicacao">
            Uma prova anterior inteira, na ordem dela e com o tempo da prova real. Você pode pular questões e marcar para
            voltar depois; a correção sai só na entrega.
          </p>
          <table class="tabela-provas">
            <thead>
              <tr>
                <th>Prova</th>
                <th>Questões</th>
                <th>Tempo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="prova in resumo.provas" :key="prova.id">
                <td><b>{{ nomeDaProva(prova) }}</b></td>
                <td>
                  <span class="mono">{{ prova.questoes }}</span>
                  <span v-if="prova.questoes < prova.total" class="discreto"> de {{ prova.total }} (as outras estão em revisão)</span>
                </td>
                <td>
                  <span class="mono">{{ duracaoLegivel(prova.duracao_minutos) }}</span>
                  <span v-if="prova.duracao_estimada" class="discreto" title="O orientador ainda não informou o tempo da prova real: 3 minutos por questão"> estimado</span>
                </td>
                <td class="acao">
                  <Button
                    label="Fazer a prova"
                    icon="pi pi-stopwatch"
                    size="small"
                    outlined
                    :loading="iniciando === prova.id"
                    :disabled="Boolean(resumo.em_andamento) || Boolean(iniciando)"
                    @click="fazerProva(prova)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p class="nota">
        Questões de
        <template v-for="(prova, i) in resumo.provas" :key="prova.id">{{ nomeDaProva(prova) }}<template v-if="i < resumo.provas.length - 1">, </template></template>.
        <template v-if="provasNaoOficiais">O gabarito de {{ provasNaoOficiais === resumo.provas.length ? 'todas elas' : `${provasNaoOficiais} delas` }} não é o oficial definitivo.</template>
      </p>

      <section v-if="desempenho" class="painel meu-desempenho">
        <div class="painel__cabecalho">
          <h2>Meu desempenho</h2>
          <Button
            :label="`Treinar o caderno de erros (${desempenho.caderno})`"
            icon="pi pi-replay"
            size="small"
            :disabled="desempenho.caderno === 0"
            title="As questões cuja resposta mais recente está errada. Acertou, sai do caderno."
            @click="treinarCaderno"
          />
        </div>
        <div class="painel__corpo">
          <DesempenhoDoAluno :desempenho="desempenho" :edital-id="route.params.id" proprio />
        </div>
      </section>
    </template>
  </template>

  <!-- Uma questão por vez -->
  <template v-if="momento === 'questao' && questao">
    <div class="progresso">
      <span><b>Questão {{ indice + 1 }}</b> de {{ questoes.length }}</span>
      <div class="progresso__barra"><i :style="{ width: `${(100 * (indice + (correcao ? 1 : 0))) / questoes.length}%` }"></i></div>
      <span class="mono">{{ acertos }} {{ acertos === 1 ? 'acerto' : 'acertos' }}</span>
      <Button label="Encerrar" size="small" text severity="secondary" @click="momento = resultados.length ? 'fim' : 'inicio'" />
    </div>

    <QuestaoSimulada
      v-model:escolha="escolha"
      :questao="questao"
      :origem="`${questao.disciplina.texto} · ${questao.prova.banca} ${questao.prova.ano}, questão ${questao.numero}`"
      :gabarito-nao-oficial="!questao.prova.gabarito_oficial"
      :gabarito="correcao?.gabarito || null"
    >
      <div class="acoes">
        <Button v-if="!correcao" label="Responder" icon="pi pi-check" :disabled="!escolha" :loading="respondendo" @click="responder" />
        <template v-else>
          <span class="veredito" :class="correcao.acertou ? 'veredito--certo' : 'veredito--errado'">
            <i class="pi" :class="correcao.acertou ? 'pi-check-circle' : 'pi-times-circle'"></i>
            {{ correcao.acertou ? 'Você acertou.' : `Resposta certa: ${correcao.gabarito}.` }}
          </span>
          <Button :label="ultima ? 'Ver resultado' : 'Próxima questão'" icon="pi pi-arrow-right" icon-pos="right" @click="proxima" />
        </template>
      </div>
    </QuestaoSimulada>

    <!-- Os artigos que a questão cobra, depois da resposta -->
    <ArtigosDaQuestao v-if="correcao" :artigos="correcao.artigos" />
  </template>

  <!-- Resultado -->
  <template v-if="momento === 'fim'">
    <section class="painel resultado">
      <div class="painel__cabecalho"><h2>Resultado do treino</h2></div>
      <div class="painel__corpo">
        <p class="nota-final">
          <b>{{ acertos }}</b> de {{ resultados.length }} {{ resultados.length === 1 ? 'questão' : 'questões' }}
          <span class="mono">({{ percentual(acertos, resultados.length) }}%)</span>
        </p>
        <TabelaDeResultado :linhas="porDisciplina" />
        <div class="acoes">
          <Button v-if="erradas.length" :label="`Refazer as erradas (${erradas.length})`" icon="pi pi-replay" @click="comecar(erradas)" />
          <Button label="Novo treino" icon="pi pi-plus" :severity="erradas.length ? 'secondary' : undefined" :outlined="Boolean(erradas.length)" @click="momento = 'inicio'" />
        </div>
      </div>
    </section>
  </template>
</template>

<style scoped>
.em-andamento {
  margin-bottom: 1.25rem;
}
.em-andamento :deep(.p-message-text) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
}
.em-andamento__botoes {
  display: inline-flex;
  gap: 0.5rem;
}
.provas-completas,
.meu-desempenho {
  margin-top: 1.25rem;
}
.explicacao {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: var(--muted-foreground);
}
.disciplinas {
  margin: 0 0 1.25rem;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
  gap: 0.25rem 1.5rem;
}
.disciplinas label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0;
  cursor: pointer;
}
.disciplinas__nome {
  flex: 1;
}
.disciplinas__total {
  color: var(--muted-foreground);
}
.comecar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}
.quantidade {
  display: grid;
  gap: 0.35rem;
}
.tabela-provas {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.tabela-provas th {
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--border);
}
.tabela-provas td {
  padding: 0.5rem;
  border-bottom: 1px solid var(--border);
}
.tabela-provas .acao {
  text-align: right;
}
.discreto {
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.nota {
  margin: 1rem 0 0;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}

.progresso {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
.progresso__barra {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: var(--muted);
  overflow: hidden;
}
.progresso__barra i {
  display: block;
  height: 100%;
  background: var(--primary);
  transition: width 0.2s;
}

.acoes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1.25rem;
}
.veredito {
  margin-right: auto;
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

.nota-final {
  margin: 0 0 1rem;
  font-size: 1.4rem;
  font-family: var(--font-display);
}

@media (max-width: 640px) {
  .tabela-provas thead {
    display: none;
  }
  .tabela-provas tr {
    display: grid;
    gap: 0.25rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
  }
  .tabela-provas td {
    padding: 0;
    border: 0;
  }
  .tabela-provas .acao {
    text-align: left;
    margin-top: 0.35rem;
  }
}
</style>
