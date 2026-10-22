<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProvaCartao from '../components/provas/ProvaCartao.vue'
import { buscarEdital } from '../services/editais.service'
import {
  atualizarProva,
  buscarProvasDoEdital,
  desfazerEscolhaDaProva,
  enviarGabarito,
  enviarProva,
  escolherProva,
  excluirProva,
  classificarQuestoes,
  lerQuestoes
} from '../services/provas.service'
import { nomeDoEdital } from '../composables/useEditais'

// Provas anteriores do edital (etapa 3a). O sistema não baixa provas: sugere buscas no Google (restritas ao PCI
// Concursos e ao Estudegratis, e uma aberta) e o orientador baixa e envia o PDF da prova e o do gabarito. As provas
// ficam numa biblioteca compartilhada; aqui ficam as escolhidas para o edital e as demais, das mais relevantes.
const route = useRoute()
const toast = useToast()

const edital = ref(null)
const area = ref(null)
const erro = ref(null)
const ocupada = ref(null)

async function carregar(id) {
  edital.value = null
  area.value = null
  erro.value = null
  try {
    edital.value = await buscarEdital(id)
    area.value = await buscarProvasDoEdital(id)
    novaProva.value = camposIniciais()
  } catch (e) {
    erro.value = e.message
  }
}

watch(() => route.params.id, carregar, { immediate: true })

// "Fundação para o Vestibular da UNESP - VUNESP" -> "VUNESP", para pré-preencher a banca da prova nova.
function siglaDaBanca(banca) {
  const siglas = String(banca ?? '').match(/\b[A-ZÀ-Ú]{3,}\b/g)
  return siglas ? siglas[siglas.length - 1] : banca || ''
}

function camposIniciais() {
  return { banca: siglaDaBanca(edital.value?.banca), orgao: '', cargo: '', ano: '', origem_url: '' }
}

const novaProva = ref(camposIniciais())
// "Enviar prova" e "Onde procurar" começam recolhidos.
const enviarProvaAberto = ref(false)
const ondeProcurarAberto = ref(false)
const seletor = ref(null)
const enviando = ref(false)

async function aoEscolherArquivo(evento) {
  const [arquivo] = evento.target.files
  evento.target.value = ''
  if (!arquivo) return
  enviando.value = true
  try {
    const { jaExistia } = await enviarProva(arquivo, { ...novaProva.value, edital_id: edital.value.id })
    area.value = await buscarProvasDoEdital(edital.value.id)
    novaProva.value = camposIniciais()
    toast.add(
      jaExistia
        ? { severity: 'info', summary: 'Esta prova já estava na biblioteca', detail: 'Ela foi escolhida para este edital.', life: 6000 }
        : { severity: 'success', summary: 'Prova recebida', detail: 'Agora envie o gabarito.', life: 5000 }
    )
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Não foi possível enviar a prova', detail: e.message, life: 8000 })
  } finally {
    enviando.value = false
  }
}

async function executar(prova, acao, falha, sucesso) {
  ocupada.value = prova.id
  try {
    const resultado = await acao()
    area.value = resultado?.buscas ? resultado : await buscarProvasDoEdital(edital.value.id)
    if (sucesso) toast.add({ severity: 'success', summary: sucesso, life: 4000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: falha, detail: e.message, life: 8000 })
  } finally {
    ocupada.value = null
  }
}

const aoEscolher = (prova) => executar(prova, () => escolherProva(edital.value.id, prova.id), 'Não foi possível escolher a prova')
const aoDesfazer = (prova) => executar(prova, () => desfazerEscolhaDaProva(edital.value.id, prova.id), 'Não foi possível tirar a prova')
const aoSalvar = (prova, campos) => executar(prova, () => atualizarProva(prova.id, campos), 'Não foi possível salvar', 'Dados salvos')
const aoEnviarGabarito = (prova, arquivo, campos) =>
  executar(prova, () => enviarGabarito(prova.id, arquivo, campos), 'Não foi possível enviar o gabarito', 'Gabarito recebido')
const aoExcluir = (prova) => executar(prova, () => excluirProva(prova.id), 'Não foi possível excluir', 'Prova excluída da biblioteca')

