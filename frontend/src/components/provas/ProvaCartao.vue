<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { urlDoArquivoDaProva } from '../../services/provas.service'

// Uma prova da biblioteca: dados do concurso, o PDF da prova, o gabarito com a origem e as ações.
// escolhida: está na lista do edital (mostra "tirar deste edital"); senão mostra "usar neste edital".
const props = defineProps({
  prova: { type: Object, required: true },
  escolhida: { type: Boolean, default: false },
  ocupado: { type: Boolean, default: false }
})
const emit = defineEmits(['escolher', 'desfazer', 'salvar', 'enviar-gabarito', 'excluir', 'ler', 'classificar'])

const SITUACOES_DO_GABARITO = [
  { valor: 'oficial_definitivo', rotulo: 'Oficial definitivo', severidade: 'success' },
  { valor: 'oficial_preliminar', rotulo: 'Oficial preliminar', severidade: 'warn' },
  { valor: 'nao_oficial', rotulo: 'Não oficial', severidade: 'danger' }
]

const titulo = computed(() => [props.prova.banca, props.prova.orgao, props.prova.cargo].filter(Boolean).join(' · ') || 'Prova sem identificação')
const situacao = computed(() => SITUACOES_DO_GABARITO.find((s) => s.valor === props.prova.gabarito_situacao))
const semTexto = computed(() => props.prova.prova && props.prova.prova.paginas_com_texto === 0)
const gabaritoSemTexto = computed(() => props.prova.gabarito && props.prova.gabarito.paginas_com_texto === 0)
// Gabarito lido da imagem e ainda não conferido pelo orientador.
const gabaritoAConferir = computed(() => {
  const g = props.prova.leitura?.gabarito
  return props.prova.leitura_status === 'lida' && g?.lido_de === 'imagem' && g.versao_escolhida !== null && !g.conferido_em
})
// Gabarito com várias versões e nenhuma escolhida: as respostas ficam vazias até o orientador escolher.
const versaoAEscolher = computed(() => {
  const g = props.prova.leitura?.gabarito
  return props.prova.leitura_status === 'lida' && (g?.versoes || []).length > 1 && g.versao_escolhida === null
})
const poucoTexto = computed(() => {
  const p = props.prova.prova
  return p && p.paginas_com_texto > 0 && p.paginas_com_texto < p.total_paginas
})

// Edição dos dados do concurso.
const editando = ref(false)
const formulario = ref({})
function editar() {
  formulario.value = { banca: props.prova.banca || '', orgao: props.prova.orgao || '', cargo: props.prova.cargo || '', ano: props.prova.ano || '' }
  editando.value = true
}
function salvar() {
  emit('salvar', { ...formulario.value, ano: formulario.value.ano === '' ? null : String(formulario.value.ano) })
  editando.value = false
}

// Envio do gabarito: a origem é obrigatória.
const gabarito = ref({ situacao: null, origem: '' })
const seletor = ref(null)
function escolherGabarito(evento) {
  const [arquivo] = evento.target.files
  evento.target.value = ''
  if (arquivo) emit('enviar-gabarito', arquivo, { gabarito_situacao: gabarito.value.situacao, origem_url: gabarito.value.origem })
}

function excluir() {
  if (window.confirm(`Excluir "${titulo.value}" da biblioteca? A prova sai de todos os editais e os arquivos são apagados.`)) emit('excluir')
}
</script>

