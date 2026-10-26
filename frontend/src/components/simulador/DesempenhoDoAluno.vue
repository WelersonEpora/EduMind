<script setup>
import { duracaoLegivel, formatarDataHora } from '../../utils/formatar'

// O desempenho de um aluno num edital (etapa 5c): o geral, por disciplina, os artigos de lei das questões que ele mais
// erra e as provas completas entregues. proprio: é o do usuário logado (as provas abrem a correção).

defineProps({
  desempenho: { type: Object, required: true },
  editalId: { type: String, required: true },
  proprio: { type: Boolean, default: false }
})

const percentual = (a, t) => (t ? Math.round((100 * a) / t) : 0)
const nomeDaProva = (prova) => `${prova.banca || 'Banca não informada'} ${prova.ano || ''}`.trim()
</script>

<template>
  <p v-if="desempenho.respostas === 0" class="vazio">
    {{ proprio ? 'Você ainda não respondeu nenhuma questão neste edital.' : 'Este aluno ainda não respondeu nenhuma questão neste edital.' }}
  </p>

  <div v-else class="desempenho">
    <div class="numeros">
      <div>
        <span class="numeros__valor">{{ percentual(desempenho.acertos, desempenho.respostas) }}%</span>
        <span class="numeros__rotulo">de acerto ({{ desempenho.acertos }} de {{ desempenho.respostas }} respostas)</span>
      </div>
      <div>
        <span class="numeros__valor">{{ desempenho.questoes }}</span>
        <span class="numeros__rotulo">questões diferentes</span>
      </div>
      <div>
        <span class="numeros__valor">{{ desempenho.caderno }}</span>
        <span class="numeros__rotulo">no caderno de erros</span>
      </div>
      <div>
        <span class="numeros__valor">{{ desempenho.provas.length }}</span>
        <span class="numeros__rotulo">{{ desempenho.provas.length === 1 ? 'prova completa' : 'provas completas' }}</span>
      </div>
    </div>
    <p class="discreto">Última atividade: {{ formatarDataHora(desempenho.ultima_atividade) }}</p>

    <div class="blocos">
      <section>
        <h3>Por disciplina</h3>
        <table class="tabela">
          <thead>
            <tr><th>Disciplina</th><th class="numero">Acertos</th><th class="col-barra">%</th></tr>
          </thead>
          <tbody>
            <tr v-for="d in desempenho.por_disciplina" :key="d.id">
              <td>
                {{ d.texto }}
                <span class="discreto">· {{ d.questoes }} {{ d.questoes === 1 ? 'questão' : 'questões' }}</span>
              </td>
              <td class="numero">{{ d.acertos }} de {{ d.respostas }}</td>
              <td class="col-barra">
                <span class="barra" :class="{ 'barra--fraca': percentual(d.acertos, d.respostas) < 50 }">
                  <i :style="{ width: `${percentual(d.acertos, d.respostas)}%` }"></i>
                </span>
                <span class="numero">{{ percentual(d.acertos, d.respostas) }}%</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Artigos em que {{ proprio ? 'você mais erra' : 'mais erra' }}</h3>
        <p v-if="!desempenho.artigos.length" class="discreto">Nenhum erro em questão de lei até agora.</p>
        <ol v-else class="artigos">
          <li v-for="a in desempenho.artigos" :key="`${a.norma.id}-${a.numero}`">
            <router-link :to="{ name: 'norma', params: { id: a.norma.id }, query: { artigo: a.numero } }">
              {{ a.norma.nome }}, art. {{ a.numero }}
            </router-link>
            <span class="discreto">errou {{ a.erros }} de {{ a.respostas }}</span>
          </li>
        </ol>
      </section>
    </div>

    <section v-if="desempenho.provas.length">
      <h3>Provas completas</h3>
      <table class="tabela">
        <thead>
          <tr><th>Entregue em</th><th>Prova</th><th class="numero">Acertos</th><th class="numero">Tempo usado</th><th v-if="proprio"></th></tr>
        </thead>
        <tbody>
          <tr v-for="p in desempenho.provas" :key="p.id">
            <td class="numero-esq">{{ formatarDataHora(p.entregue_em) }}</td>
            <td>{{ nomeDaProva(p.prova) }}</td>
            <td class="numero">{{ p.acertos }} de {{ p.total }} ({{ percentual(p.acertos, p.total) }}%)</td>
            <td class="numero">{{ duracaoLegivel(p.minutos_usados) }} de {{ duracaoLegivel(p.duracao_minutos) }}</td>
            <td v-if="proprio" class="acao">
              <router-link :to="{ name: 'simulado', params: { id: editalId, simuladoId: p.id } }">ver correção</router-link>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.vazio {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.9rem;
}
.desempenho {
  display: grid;
  gap: 1.25rem;
}
.numeros {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 1rem;
}
.numeros > div {
  display: grid;
  gap: 0.15rem;
}
.numeros__valor {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 600;
}
.numeros__rotulo,
.discreto {
  font-size: 0.82rem;
  color: var(--muted-foreground);
}
.desempenho > .discreto {
  margin: -0.75rem 0 0;
}
.blocos {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 1.5rem;
}
h3 {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
}
.tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.tabela th {
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--border);
}
.tabela td {
  padding: 0.45rem 0.5rem;
  border-bottom: 1px solid var(--border);
}
.numero {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.numero-esq {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.col-barra {
  width: 10rem;
  white-space: nowrap;
}
.col-barra .numero {
  display: inline-block;
  width: 3rem;
  margin-left: 0.5rem;
}
.barra {
  display: inline-block;
  vertical-align: middle;
  width: 5.5rem;
  height: 6px;
  border-radius: 999px;
  background: var(--muted);
  overflow: hidden;
}
.barra i {
  display: block;
  height: 100%;
  background: var(--positive);
}
.barra--fraca i {
  background: var(--negative);
}
.artigos {
  margin: 0;
  padding-left: 1.25rem;
  display: grid;
  gap: 0.4rem;
  font-size: 0.9rem;
}
.artigos a,
.acao a {
  color: var(--primary);
  text-decoration: none;
}
.artigos a:hover,
.acao a:hover {
  text-decoration: underline;
}
.artigos li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.25rem 0.75rem;
}
.acao {
  text-align: right;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .blocos {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .tabela thead {
    display: none;
  }
  .tabela tr {
    display: grid;
    gap: 0.2rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }
  .tabela td {
    padding: 0;
    border: 0;
    text-align: left;
  }
}
</style>