// Leitura das questões com IA (etapa 3b). Com questões já revisadas, confirma antes de ler de novo.
const aoLer = (prova) =>
  executar(
    prova,
    async () => {
      try {
        await lerQuestoes(prova.id)
      } catch (e) {
        const dados = e.response?.data?.error
        if (dados?.codigo !== 'revisao_sera_perdida') throw e
        if (!window.confirm(`${dados.message}

Ler de novo mesmo assim?`)) return
        await lerQuestoes(prova.id, { confirmarPerdaDaRevisao: true })
      }
    },
    'Não foi possível iniciar a leitura'
  )

const aoClassificar = (prova) => executar(prova, () => classificarQuestoes(prova.id), 'Não foi possível iniciar a classificação')

// Enquanto alguma prova está sendo lida ou classificada, recarrega a área a cada 5 s.
let temporizador = null
const lendo = computed(() => [...(area.value?.escolhidas || []), ...(area.value?.outras || [])].some((p) => p.leitura_status === 'lendo' || p.classificacao_status === 'classificando'))
watch(lendo, (agora) => {
  clearInterval(temporizador)
  temporizador = null
  if (!agora) return
  temporizador = setInterval(async () => {
    try {
      area.value = await buscarProvasDoEdital(edital.value.id)
    } catch {
      // A próxima volta tenta de novo.
    }
  }, 5000)
})
onBeforeUnmount(() => clearInterval(temporizador))

const resumo = computed(() => {
  const escolhidas = area.value?.escolhidas || []
  return {
    total: escolhidas.length,
    comGabaritoOficial: escolhidas.filter((p) => p.gabarito && p.gabarito_situacao === 'oficial_definitivo').length,
    semGabarito: escolhidas.filter((p) => !p.gabarito).length
  }
})
</script>