<template>
  <article class="painel prova">
    <div class="painel__cabecalho cabecalho">
      <div>
        <h3>{{ titulo }}</h3>
        <span class="ano">{{ prova.ano || 'ano não informado' }}</span>
      </div>
      <div class="relevancia" v-if="prova.relevancia">
        <Tag v-if="prova.relevancia.mesmaBanca" value="mesma banca" severity="success" />
        <Tag v-if="prova.relevancia.mesmoOrgao" value="mesmo órgão" severity="info" />
        <Tag v-if="prova.relevancia.mesmoCargo" value="mesmo cargo" severity="info" />
      </div>
    </div>

    <div class="painel__corpo corpo">
      <form v-if="editando" class="formulario" @submit.prevent="salvar">
        <label><span class="rotulo">Banca</span><InputText v-model="formulario.banca" size="small" /></label>
        <label><span class="rotulo">Órgão</span><InputText v-model="formulario.orgao" size="small" /></label>
        <label><span class="rotulo">Cargo</span><InputText v-model="formulario.cargo" size="small" /></label>
        <label><span class="rotulo">Ano</span><InputText v-model="formulario.ano" size="small" inputmode="numeric" /></label>
        <span class="botoes">
          <Button type="submit" label="Salvar" size="small" :disabled="ocupado" />
          <Button label="Cancelar" size="small" severity="secondary" text @click="editando = false" />
        </span>
      </form>

      <section>
        <span class="rotulo">Prova</span>
        <p v-if="prova.prova" class="linha">
          <a :href="urlDoArquivoDaProva(prova.id, 'prova')" target="_blank" rel="noopener">{{ prova.prova.nome }}</a>
          · {{ prova.prova.total_paginas }} páginas
          <a v-if="prova.prova.origem_url" :href="prova.prova.origem_url" target="_blank" rel="noopener" class="origem">de onde veio</a>
        </p>
        <p v-if="semTexto" class="alerta">
          <i class="pi pi-exclamation-triangle" /> PDF sem texto selecionável (escaneado): a leitura das questões não vai
          funcionar com ele. Procure outra cópia.
        </p>
        <p v-else-if="poucoTexto" class="alerta">
          <i class="pi pi-exclamation-triangle" /> Só {{ prova.prova.paginas_com_texto }} de {{ prova.prova.total_paginas }}
          páginas têm texto.
        </p>
      </section>

      <section>
        <span class="rotulo">Gabarito</span>
        <p v-if="prova.gabarito" class="linha">
          <a :href="urlDoArquivoDaProva(prova.id, 'gabarito')" target="_blank" rel="noopener">{{ prova.gabarito.nome }}</a>
          <Tag v-if="situacao" :value="situacao.rotulo" :severity="situacao.severidade" />
          <a v-if="prova.gabarito.origem_url" :href="prova.gabarito.origem_url" target="_blank" rel="noopener" class="origem">de onde veio</a>
        </p>
        <p v-else class="alerta">Sem gabarito. Sem ele, as questões desta prova não poderão ser comentadas.</p>
        <p v-if="gabaritoSemTexto" class="alerta">
          <i class="pi pi-image" /> Gabarito sem texto (imagem): a IA lê a imagem e você confere as respostas na tela das questões.
        </p>
        <div class="gabarito">
          <Select
            v-model="gabarito.situacao"
            :options="SITUACOES_DO_GABARITO"
            option-label="rotulo"
            option-value="valor"
            placeholder="Origem do gabarito"
            size="small"
          />
          <InputText v-model="gabarito.origem" placeholder="Link de onde baixou (opcional)" size="small" class="gabarito__link" />
          <Button
            :label="prova.gabarito ? 'Trocar gabarito' : 'Enviar gabarito'"
            icon="pi pi-upload"
            size="small"
            outlined
            :disabled="!gabarito.situacao || ocupado"
            @click="seletor.click()"
          />
          <input ref="seletor" type="file" accept="application/pdf" hidden @change="escolherGabarito" />
        </div>
      </section>

      <section>
        <span class="rotulo">Questões</span>
        <p v-if="prova.leitura_status === 'lendo'" class="linha lendo">
          <i class="pi pi-spin pi-spinner" /> A IA está lendo a prova e o gabarito. Leva alguns minutos.
        </p>
        <template v-else-if="prova.leitura_status === 'lida'">
          <p class="linha">
            <Tag :value="`${prova.questoes.valida} válidas`" severity="success" />
            <Tag v-if="prova.questoes.a_revisar" :value="`${prova.questoes.a_revisar} a revisar`" severity="warn" />
            <Tag v-if="prova.questoes.descartada" :value="`${prova.questoes.descartada} descartadas`" severity="secondary" />
            <Tag v-if="versaoAEscolher" value="escolha a versão do gabarito" severity="warn" icon="pi pi-list-check" />
            <Tag v-if="gabaritoAConferir" value="gabarito a conferir" severity="warn" icon="pi pi-image" />
            <router-link :to="{ name: 'questoes', params: { id: $route.params.id, provaId: prova.id } }">ver questões</router-link>
          </p>
          <p v-for="aviso in prova.leitura?.avisos || []" :key="aviso" class="alerta"><i class="pi pi-exclamation-triangle" /> {{ aviso }}</p>

          <span class="rotulo">Classificação por artigo</span>
          <p v-if="prova.classificacao_status === 'classificando'" class="linha lendo">
            <i class="pi pi-spin pi-spinner" /> A IA está indicando a norma e os artigos de cada questão.
          </p>
          <template v-else>
            <p v-if="prova.classificacao_status === 'classificada'" class="linha">
              <Tag :value="`${prova.classificadas.classificada} classificadas`" severity="success" />
              <Tag v-if="prova.classificadas.a_revisar" :value="`${prova.classificadas.a_revisar} a revisar`" severity="warn" />
              <Tag :value="`${prova.classificadas.nao_juridica} não jurídicas`" severity="secondary" />
            </p>
            <p v-else-if="prova.classificacao_status === 'erro'" class="alerta"><i class="pi pi-times-circle" /> {{ prova.classificacao_erro }}</p>
            <p v-else class="linha instrucao">Ainda não classificadas. Envie antes, nas Fontes, as normas que a prova cobra.</p>
            <div class="linha">
              <Button
                :label="prova.classificacao_status === 'classificada' ? 'Classificar de novo' : 'Classificar por artigo'"
                icon="pi pi-sitemap"
                size="small"
                :outlined="prova.classificacao_status === 'classificada'"
                :disabled="ocupado"
                @click="emit('classificar')"
              />
              <span v-if="prova.classificacao_status === 'classificada'" class="instrucao">As que você corrigiu são mantidas.</span>
            </div>
          </template>
        </template>
        <p v-else-if="prova.leitura_status === 'erro'" class="alerta"><i class="pi pi-times-circle" /> {{ prova.leitura_erro }}</p>
        <p v-else class="linha instrucao">Ainda não lidas.</p>
        <div v-if="prova.leitura_status !== 'lendo'" class="linha">
          <Button
            :label="prova.leitura_status === 'lida' ? 'Ler de novo' : 'Ler questões com IA'"
            icon="pi pi-sparkles"
            size="small"
            :outlined="prova.leitura_status === 'lida'"
            :disabled="ocupado || !prova.prova || semTexto"
            @click="emit('ler')"
          />
          <span v-if="!prova.gabarito" class="instrucao">Sem gabarito, as questões ficam sem resposta.</span>
        </div>
      </section>

      <div class="acoes">
        <Button v-if="escolhida" label="Tirar deste edital" size="small" severity="secondary" outlined :disabled="ocupado" @click="emit('desfazer')" />
        <Button v-else label="Usar neste edital" icon="pi pi-plus" size="small" :disabled="ocupado" @click="emit('escolher')" />
        <Button v-if="!editando" label="Editar dados" size="small" severity="secondary" text @click="editar" />
        <Button label="Excluir da biblioteca" size="small" severity="danger" text :disabled="ocupado" @click="excluir" />
      </div>
    </div>
  </article>
</template>

<style scoped>
.prova {
  min-width: 0;
}
.cabecalho {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}
.cabecalho h3 {
  margin: 0;
  font-size: 0.95rem;
}
.ano {
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.relevancia {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  justify-content: flex-end;
}
.corpo {
  display: grid;
  gap: 0.75rem;
}
.rotulo {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
}
.linha {
  margin: 0.2rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  overflow-wrap: anywhere;
}
.origem {
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.alerta {
  margin: 0.3rem 0 0;
  font-size: 0.85rem;
  color: var(--warning-foreground);
}
.gabarito {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.4rem;
}
.gabarito__link {
  flex: 1 1 12rem;
  min-width: 0;
}
.formulario {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}
.formulario label {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.formulario :deep(input) {
  width: 100%;
}
.botoes {
  grid-column: 1 / -1;
  display: flex;
  gap: 0.5rem;
}
.instrucao {
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.lendo {
  font-size: 0.85rem;
  color: var(--muted-foreground);
}
.acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
