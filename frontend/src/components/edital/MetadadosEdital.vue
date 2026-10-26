<script setup>
import { computed } from 'vue'
import Message from 'primevue/message'
import TrechoCitado from './TrechoCitado.vue'
import { formatarDataHora } from '../../utils/formatar'

// Dados do concurso (os metadados extraídos pela IA na etapa 1b-1, com as correções da Revisão), cada item com o selo
// da conferência do trecho. Uma ficha compacta: os campos numa linha, a prova objetiva em tabela e, ao lado, regras de
// corte e discursiva (que descem para baixo da tabela quando falta largura, como com o texto da página aberto).
const props = defineProps({
  metadados: { type: Object, required: true }
})
const emit = defineEmits(['ver-trecho'])

const CAMPOS = [
  ['banca', 'Banca'],
  ['orgao', 'Órgão'],
  ['cargo', 'Cargo'],
  ['data_publicacao', 'Data de publicação']
]

function formatarValor(chave, valor) {
  if (chave === 'data_publicacao' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor.split('-').reverse().join('/')
  return valor
}

// Todos os itens que trazem trecho, para o resumo da conferência.
const itens = computed(() => {
  const m = props.metadados
  return [
    ...Object.values(m.campos).filter(Boolean),
    ...m.blocos.flatMap((bloco) => [bloco, ...bloco.disciplinas]),
    ...m.regras_de_corte,
    ...(m.discursiva ? [m.discursiva] : [])
  ]
})
const verificados = computed(() => itens.value.filter((item) => item.verificado).length)

const totalDeQuestoes = computed(() => {
  const disciplinas = props.metadados.blocos.flatMap((bloco) => bloco.disciplinas)
  if (disciplinas.length === 0 || disciplinas.some((d) => d.questoes == null)) return null
  return disciplinas.reduce((soma, d) => soma + d.questoes, 0)
})

// Detalhe técnico da extração (modelo, chave, tokens): fica no title da linha de rodapé, fora da leitura do orientador.
const detalheDaExtracao = computed(() =>
  (props.metadados.extracao?.chamadas || [])
    .map((c) => `${c.prompt} · ${c.modelo} · chave ${c.chave} · ${c.tokens ?? '?'} tokens`)
    .join('\n')
)

const questoes = (n) => (n == null ? '—' : String(n))

const ver = (item) => emit('ver-trecho', item)
</script>

<template>
  <div class="ficha">
    <Message v-for="aviso in metadados.avisos" :key="aviso" severity="warn" :closable="false">{{ aviso }}</Message>

    <dl class="campos">
      <div v-for="[chave, rotulo] in CAMPOS" :key="chave" class="campo">
        <dt class="rotulo">{{ rotulo }}</dt>
        <dd v-if="metadados.campos[chave]">
          <span>{{ formatarValor(chave, metadados.campos[chave].valor) }}</span>
          <TrechoCitado :item="metadados.campos[chave]" @ver="ver" />
        </dd>
        <dd v-else class="ausente">não encontrado no edital</dd>
      </div>
    </dl>

    <div class="corpo">
      <section>
        <h3>
          Prova objetiva
          <span v-if="totalDeQuestoes != null" class="total">· {{ totalDeQuestoes }} questões</span>
        </h3>
        <p v-if="metadados.blocos.length === 0" class="ausente">Nenhum bloco ou disciplina encontrado no edital.</p>
        <table v-else class="objetiva">
          <thead>
            <tr>
              <th>Bloco</th>
              <th>Disciplina</th>
              <th class="numero">Questões</th>
              <th></th>
            </tr>
          </thead>
          <tbody v-for="(bloco, i) in metadados.blocos" :key="i">
            <tr v-for="(disciplina, j) in bloco.disciplinas.length ? bloco.disciplinas : [null]" :key="j">
              <td v-if="j === 0" :rowspan="Math.max(bloco.disciplinas.length, 1)" class="bloco">
                <span>{{ bloco.nome }}</span>
                <TrechoCitado :item="bloco" @ver="ver" />
              </td>
              <template v-if="disciplina">
                <td>{{ disciplina.nome }}</td>
                <td class="numero">{{ questoes(disciplina.questoes) }}</td>
                <td class="selo"><TrechoCitado :item="disciplina" @ver="ver" /></td>
              </template>
              <td v-else colspan="3" class="ausente">nenhuma disciplina</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="regras">
        <h3>Regras de corte</h3>
        <p v-if="metadados.regras_de_corte.length === 0" class="ausente">Nenhuma regra de corte encontrada no edital.</p>
        <ul v-else class="lista">
          <li v-for="(regra, i) in metadados.regras_de_corte" :key="i">
            <span>{{ regra.descricao }}</span>
            <TrechoCitado :item="regra" @ver="ver" />
          </li>
        </ul>

        <h3>Prova discursiva</h3>
        <p v-if="!metadados.discursiva" class="ausente">Não encontrada no edital.</p>
        <ul v-else class="lista">
          <li>
            <span>{{ metadados.discursiva.descricao }}</span>
            <TrechoCitado :item="metadados.discursiva" @ver="ver" />
          </li>
        </ul>
      </section>
    </div>

    <p class="rodape">
      <span :title="detalheDaExtracao || undefined">
        Extraídos pela IA<template v-if="metadados.extracao"> em {{ formatarDataHora(metadados.extracao.concluida_em) }}</template></span
      >
      · <b>{{ verificados }} de {{ itens.length }}</b> trechos conferidos na página citada. Correções feitas na Revisão
      aparecem aqui.
    </p>
  </div>
</template>

<style scoped>
.ficha {
  display: grid;
  gap: 1.25rem;
  padding: 1rem;
}
.ausente {
  margin: 0;
  color: var(--muted-foreground);
}

/* Banca, órgão, cargo e data numa linha (quebram em mais linhas quando falta largura). */
.campos {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 0.75rem 1.5rem;
}
.campo {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.campo dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.campo dd.ausente {
  font-weight: 400;
}

/* Tabela da prova objetiva e, ao lado, regras e discursiva. */
.corpo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr));
  gap: 1.25rem 2rem;
  align-items: start;
}
h3 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}
.total {
  font-weight: 500;
  color: var(--muted-foreground);
}
.objetiva {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.objetiva th {
  text-align: left;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid var(--border);
}
.objetiva td {
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid var(--border);
  vertical-align: baseline;
}
.bloco {
  font-weight: 600;
}
.bloco span {
  margin-right: 0.4rem;
}
.numero {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.selo {
  white-space: nowrap;
  width: 1%;
}
.regras h3 + .lista,
.regras h3 + .ausente {
  margin-bottom: 1rem;
}
.lista {
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.4rem;
  font-size: 0.85rem;
}
.lista li > span {
  margin-right: 0.4rem;
}
.rodape {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}
.rodape [title] {
  cursor: help;
  text-decoration: underline dotted;
}
</style>
