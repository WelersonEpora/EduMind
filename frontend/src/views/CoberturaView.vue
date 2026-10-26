<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { buscarArtigosDaVersao, buscarCobertura, buscarEdital, conferirEstrutura } from '../services/editais.service'
import { nomeDaNorma, partesDoArtigo } from '../utils/normas'

// Cobertura do edital (etapa 2c): cada artigo pedido nos itens aprovados, cruzado com o texto da norma na biblioteca.
// Encontrado, revogado ou faltando; o alerta de vigência marca os alterados depois da publicação do edital.
const route = useRoute()
const toast = useToast()

const edital = ref(null)
const cobertura = ref(null)
const erro = ref(null)
const filtro = ref('todos')

async function carregar(id) {
  edital.value = null
  cobertura.value = null
  erro.value = null
  try {
    edital.value = await buscarEdital(id)
    cobertura.value = await buscarCobertura(id)
  } catch (e) {
    erro.value = e.message
  }
}

watch(() => route.params.id, carregar, { immediate: true })

const FILTROS = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'faltando', rotulo: 'Faltando' },
  { valor: 'revogado', rotulo: 'Revogados' },
  { valor: 'vigencia', rotulo: 'Alterados depois do edital' },
  { valor: 'questoes', rotulo: 'Com questões' },
  { valor: 'sem_questoes', rotulo: 'Sem questões' }
]

function passaNoFiltro(artigo) {
  if (filtro.value === 'todos') return true
  if (filtro.value === 'vigencia') return Boolean(artigo.vigencia)
  if (filtro.value === 'questoes') return Boolean(artigo.questoes?.length)
  if (filtro.value === 'sem_questoes') return artigo.situacao === 'encontrado' && !artigo.questoes?.length
  return artigo.situacao === filtro.value
}

// A árvore com só os artigos do filtro; com filtro, some o que ficou vazio.
const disciplinas = computed(() => {
  if (!cobertura.value) return []
  return cobertura.value.disciplinas
    .map((disciplina) => ({
      ...disciplina,
      itens: disciplina.itens
        .map((item) => ({
          ...item,
          citacoes: item.citacoes
            .map((citacao) => ({ ...citacao, visiveis: citacao.artigos.filter(passaNoFiltro) }))
            .filter((citacao) => filtro.value === 'todos' || citacao.visiveis.length > 0)
        }))
        .filter((item) => item.citacoes.length > 0)
    }))
    .filter((disciplina) => disciplina.itens.length > 0)
})

const resumo = computed(() => cobertura.value?.resumo)
const pendencias = computed(() => {
  const r = resumo.value
  if (!r) return []
  const lista = []
  if (r.sem_identidade) lista.push(`${r.sem_identidade} ${r.sem_identidade === 1 ? 'citação' : 'citações'} sem a identidade da norma confirmada`)
  if (r.sem_texto) lista.push(`${r.sem_texto} ${r.sem_texto === 1 ? 'citação' : 'citações'} de norma ainda sem texto`)
  if (r.estrutura_pendente) {
    lista.push(`${r.estrutura_pendente} ${r.estrutura_pendente === 1 ? 'citação' : 'citações'} por título, capítulo ou seção com a lista de artigos a conferir (abaixo)`)
  }
  return lista
})

const dataBr = (data) => data?.split('-').reverse().join('/')
const dataDoEdital = computed(() => dataBr(cobertura.value?.edital.data_publicacao))

function rotuloDaVersao(versao) {
  const data = versao.data_versao_precisao === 'ano' ? versao.data_versao?.slice(0, 4) : dataBr(versao.data_versao)
  const texto = data ? `texto de ${data}` : 'texto sem data'
  if (versao.criterio === 'posterior') return `${texto} · mais novo que o edital (não há versão até ${dataDoEdital.value})`
  if (versao.criterio === 'anterior') return `${texto} · versão vigente na publicação do edital`
  return texto
}

const SITUACOES_DA_CITACAO = {
  sem_identidade: 'Identidade da norma não confirmada nas Fontes.',
  sem_texto: 'A norma ainda não tem texto. Envie o arquivo nas Fontes.',
  texto_nao_dividido: 'O texto enviado não foi dividido em artigos. Use "processar de novo" nas Fontes.'
}

