<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useEditais } from '../composables/useEditais'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import FonteNorma from '../components/fontes/FonteNorma.vue'
import {
  buscarEdital,
  buscarFontes,
  confirmarFonte,
  definirUrlDaNorma,
  desligarFonte,
  enviarVersaoDaNorma,
  processarVersaoDaNorma
} from '../services/editais.service'

// Fontes das normas do edital (etapa 2a-1): as normas citadas nos itens aprovados na revisão, a identidade de cada
// uma (que a coloca na biblioteca), o texto por upload manual e a URL de onde ele foi achado.
const route = useRoute()
const toast = useToast()
// A lista da equipe traz o andamento (pendentes nas abas e situação): cada alteração aqui o muda.
const { recarregar: recarregarEditais } = useEditais()

const edital = ref(null)
const fontes = ref([])
const erro = ref(null)
// Chave da fonte com uma ação em andamento (a busca da URL pode levar mais de um minuto).
const ocupada = ref(null)

async function carregar(id) {
  edital.value = null
  fontes.value = []
  erro.value = null
  try {
    edital.value = await buscarEdital(id)
    fontes.value = await buscarFontes(id)
  } catch (e) {
    erro.value = e.message
  }
}

watch(() => route.params.id, carregar, { immediate: true })

const resumo = computed(() => ({
  total: fontes.value.length,
  confirmadas: fontes.value.filter((f) => f.confirmada).length,
  comTexto: fontes.value.filter((f) => f.confirmada && f.norma.versoes.length > 0).length
}))

// Pendente, como no número da aba: falta confirmar a identidade ou falta o texto.
const pendente = (fonte) => !fonte.confirmada || fonte.norma.versoes.length === 0
const soPendentes = ref(false)
const visiveis = computed(() => (soPendentes.value ? fontes.value.filter(pendente) : fontes.value))

// A chave do grupo muda ao confirmar (de "proposta:..." para "norma:..."): o cartão é identificado pela primeira
// citação, para o Vue atualizar o mesmo cartão em vez de trocar por outro.
const idDoCartao = (fonte) => fonte.citacoes[0].id

// A tela fica onde estava: depois da ação, a lista vem de novo e o cartão pode mudar de altura (ao confirmar, o
// formulário dá lugar à URL e ao texto). A rolagem é corrigida para o topo do cartão ficar no mesmo ponto da tela.
const topoDoCartao = (id) => document.getElementById(`fonte-${id}`)?.getBoundingClientRect().top
async function manterNaTela(id, topoAntes) {
  await nextTick()
  const topoDepois = topoDoCartao(id)
  if (topoAntes !== undefined && topoDepois !== undefined) window.scrollBy(0, topoDepois - topoAntes)
}

async function executar(fonte, acao, falha, sucesso) {
  ocupada.value = fonte.chave
  const id = idDoCartao(fonte)
  try {
    await acao()
    const topoAntes = topoDoCartao(id)
    fontes.value = await buscarFontes(edital.value.id)
    await manterNaTela(id, topoAntes)
    recarregarEditais()
    if (sucesso) toast.add({ severity: 'success', summary: sucesso, life: 4000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: falha, detail: e.message, life: 8000 })
  } finally {
    ocupada.value = null
  }
}

// O aviso diz o que aconteceu: com "só pendentes", a fonte que já tem texto na biblioteca sai da lista.
function aoConfirmar(fonte, identidade) {
  const nome = identidade.nome || 'A norma'
  const sucesso = fonte.norma ? `${nome} ligada à norma da biblioteca` : `${nome} incluída na biblioteca`
  return executar(fonte, () => confirmarFonte(edital.value.id, identidade), 'Não foi possível confirmar', sucesso)
}
const aoDesligar = (fonte) =>
  executar(fonte, () => desligarFonte(edital.value.id, fonte.citacoes.map((c) => c.id)), 'Não foi possível desfazer')
const aoDefinirUrl = (fonte, norma, url) =>
  executar(fonte, () => definirUrlDaNorma(norma.id, url), 'Não foi possível salvar a URL')
const aoProcessarVersao = (fonte, norma, versao) =>
  executar(fonte, () => processarVersaoDaNorma(norma.id, versao.id), 'Não foi possível dividir o texto', 'Texto dividido em artigos')
const aoEnviarVersao = (fonte, norma, arquivo) =>
  executar(
    fonte,
    async () => {
      const { jaExistia } = await enviarVersaoDaNorma(norma.id, arquivo)
      if (jaExistia) toast.add({ severity: 'info', summary: 'Este arquivo já foi enviado', detail: 'Nenhuma versão nova.', life: 5000 })
    },
    'Não foi possível enviar o texto',
    'Texto recebido'
  )
</script>

<template>
  <Message v-if="erro" severity="error" :closable="false">{{ erro }}</Message>

  <template v-if="edital">
    <div class="pagina-cabecalho">
      <p>
        As normas citadas nos itens aprovados na revisão. Confirme a identidade de cada uma (ela entra na biblioteca,
        compartilhada entre editais) e envie o texto dela.
      </p>
    </div>

    <Message v-if="fontes.length === 0" severity="info" :closable="false">
      Nenhuma norma citada em itens aprovados. Aprove os itens de legislação na Revisão para que as normas apareçam aqui.
    </Message>

    <template v-else>
      <p class="resumo">
        <b>{{ resumo.total }}</b> {{ resumo.total === 1 ? 'norma' : 'normas' }} · <b>{{ resumo.confirmadas }}</b> com a
        identidade confirmada · <b>{{ resumo.comTexto }}</b> com texto. Ache a lei, salve a página ou o PDF no navegador e envie
        o arquivo: o texto é dividido em artigos na hora.
      </p>
      <label class="filtro">
        <Checkbox v-model="soPendentes" binary input-id="so-pendentes" />
        <span>Só pendentes (identidade a confirmar ou sem texto)</span>
      </label>
      <p v-if="visiveis.length === 0" class="resumo">Nenhuma fonte pendente.</p>
      <div class="lista">
        <FonteNorma
          v-for="fonte in visiveis"
          :id="`fonte-${idDoCartao(fonte)}`"
          :key="idDoCartao(fonte)"
          :fonte="fonte"
          :ocupado="ocupada === fonte.chave"
          @confirmar="aoConfirmar(fonte, $event)"
          @desligar="aoDesligar(fonte)"
          @definir-url="(norma, url) => aoDefinirUrl(fonte, norma, url)"
          @enviar-versao="(norma, arquivo) => aoEnviarVersao(fonte, norma, arquivo)"
          @processar-versao="(norma, versao) => aoProcessarVersao(fonte, norma, versao)"
        />
      </div>
    </template>
  </template>
</template>

<style scoped>
.resumo {
  margin: 0 0 1rem;
  color: var(--muted-foreground);
}
.filtro {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  cursor: pointer;
}
/* Uma coluna: o cartão que cresce ao ser confirmado só empurra os de baixo. */
.lista {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.25rem;
}
</style>