<template>
  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <template v-if="edital && area">
    <div class="pagina-cabecalho">
      <div>
        <h1>Provas anteriores · {{ nomeDoEdital(edital) }}</h1>
        <p>
          Provas de concursos anteriores para comentar e para servir de modelo. O sistema não baixa provas: use as buscas
          abaixo, baixe a prova e o gabarito no navegador e envie aqui. Prefira o gabarito oficial definitivo.
        </p>
      </div>
    </div>

    <div class="grade">
      <section class="painel">
        <button
          type="button"
          class="painel__cabecalho recolher"
          :aria-expanded="enviarProvaAberto"
          @click="enviarProvaAberto = !enviarProvaAberto"
        >
          <h2><i class="pi pi-upload recolher__icone" /> Enviar prova</h2>
          <span class="recolher__dica">
            PDF da prova
            <i class="pi" :class="enviarProvaAberto ? 'pi-chevron-up' : 'pi-chevron-down'" />
          </span>
        </button>
        <div v-show="enviarProvaAberto" class="painel__corpo">
          <form class="formulario" @submit.prevent="seletor.click()">
            <label><span class="rotulo">Banca</span><InputText v-model="novaProva.banca" size="small" placeholder="VUNESP" /></label>
            <label><span class="rotulo">Ano</span><InputText v-model="novaProva.ano" size="small" placeholder="2021" inputmode="numeric" /></label>
            <label class="largo"><span class="rotulo">Órgão</span><InputText v-model="novaProva.orgao" size="small" placeholder="Tribunal de Justiça do Estado de São Paulo" /></label>
            <label class="largo"><span class="rotulo">Cargo</span><InputText v-model="novaProva.cargo" size="small" placeholder="Escrevente Técnico Judiciário" /></label>
            <label class="largo">
              <span class="rotulo">Link de onde baixou</span>
              <InputText v-model="novaProva.origem_url" size="small" placeholder="https://..." />
            </label>
            <span class="largo">
              <Button type="submit" label="Escolher o PDF da prova e enviar" icon="pi pi-upload" size="small" :loading="enviando" />
            </span>
            <input ref="seletor" type="file" accept="application/pdf" hidden @change="aoEscolherArquivo" />
          </form>
          <p class="instrucao">O gabarito é enviado depois, no cartão da prova.</p>
        </div>
      </section>

      <section class="painel">
        <button
          type="button"
          class="painel__cabecalho recolher"
          :aria-expanded="ondeProcurarAberto"
          @click="ondeProcurarAberto = !ondeProcurarAberto"
        >
          <h2><i class="pi pi-search recolher__icone" /> Onde procurar</h2>
          <span class="recolher__dica">
            {{ area.buscas.length }} {{ area.buscas.length === 1 ? 'busca sugerida' : 'buscas sugeridas' }}
            <i class="pi" :class="ondeProcurarAberto ? 'pi-chevron-up' : 'pi-chevron-down'" />
          </span>
        </button>
        <div v-show="ondeProcurarAberto" class="painel__corpo">
          <p class="instrucao">
            Buscas montadas a partir do edital (banca, órgão, cargo e normas cobradas). Cada link abre uma busca no
            Google, numa aba nova.
          </p>
          <table class="buscas">
            <tbody>
              <tr v-for="busca in area.buscas" :key="busca.consulta">
                <td>
                  <b>{{ busca.descricao }}</b>
                  <span class="mono consulta">{{ busca.consulta }}</span>
                </td>
                <td class="links">
                  <a v-for="link in busca.links" :key="link.fonte" :href="link.url" target="_blank" rel="noopener">{{ link.fonte }}</a>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="area.buscas.length === 0" class="instrucao">
            O edital ainda não tem banca, órgão e cargo extraídos. Extraia e revise o edital primeiro.
          </p>
        </div>
      </section>
    </div>

    <h2 class="secao">Provas deste edital</h2>
    <p class="resumo">
      <b>{{ resumo.total }}</b> {{ resumo.total === 1 ? 'prova' : 'provas' }} ·
      <b>{{ resumo.comGabaritoOficial }}</b> com gabarito oficial definitivo ·
      <b>{{ resumo.semGabarito }}</b> sem gabarito
    </p>
    <p v-if="area.escolhidas.length === 0" class="instrucao">Nenhuma prova escolhida ainda.</p>
    <div class="cartoes">
      <ProvaCartao
        v-for="prova in area.escolhidas"
        :key="prova.id"
        :prova="prova"
        escolhida
        :ocupado="ocupada === prova.id"
        @desfazer="aoDesfazer(prova)"
        @salvar="aoSalvar(prova, $event)"
        @enviar-gabarito="(arquivo, campos) => aoEnviarGabarito(prova, arquivo, campos)"
        @excluir="aoExcluir(prova)"
        @ler="aoLer(prova)"
          @classificar="aoClassificar(prova)"
      />
    </div>

    <template v-if="area.outras.length">
      <h2 class="secao">Outras provas da biblioteca</h2>
      <p class="instrucao">Enviadas para outros editais, das mais relevantes para este (mesma banca primeiro).</p>
      <div class="cartoes">
        <ProvaCartao
          v-for="prova in area.outras"
          :key="prova.id"
          :prova="prova"
          :ocupado="ocupada === prova.id"
          @escolher="aoEscolher(prova)"
          @salvar="aoSalvar(prova, $event)"
          @enviar-gabarito="(arquivo, campos) => aoEnviarGabarito(prova, arquivo, campos)"
          @excluir="aoExcluir(prova)"
          @ler="aoLer(prova)"
          @classificar="aoClassificar(prova)"
        />
      </div>
    </template>
  </template>
</template>

<style scoped>
.grade {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 900px) {
  .grade {
    grid-template-columns: minmax(0, 1fr);
  }
}
.recolher {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.recolher[aria-expanded='false'] {
  border-bottom: 0;
}
.recolher__icone {
  margin-right: 0.35rem;
  font-size: 0.9em;
  color: var(--muted-foreground);
}
.recolher__dica {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.instrucao {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.buscas {
  width: 100%;
  border-collapse: collapse;
}
.buscas td {
  padding: 0.45rem 0.25rem;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.consulta {
  display: block;
  font-size: 0.75rem;
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
}
.links {
  white-space: nowrap;
  text-align: right;
}
.links a + a {
  margin-left: 0.75rem;
}
.formulario {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6rem;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.formulario label {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.formulario :deep(input) {
  width: 100%;
}
.largo {
  grid-column: 1 / -1;
}
.rotulo {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
}
.secao {
  margin: 1.75rem 0 0.25rem;
  font-size: 1.05rem;
}
.resumo {
  margin: 0 0 0.75rem;
  color: var(--muted-foreground);
}
.cartoes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 520px) {
  .cartoes {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