function contagem(citacao) {
  const conta = (situacao) => citacao.artigos.filter((a) => a.situacao === situacao).length
  const partes = [`${conta('encontrado')} encontrados`]
  if (conta('revogado')) partes.push(`${conta('revogado')} revogados`)
  if (conta('faltando')) partes.push(`${conta('faltando')} faltando`)
  return `${citacao.artigos.length} ${citacao.artigos.length === 1 ? 'artigo' : 'artigos'}: ${partes.join(', ')}`
}

function dicaDoArtigo(artigo) {
  const dicas = [{ encontrado: 'encontrado', revogado: 'revogado', faltando: 'não está no texto da norma' }[artigo.situacao]]
  if (artigo.vigencia === 'depois') dicas.push('alterado depois do edital')
  if (artigo.vigencia === 'talvez') dicas.push('alterado no ano do edital (talvez depois)')
  if (artigo.origem === 'letra_no_intervalo') dicas.push('artigo com letra que veio do texto da norma, não do edital')
  return dicas.join(' · ')
}

// Conferência da lista de uma citação por estrutura: grava e recarrega a cobertura (os números do topo mudam).
const conferindo = ref(null)

async function aoConferir(citacao, conferida) {
  conferindo.value = citacao.id
  try {
    await conferirEstrutura(edital.value.id, citacao.id, conferida)
    cobertura.value = await buscarCobertura(edital.value.id)
    if (conferida) toast.add({ severity: 'success', summary: 'Lista conferida', detail: 'Os artigos entraram na cobertura.', life: 4000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível gravar a conferência', detail: e.message, life: 8000 })
  } finally {
    conferindo.value = null
  }
}

// Texto do artigo, numa janela. Os artigos de cada versão são buscados uma vez.
const artigosPorVersao = new Map()
const aberto = ref(null)
const carregandoTexto = ref(false)

async function abrir(citacao, artigo) {
  aberto.value = { citacao, artigo, texto: null }
  if (!artigo.norma_artigo_id) return
  carregandoTexto.value = true
  try {
    const versaoId = citacao.versao.id
    if (!artigosPorVersao.has(versaoId)) artigosPorVersao.set(versaoId, buscarArtigosDaVersao(citacao.norma.id, versaoId))
    const artigos = await artigosPorVersao.get(versaoId)
    aberto.value = { ...aberto.value, texto: artigos.find((a) => a.id === artigo.norma_artigo_id) || null }
  } catch (e) {
    artigosPorVersao.delete(citacao.versao.id)
    erro.value = e.message
  } finally {
    carregandoTexto.value = false
  }
}

const janelaVisivel = computed({
  get: () => Boolean(aberto.value),
  set: (valor) => {
    if (!valor) aberto.value = null
  }
})
</script>

<template>
  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <template v-if="edital">
    <div class="pagina-cabecalho">
      <p>
        Cada artigo pedido nos itens aprovados, procurado no texto da norma. Clique num artigo para ler o texto.
        <template v-if="dataDoEdital">Edital publicado em {{ dataDoEdital }}.</template>
      </p>
    </div>

    <template v-if="cobertura">
      <Message v-if="cobertura.disciplinas.length === 0" severity="info" :closable="false">
        Nenhum item aprovado cita norma. Aprove os itens de legislação na Revisão e confirme as normas nas Fontes.
      </Message>

      <template v-else>
        <div class="numeros">
          <div class="numero"><b>{{ resumo.artigos }}</b><span>artigos pedidos com texto</span></div>
          <div class="numero numero--encontrado"><b>{{ resumo.encontrados }}</b><span>encontrados</span></div>
          <div class="numero numero--revogado"><b>{{ resumo.revogados }}</b><span>revogados</span></div>
          <div class="numero numero--faltando"><b>{{ resumo.faltando }}</b><span>faltando</span></div>
          <div class="numero numero--questoes">
            <b>{{ resumo.artigos_com_questoes }}</b><span>artigos já cobrados em prova</span>
            <small>{{ resumo.questoes }} questões das provas escolhidas</small>
          </div>
          <div class="numero numero--vigencia">
            <b>{{ resumo.alterados_depois }}</b><span>alterados depois do edital</span>
            <small v-if="resumo.talvez_alterados_depois">+ {{ resumo.talvez_alterados_depois }} talvez</small>
          </div>
        </div>

        <Message v-if="pendencias.length" severity="warn" :closable="false">
          Fora da contagem: {{ pendencias.join('; ') }}.
          <router-link :to="{ name: 'fontes', params: { id: edital.id } }">Ir para as Fontes</router-link>
        </Message>

        <SelectButton v-model="filtro" :options="FILTROS" option-label="rotulo" option-value="valor" :allow-empty="false" class="filtro" />

        <p v-if="disciplinas.length === 0" class="pendente">Nenhum artigo neste filtro.</p>

        <section v-for="disciplina in disciplinas" :key="disciplina.id" class="painel disciplina">
          <div class="painel__cabecalho"><h2>{{ disciplina.texto }}</h2></div>
          <div class="painel__corpo">
            <div v-for="item in disciplina.itens" :key="item.id" class="item">
              <p class="item__texto">{{ item.texto }}</p>

              <div v-for="citacao in item.citacoes" :key="citacao.id" class="citacao">
                <div class="citacao__cabecalho">
                  <router-link v-if="citacao.norma" :to="{ name: 'norma', params: { id: citacao.norma.id } }" class="citacao__nome">
                    {{ citacao.norma.nome }}
                  </router-link>
                  <span v-else class="citacao__nome">{{ nomeDaNorma(citacao) }}</span>
                  <span class="citacao__pedido">
                    {{ citacao.abrangencia === 'norma_inteira' ? 'norma inteira' : citacao.artigos_texto }}
                  </span>
                </div>

                <p v-if="SITUACOES_DA_CITACAO[citacao.situacao]" class="citacao__situacao">
                  <i class="pi pi-info-circle" /> {{ SITUACOES_DA_CITACAO[citacao.situacao] }}
                </p>
                <template v-else>
                  <p class="citacao__versao">
                    {{ rotuloDaVersao(citacao.versao) }} · {{ contagem(citacao) }}
                  </p>
                  <p v-for="aviso in citacao.avisos" :key="aviso" class="citacao__situacao">{{ aviso }}</p>

                  <div v-if="citacao.estrutura" class="estrutura" :class="{ 'estrutura--conferida': citacao.estrutura.conferida }">
                    <div class="estrutura__cabecalho">
                      <span>
                        <b>Pela estrutura:</b> {{ citacao.estrutura.total }}
                        {{ citacao.estrutura.total === 1 ? 'artigo achado' : 'artigos achados' }} pelo código.
                      </span>
                      <Tag v-if="citacao.estrutura.conferida" value="conferida" severity="success" />
                      <Tag v-else value="a conferir" severity="warn" />
                    </div>
                    <p v-if="citacao.estrutura.mudou" class="estrutura__aviso">
                      <i class="pi pi-exclamation-triangle" /> O trecho foi corrigido ou o texto da norma mudou desde a
                      conferência: confira a lista de novo.
                    </p>
                    <p v-for="aviso in citacao.estrutura.avisos" :key="aviso" class="estrutura__aviso">
                      <i class="pi pi-exclamation-triangle" /> {{ aviso }}
                    </p>
                    <details :open="!citacao.estrutura.conferida">
                      <summary>Artigos por parte</summary>
                      <div v-for="parte in citacao.estrutura.partes" :key="parte.descricao" class="estrutura__parte">
                        <span class="estrutura__descricao">{{ parte.descricao }}</span>
                        <div class="artigos">
                          <button
                            v-for="artigo in parte.artigos"
                            :key="artigo.numero"
                            type="button"
                            class="artigo"
                            :class="[`artigo--${artigo.situacao}`, { 'artigo--vigencia': artigo.vigencia }]"
                            :title="dicaDoArtigo(artigo)"
                            @click="abrir(citacao, artigo)"
                          >
                            {{ artigo.numero }}
                            <sup v-if="artigo.questoes?.length" class="artigo__questoes">{{ artigo.questoes.length }}</sup>
                          </button>
                          <span v-if="parte.artigos.length === 0" class="pendente">nenhum artigo</span>
                        </div>
                      </div>
                    </details>
                    <div class="estrutura__acoes">
                      <Button
                        v-if="!citacao.estrutura.conferida"
                        label="Conferi: vale esta lista"
                        icon="pi pi-check"
                        size="small"
                        :disabled="citacao.estrutura.total === 0"
                        :loading="conferindo === citacao.id"
                        @click="aoConferir(citacao, true)"
                      />
                      <Button
                        v-else
                        label="Desfazer conferência"
                        severity="secondary"
                        outlined
                        size="small"
                        :loading="conferindo === citacao.id"
                        @click="aoConferir(citacao, false)"
                      />
                      <span class="pendente">
                        Faltou ou sobrou algo? Corrija o trecho na
                        <router-link :to="{ name: 'revisao', params: { id: edital.id } }">Revisão</router-link>.
                      </span>
                    </div>
                  </div>

                  <div v-if="citacao.visiveis.length" class="artigos">
                    <button
                      v-for="artigo in citacao.visiveis"
                      :key="artigo.numero"
                      type="button"
                      class="artigo"
                      :class="[
                        `artigo--${artigo.situacao}`,
                        { 'artigo--vigencia': artigo.vigencia, 'artigo--letra': artigo.origem === 'letra_no_intervalo' }
                      ]"
                      :title="dicaDoArtigo(artigo)"
                      @click="abrir(citacao, artigo)"
                    >
                      {{ artigo.numero }}
                      <sup v-if="artigo.questoes?.length" class="artigo__questoes">{{ artigo.questoes.length }}</sup>
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </section>

        <p class="legenda">
          <span class="artigo artigo--encontrado">293</span> encontrado
          <span class="artigo artigo--revogado">294</span> revogado
          <span class="artigo artigo--faltando">295</span> faltando no texto
          <span class="artigo artigo--encontrado artigo--vigencia">296</span> alterado depois do edital
          <span class="artigo artigo--encontrado artigo--letra">313-A</span> com letra, veio do texto da norma
        </p>
      </template>
    </template>
  </template>

  <Dialog v-model:visible="janelaVisivel" modal :header="aberto ? `Art. ${aberto.artigo.numero}` : ''" class="janela">
    <template v-if="aberto">
      <p class="janela__norma">
        {{ aberto.citacao.norma.nome }} · {{ rotuloDaVersao(aberto.citacao.versao) }}
      </p>
      <div class="janela__marcas">
        <Tag v-if="aberto.artigo.situacao === 'encontrado'" value="encontrado" severity="success" />
        <Tag v-if="aberto.artigo.situacao === 'revogado'" value="revogado" severity="secondary" />
        <Tag v-if="aberto.artigo.situacao === 'faltando'" value="faltando" severity="danger" />
        <Tag v-if="aberto.artigo.origem === 'letra_no_intervalo'" value="com letra, do texto da norma" severity="info" />
      </div>

      <p v-if="aberto.artigo.vigencia" class="vigencia">
        <i class="pi pi-exclamation-triangle" />
        <span v-if="aberto.artigo.vigencia === 'depois'">
          Alterado depois da publicação do edital ({{ dataDoEdital }}). Na prova vale a redação da época: veja a redação
          anterior, quando o texto a trouxer.
        </span>
        <span v-else>Alterado no mesmo ano do edital; a nota só traz o ano, então pode ter sido depois.</span>
      </p>

      <p v-if="aberto.artigo.situacao === 'faltando'" class="pendente">
        Este artigo não está no texto enviado. Pode ter sido renumerado, ou o arquivo veio incompleto (veja os avisos da
        versão na Biblioteca). Nenhum texto é inventado.
      </p>
      <p v-else-if="carregandoTexto" class="pendente">Carregando o texto…</p>
      <template v-else-if="aberto.texto">
        <p class="janela__texto">
          <template v-for="(parte, i) in partesDoArtigo(aberto.texto.texto_bruto)" :key="i">
            <span v-if="parte.nota" class="nota">{{ parte.texto }}</span>
            <template v-else>{{ parte.texto }}</template>
          </template>
        </p>
        <details v-if="aberto.texto.redacao_anterior" class="anterior" :open="Boolean(aberto.artigo.vigencia)">
          <summary>redação anterior</summary>
          <p>{{ aberto.texto.redacao_anterior }}</p>
        </details>
      </template>

      <section v-if="aberto.artigo.questoes?.length" class="janela__questoes">
        <span class="rotulo">Cobrado em</span>
        <router-link
          v-for="q in aberto.artigo.questoes"
          :key="q.questao_id"
          :to="{ name: 'questoes', params: { id: edital.id, provaId: q.prova_id } }"
        >
          {{ q.banca }} {{ q.ano }} · questão {{ q.numero }}<template v-if="q.papel === 'relacionado'"> (relacionado)</template>
        </router-link>
      </section>
      <p v-else-if="aberto.artigo.situacao === 'encontrado'" class="pendente">Nenhuma questão das provas escolhidas cobra este artigo.</p>

      <router-link
        v-if="aberto.artigo.norma_artigo_id"
        :to="{ name: 'norma', params: { id: aberto.citacao.norma.id }, query: { versao: aberto.citacao.versao.id, artigo: aberto.artigo.numero } }"
        class="janela__link"
      >
        Ver na norma, com os artigos vizinhos →
      </router-link>
    </template>
  </Dialog>
</template>

<style scoped>
.numeros {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.numero {
  display: flex;
  flex-direction: column;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: var(--radius);
  background: var(--card);
}
.numero b {
  font-size: 1.5rem;
  font-family: var(--font-display);
}
.numero span,
.numero small {
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.numero--encontrado {
  border-left-color: var(--positive);
}
.numero--revogado {
  border-left-color: var(--muted-foreground);
}
.numero--faltando {
  border-left-color: var(--negative);
}
.numero--questoes {
  border-left-color: var(--primary);
}
.artigo__questoes {
  margin-left: 0.15rem;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--primary);
}
.janela__questoes {
  display: grid;
  gap: 0.2rem;
  margin-top: 1rem;
  font-size: 0.9rem;
}
.rotulo {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
}
.numero--vigencia {
  border-left-color: var(--warning);
}
.filtro {
  margin: 1rem 0;
}
.disciplina {
  margin-bottom: 1.25rem;
}
.item + .item {
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
}
.item__texto {
  margin: 0 0 0.5rem;
  font-weight: 600;
}
.citacao {
  margin: 0.6rem 0 0 0.75rem;
}
.citacao__cabecalho {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  align-items: baseline;
}
.citacao__nome {
  font-weight: 600;
}
.citacao__pedido,
.citacao__versao,
.citacao__situacao {
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.citacao__versao,
.citacao__situacao {
  margin: 0.2rem 0;
}
.artigos {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.4rem;
}
.artigo {
  position: relative;
  display: inline-block;
  min-width: 2.6rem;
  padding: 0.15rem 0.4rem;
  font: inherit;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  text-align: center;
  border: 1px solid transparent;
  border-radius: 0.3rem;
  cursor: pointer;
}
.artigo--encontrado {
  background: color-mix(in oklch, var(--positive) 16%, transparent);
  color: var(--foreground);
}
.artigo--revogado {
  background: var(--muted);
  color: var(--muted-foreground);
  text-decoration: line-through;
}
.artigo--faltando {
  background: color-mix(in oklch, var(--negative) 18%, transparent);
  border-color: var(--negative);
  color: var(--foreground);
  font-weight: 700;
}
.artigo--vigencia {
  border-color: var(--warning);
  box-shadow: inset 0 -3px 0 var(--warning);
}
.artigo--letra {
  font-style: italic;
  border-style: dashed;
  border-color: var(--muted-foreground);
}
.artigo:hover {
  filter: brightness(0.92);
}
.estrutura {
  margin: 0.5rem 0;
  padding: 0.6rem 0.8rem;
  border: 1px dashed var(--warning);
  border-radius: var(--radius);
  font-size: 0.85rem;
}
.estrutura--conferida {
  border: 1px solid var(--border);
}
.estrutura__cabecalho {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.estrutura__aviso {
  margin: 0.3rem 0;
  color: var(--warning-foreground);
}
.estrutura details {
  margin: 0.4rem 0;
}
.estrutura summary {
  cursor: pointer;
  color: var(--muted-foreground);
}
.estrutura__parte {
  margin-top: 0.5rem;
}
.estrutura__descricao {
  font-weight: 600;
}
.estrutura__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-top: 0.5rem;
}
.legenda {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.6rem;
  align-items: center;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.legenda .artigo {
  cursor: default;
}
.pendente {
  color: var(--muted-foreground);
}
.janela__norma {
  margin: 0 0 0.5rem;
  color: var(--muted-foreground);
  font-size: 0.85rem;
}
.janela__marcas {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}
.janela__texto {
  white-space: pre-wrap;
  font-family: var(--font-doc);
  line-height: 1.55;
}
.janela__link {
  display: inline-block;
  margin-top: 1rem;
}
.nota {
  font-size: 0.8em;
  color: var(--muted-foreground);
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
.anterior {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.anterior summary {
  cursor: pointer;
}
.anterior p {
  white-space: pre-wrap;
  text-decoration: line-through;
}
</style>

<style>
.janela {
  width: min(48rem, calc(100vw - 2rem));
}
</style>
