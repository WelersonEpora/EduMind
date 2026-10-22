<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Message from 'primevue/message'
import FonteNorma from '../components/fontes/FonteNorma.vue'
import {
  buscarEdital,
  buscarFontes,
  buscarUrlDaNorma,
  confirmarFonte,
  definirUrlDaNorma,
  desligarFonte,
  enviarVersaoDaNorma
} from '../services/editais.service'
import { nomeDoEdital } from '../composables/useEditais'

// Fontes das normas do edital (etapa 2a-1): as normas citadas nos itens aprovados na revisão, a identidade de cada
// uma (que a coloca na biblioteca), a URL oficial e o texto por upload manual.
const route = useRoute()
const toast = useToast()

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

async function executar(fonte, acao, falha, sucesso) {
  ocupada.value = fonte.chave
  try {
    await acao()
    fontes.value = await buscarFontes(edital.value.id)
    if (sucesso) toast.add({ severity: 'success', summary: sucesso, life: 4000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: falha, detail: e.message, life: 8000 })
  } finally {
    ocupada.value = null
  }
}

const aoConfirmar = (fonte, identidade) =>
  executar(fonte, () => confirmarFonte(edital.value.id, identidade), 'Não foi possível confirmar', 'Norma na biblioteca')
const aoDesligar = (fonte) =>
  executar(fonte, () => desligarFonte(edital.value.id, fonte.citacoes.map((c) => c.id)), 'Não foi possível desfazer')
const aoBuscarUrl = (fonte, norma) =>
  executar(fonte, () => buscarUrlDaNorma(norma.id), 'A busca não achou a URL oficial', 'URL oficial encontrada')
const aoDefinirUrl = (fonte, norma, url) =>
  executar(fonte, () => definirUrlDaNorma(norma.id, url), 'Não foi possível salvar a URL')
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
      <div>
        <h1>Fontes · {{ nomeDoEdital(edital) }}</h1>
        <p>
          As normas citadas nos itens aprovados na revisão. Confirme a identidade de cada uma (ela entra na biblioteca,
          compartilhada entre editais), ache a URL oficial e envie o texto.
        </p>
      </div>
      <router-link :to="{ name: 'revisao', params: { id: edital.id } }">
        <Button label="Revisão" icon="pi pi-arrow-left" severity="secondary" outlined size="small" />
      </router-link>
    </div>

    <Message v-if="fontes.length === 0" severity="info" :closable="false">
      Nenhuma norma citada em itens aprovados. Aprove os itens de legislação na Revisão para que as normas apareçam aqui.
    </Message>

    <template v-else>
      <p class="resumo">
        <b>{{ resumo.total }}</b> {{ resumo.total === 1 ? 'norma' : 'normas' }} · <b>{{ resumo.confirmadas }}</b> com a
        identidade confirmada · <b>{{ resumo.comTexto }}</b> com texto. O coletor automático (etapa 2a-2) ainda não existe:
        por enquanto o texto vem por upload.
      </p>
      <div class="grade">
        <FonteNorma
          v-for="fonte in fontes"
          :key="fonte.chave"
          :fonte="fonte"
          :ocupado="ocupada === fonte.chave"
          @confirmar="aoConfirmar(fonte, $event)"
          @desligar="aoDesligar(fonte)"
          @buscar-url="aoBuscarUrl(fonte, $event)"
          @definir-url="(norma, url) => aoDefinirUrl(fonte, norma, url)"
          @enviar-versao="(norma, arquivo) => aoEnviarVersao(fonte, norma, arquivo)"
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
.grade {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 520px) {
  .grade {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
