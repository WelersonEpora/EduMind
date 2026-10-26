<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import { buscarResumoDoSimulador, iniciarTreino, responderQuestao } from '../services/simulador.service'
import { useSessao } from '../composables/useSessao'
import { textoCorrido } from '../utils/formatar'
import { partesDoArtigo } from '../utils/normas'

// Simulador, treino por disciplina (etapa 5a). Três momentos: escolher as disciplinas e a quantidade, responder uma
// questão por vez (a correção vem do servidor, com o texto dos artigos que a questão cobra) e ver o resultado, com a
// opção de refazer as erradas.

const route = useRoute()
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

function alternarTodas() {
  escolhidas.value = escolhidas.value.length === resumo.value.disciplinas.length ? [] : resumo.value.disciplinas.map((d) => d.id)
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

function classeDaAlternativa(letra) {
  if (!correcao.value) return { 'alternativa--escolhida': escolha.value === letra }
  return {
    'alternativa--certa': letra === correcao.value.gabarito,
    'alternativa--errada': letra === escolha.value && !correcao.value.acertou
  }
}

const AVISO_DE_MUDANCA = {
  depois: 'Este artigo foi alterado depois desta prova: pela lei de hoje, a resposta pode ser outra.',
  talvez: 'Este artigo foi alterado no ano desta prova: confira se a resposta ainda vale.'
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

  <!-- Início: disciplinas e quantidade -->
  <template v-if="resumo && momento === 'inicio'">
    <div class="pagina-cabecalho">
      <p>
        Treine com as questões das provas anteriores da banca, separadas pelas disciplinas do edital. Depois de responder,
        você vê a resposta certa e o texto oficial dos artigos que a questão cobra.
      </p>
    </div>

    <Message v-if="resumo.total === 0" severity="info" :closable="false">
      <template v-if="eAluno">Ainda não há questões para treinar neste edital. Avise o seu orientador.</template>
      <template v-else>
        Ainda não há questões para treinar: escolha provas na aba Provas anteriores e revise as questões. Entram as
        válidas, com gabarito, não anuladas e sem imagem.
      </template>
    </Message>

    <section v-else class="painel inicio">
      <div class="painel__cabecalho">
        <h2>Treino por disciplina</h2>
        <Button :label="escolhidas.length === resumo.disciplinas.length ? 'Desmarcar todas' : 'Marcar todas'" size="small" text @click="alternarTodas" />
      </div>
      <div class="painel__corpo">
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
        <p class="nota">
          Questões de
          <template v-for="(prova, i) in resumo.provas" :key="prova.id">{{ prova.banca }} {{ prova.ano }}<template v-if="i < resumo.provas.length - 1">, </template></template>.
          <template v-if="provasNaoOficiais">O gabarito de {{ provasNaoOficiais === resumo.provas.length ? 'todas elas' : `${provasNaoOficiais} delas` }} não é o oficial definitivo.</template>
        </p>
      </div>
    </section>
  </template>

  <!-- Uma questão por vez -->
  <template v-if="momento === 'questao' && questao">
    <div class="progresso">
      <span><b>Questão {{ indice + 1 }}</b> de {{ questoes.length }}</span>
      <div class="progresso__barra"><i :style="{ width: `${(100 * (indice + (correcao ? 1 : 0))) / questoes.length}%` }"></i></div>
      <span class="mono">{{ acertos }} {{ acertos === 1 ? 'acerto' : 'acertos' }}</span>
      <Button label="Encerrar" size="small" text severity="secondary" @click="momento = resultados.length ? 'fim' : 'inicio'" />
    </div>

    <article class="painel questao">
      <div class="painel__cabecalho">
        <span class="questao__origem">
          {{ questao.disciplina.texto }} · {{ questao.prova.banca }} {{ questao.prova.ano }}, questão {{ questao.numero }}
        </span>
        <span v-if="!questao.prova.gabarito_oficial" class="questao__aviso" title="O gabarito desta prova não é o oficial definitivo">gabarito não oficial</span>
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
            :disabled="Boolean(correcao)"
            @click="escolha = alternativa.letra"
          >
            <span class="alternativa__letra">{{ alternativa.letra }}</span>
            <span>{{ textoCorrido(alternativa.texto) }}</span>
          </button>
        </div>

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
      </div>
    </article>

    <!-- Os artigos que a questão cobra, depois da resposta -->
    <section v-if="correcao && correcao.artigos.length" class="painel artigos">
      <div class="painel__cabecalho"><h2>O que a lei diz</h2></div>
      <div class="painel__corpo">
        <div v-for="artigo in correcao.artigos" :key="`${artigo.norma.id}-${artigo.numero}`" class="artigo">
          <div class="artigo__titulo">
            <b>{{ artigo.norma.nome }}, art. {{ artigo.numero }}</b>
            <span v-if="artigo.papel === 'relacionado'" class="pendente">relacionado</span>
            <span v-if="artigo.revogado" class="questao__aviso">revogado</span>
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

  <!-- Resultado -->
  <template v-if="momento === 'fim'">
    <section class="painel resultado">
      <div class="painel__cabecalho"><h2>Resultado do treino</h2></div>
      <div class="painel__corpo">
        <p class="nota-final">
          <b>{{ acertos }}</b> de {{ resultados.length }} {{ resultados.length === 1 ? 'questão' : 'questões' }}
          <span class="mono">({{ percentual(acertos, resultados.length) }}%)</span>
        </p>
        <table class="tabela-resultado">
          <thead>
            <tr><th>Disciplina</th><th class="numero">Acertos</th><th class="numero">%</th></tr>
          </thead>
          <tbody>
            <tr v-for="linha in porDisciplina" :key="linha.disciplina">
              <td>{{ linha.disciplina }}</td>
              <td class="numero">{{ linha.acertos }} de {{ linha.total }}</td>
              <td class="numero">{{ percentual(linha.acertos, linha.total) }}%</td>
            </tr>
          </tbody>
        </table>
        <div class="acoes">
          <Button v-if="erradas.length" :label="`Refazer as erradas (${erradas.length})`" icon="pi pi-replay" @click="comecar(erradas)" />
          <Button label="Novo treino" icon="pi pi-plus" :severity="erradas.length ? 'secondary' : undefined" :outlined="Boolean(erradas.length)" @click="momento = 'inicio'" />
        </div>
      </div>
    </section>
  </template>
</template>

<style scoped>
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

.questao__origem {
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.questao__aviso {
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

.nota-final {
  margin: 0 0 1rem;
  font-size: 1.4rem;
  font-family: var(--font-display);
}
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
