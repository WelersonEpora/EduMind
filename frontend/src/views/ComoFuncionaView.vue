<script setup>
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import PassoDoGuia from '../components/guia/PassoDoGuia.vue'

// Como funciona: o roteiro do orientador, do PDF do edital ao simulador do aluno, em oito passos e três fases. Deixa
// explícito onde a IA entra (violeta) e o que é feito sem ela. Página estática: os recortes ao lado de cada passo são
// ilustrações com dados de exemplo, não dados da equipe. O aluno não vê (é sobre o trabalho do orientador).
</script>

<template>
  <div class="guia">
    <section class="abertura">
      <div>
        <p class="rotulo abertura__eyebrow">Guia do orientador</p>
        <h1>Do PDF do edital ao simulador do aluno, em oito passos</h1>
        <p class="abertura__lead">
          Você envia o edital, <strong>confere</strong> o que a IA leu, reúne o texto oficial das normas e as provas
          anteriores, e só então <strong>libera o edital</strong> para os alunos. Nada chega ao aluno sem passar pela sua
          revisão.
        </p>
        <p class="abertura__lead">
          A IA entra em <strong>três passos</strong>, marcados em violeta. Em todos eles, o que ela produz é uma proposta
          que você confere.
        </p>
      </div>
      <aside class="painel trilha" aria-label="Situação do edital">
        <p class="rotulo">A situação do edital mostra onde você está</p>
        <ol>
          <li><span class="trilha__ponto"></span><Tag value="em revisão · 42 pendentes" severity="warn" /></li>
          <li><span class="trilha__ponto"></span><Tag value="fontes pendentes · 3 normas" severity="warn" /></li>
          <li class="trilha--pronta"><span class="trilha__ponto"></span><Tag value="cobertura pronta" severity="success" /></li>
        </ol>
        <small>Ela aparece na lista de Editais e no topo do edital. As abas Revisão e Fontes mostram quantos itens faltam.</small>
      </aside>
    </section>

    <section class="mapa-ia" aria-label="Onde a IA é usada">
      <div class="mapa-ia__coluna mapa-ia__coluna--ia">
        <h2><i class="pi pi-sparkles"></i>Onde a IA trabalha</h2>
        <ul>
          <li>
            <a href="#passo-2">passo 2</a>
            <span>Lê o PDF do edital e propõe os dados do concurso e o conteúdo programático.<small>Cada item vem com o trecho literal e a página, conferidos por busca no texto.</small></span>
          </li>
          <li>
            <a href="#passo-4">passo 4</a>
            <span>Busca na web a URL oficial de cada norma.<small>Só a URL. O texto da lei nunca vem da IA.</small></span>
          </li>
          <li>
            <a href="#passo-6">passo 6</a>
            <span>Lê as questões e o gabarito das provas anteriores e liga cada questão aos artigos que ela cobra.<small>As questões duvidosas ficam marcadas para revisão.</small></span>
          </li>
        </ul>
        <p class="mapa-ia__nota">O aluno não conversa com a IA. Ele recebe só o que você conferiu.</p>
      </div>
      <div class="mapa-ia__coluna painel">
        <h2>Feito sem IA</h2>
        <ul>
          <li><a href="#passo-3">passo 3</a><span>A revisão: quem aprova, corrige ou rejeita é você.</span></li>
          <li><a href="#passo-4">passo 4</a><span>A identidade de cada norma, proposta por código, e o texto, enviado por você.</span></li>
          <li><a href="#passo-5">passo 5</a><span>A expansão dos artigos ("293 a 305; 311-A") e o cruzamento com a norma, por código.</span></li>
          <li><a href="#passo-8">passo 8</a><span>A correção do simulador, pelo gabarito conferido.</span></li>
        </ul>
      </div>
    </section>

    <nav class="fases-nav" aria-label="Fases">
      <a href="#fase-preparar"><span>1–3</span>Preparar o edital</a>
      <a href="#fase-material"><span>4–6</span>Montar o material</a>
      <a href="#fase-liberar"><span>7–8</span>Liberar e acompanhar</a>
    </nav>

    <!-- Fase 1 -->
    <section id="fase-preparar" class="fase">
      <div class="fase__cabeca">
        <h2><span>Fase 1</span>Preparar o edital</h2>
        <span class="fase__termina">Termina quando sai de <Tag value="em revisão" severity="warn" /></span>
      </div>
      <ol class="passos">
        <PassoDoGuia :numero="1" titulo="Inclua o PDF do edital" :onde="['Editais', 'Incluir']" :quem="['orientador', 'professor']" recorte-titulo="Editais">
          <p>Envie o PDF publicado pela banca. O edital fica só na sua equipe; outras equipes não o veem.</p>
          <template #recorte>
            <div class="linha"><span><i class="pi pi-file recorte__icone"></i> edital-tjsp-escrevente-2025.pdf</span></div>
            <div class="linha"><span class="mono-pequeno">78 páginas · 1,9 MB</span><Button label="Incluir" icon="pi pi-plus" size="small" tabindex="-1" /></div>
          </template>
        </PassoDoGuia>

        <PassoDoGuia
          :numero="2"
          titulo="Extraia com IA o conteúdo programático"
          :onde="['Edital', 'Visão geral', 'Extrair com IA']"
          :quem="['orientador', 'professor']"
          :ia="{
            faz: 'Lê o PDF e propõe os dados do concurso e a árvore de itens, cada um com trecho e página.',
            confere: 'No passo 3, item por item, com a página do edital aberta ao lado.'
          }"
          recorte-titulo="Lido pela IA · p. 41"
        >
          <p>A IA lê os dados do concurso (órgão, cargo, banca, data) e monta a árvore de disciplinas e itens. Cada item vem com o <strong>trecho literal</strong> e a página de onde saiu.</p>
          <ul>
            <li>O sistema procura o trecho na página citada. Se não acha, o item fica <Tag value="não verificado" severity="danger" />.</li>
            <li>Leva alguns minutos; a tela se atualiza sozinha.</li>
          </ul>
          <template #recorte>
            <div class="recorte__documento">… Código Penal: <mark>artigos 293 a 305; 311-A; 312 a 317</mark>; 319 a 333 …</div>
            <div class="linha"><Tag value="verificado" severity="success" /><span class="mono-pequeno">Direito Penal</span></div>
          </template>
        </PassoDoGuia>

        <PassoDoGuia
          :numero="3"
          titulo="Revise item por item"
          :onde="['Edital', 'Revisão']"
          :quem="['orientador', 'professor']"
          sem-ia="Quem decide é você. A IA não aprova nada sozinha."
          recorte-titulo="Progresso"
        >
          <p>Confira cada item com a página do edital aberta ao lado. Aprove, corrija o texto ou rejeite. Use "só pendentes" para ver o que falta.</p>
          <ul>
            <li>Só os itens <strong>aprovados</strong> seguem para as fases seguintes.</li>
            <li>Extrair de novo por cima de uma revisão apaga o trabalho; só o orientador pode, e o sistema pede confirmação.</li>
          </ul>
          <template #recorte>
            <div class="barra"><i class="barra--aprovados"></i><i class="barra--rejeitados"></i></div>
            <div class="linha"><span><b>71</b> aprovados · <b>7</b> rejeitados</span><Tag value="42 pendentes" severity="warn" /></div>
          </template>
        </PassoDoGuia>
      </ol>
    </section>

    <!-- Fase 2 -->
    <section id="fase-material" class="fase">
      <div class="fase__cabeca">
        <h2><span>Fase 2</span>Montar o material</h2>
        <span class="fase__termina">Termina em <Tag value="cobertura pronta" severity="success" /></span>
      </div>
      <ol class="passos">
        <PassoDoGuia
          :numero="4"
          titulo="Obtenha o texto oficial das normas"
          :onde="['Edital', 'Fontes']"
          :quem="['orientador', 'professor']"
          :ia="{
            faz: 'Em Buscar com IA, pesquisa na web só a URL oficial, e só de domínio oficial. Nunca escreve nem resume o texto da lei.',
            confere: 'A identidade da norma, que o sistema propõe por código, e a URL. O texto é você quem envia.'
          }"
          recorte-titulo="Fontes · 9 normas"
        >
          <p>Aparecem as normas citadas nos itens aprovados. Para cada uma, confirme qual é a norma, encontre a URL oficial (com a IA ou informando você mesmo) e envie o texto: a página salva pelo navegador, o PDF ou o texto.</p>
          <ul>
            <li>As normas vão para a Biblioteca, compartilhada entre editais. Cada edital usa a versão mais próxima da data em que foi publicado.</li>
            <li>Cada envio com conteúdo diferente vira uma versão nova da norma.</li>
          </ul>
          <template #recorte>
            <div class="linha"><span class="mono-pequeno">planalto.gov.br/…/del2848.htm</span><span class="tag-ia">URL da IA</span></div>
            <div class="linha"><span>Constituição Federal</span><Tag value="texto enviado" severity="success" /></div>
            <div class="linha"><span>Lei 10.261/1968 (SP)</span><Tag value="sem texto" severity="warn" /></div>
          </template>
        </PassoDoGuia>

        <PassoDoGuia
          :numero="5"
          titulo="Confira a cobertura dos artigos"
          :onde="['Edital', 'Cobertura']"
          :quem="['orientador', 'professor']"
          sem-ia='A expansão de "312 a 317" e o cruzamento com o texto da norma são feitos por código.'
          recorte-titulo="Código Penal · 312 a 317"
        >
          <p>Cada artigo pedido no edital é cruzado com o texto da norma: encontrado, revogado ou faltando. O alerta de vigência marca o que mudou depois da publicação do edital.</p>
          <ul>
            <li>Quando o edital cita por estrutura ("Título II, Capítulos I e II"), confira a lista de artigos montada e clique em <strong>Conferi: vale esta lista</strong>. Só então esses artigos contam.</li>
            <li>Artigo não encontrado aparece como não encontrado. O sistema nunca inventa texto de lei.</li>
          </ul>
          <template #recorte>
            <div class="linha"><span class="mono-pequeno">Art. 312 · Peculato</span><Tag value="encontrado" severity="success" /></div>
            <div class="linha"><span class="mono-pequeno">Art. 313-A</span><Tag value="letra no intervalo" severity="secondary" /></div>
            <div class="linha"><span class="mono-pequeno">Art. 317-A</span><Tag value="revogado" severity="secondary" /></div>
            <Button label="Conferi: vale esta lista" icon="pi pi-check" size="small" tabindex="-1" />
          </template>
        </PassoDoGuia>

        <PassoDoGuia
          :numero="6"
          titulo="Inclua provas anteriores da banca"
          :onde="['Edital', 'Provas anteriores']"
          :quem="['orientador', 'professor']"
          quem-observacao="excluir prova, só o orientador"
          :ia="{
            faz: 'Lê as questões e o gabarito do PDF (também de gabarito em imagem) e classifica cada questão pela norma e pelos artigos que cobra.',
            confere: 'As questões marcadas para revisão, a classificação e a tabela do gabarito.'
          }"
          recorte-titulo="Lidas pela IA"
        >
          <p>O sistema sugere onde procurar. Baixe e envie o PDF da prova e o do gabarito; a IA lê as questões e as liga aos artigos que cobram.</p>
          <ul>
            <li>O sistema não baixa provas sozinho: ele sugere buscas e você envia os arquivos.</li>
            <li>As provas alimentam o simulador do aluno e mostram, na Cobertura, quantas vezes cada artigo já caiu.</li>
          </ul>
          <template #recorte>
            <div class="linha"><span>VUNESP · Escrevente 2023</span><Tag value="100 questões" severity="success" /></div>
            <div class="linha"><span>VUNESP · Escrevente 2021</span><Tag value="8 a revisar" severity="warn" /></div>
            <div class="linha"><span class="mono-pequeno">Art. 312 CP caiu em</span><b>4 provas</b></div>
          </template>
        </PassoDoGuia>
      </ol>
    </section>

    <!-- Fase 3 -->
    <section id="fase-liberar" class="fase">
      <div class="fase__cabeca">
        <h2><span>Fase 3</span>Liberar e acompanhar</h2>
        <span class="fase__termina">O aluno só vê o edital depois do passo 7</span>
      </div>
      <ol class="passos">
        <PassoDoGuia :numero="7" titulo="Atribua o edital aos alunos" :onde="['Edital', 'Alunos', 'Adicionar alunos']" :quem="['orientador']" recorte-titulo="Adicionar alunos · TJSP 2025">
          <p>No edital, abra a aba <strong>Alunos</strong>, clique em <strong>Adicionar alunos</strong> e marque quem vai estudar por ele. É isso que publica o conteúdo para eles.</p>
          <ul>
            <li>O aluno precisa estar na equipe antes: inclua-o em <strong>Membros</strong> com o papel <strong>aluno</strong>.</li>
            <li>Para a turma toda, use <strong>Marcar todos</strong>.</li>
            <li>Libere quando a cobertura estiver pronta: o aluno vê o edital como ele está naquele momento.</li>
            <li>Tirar o aluno da lista acaba o acesso na hora; o que ele fez no simulador fica guardado.</li>
          </ul>
          <template #recorte>
            <div class="caixa-marcar"><span class="caixa-marcar__caixa caixa-marcar__caixa--marcada"><i class="pi pi-check"></i></span><b>Marcar todos</b></div>
            <div class="caixa-marcar"><span class="caixa-marcar__caixa caixa-marcar__caixa--marcada"><i class="pi pi-check"></i></span>Ana Souza</div>
            <div class="caixa-marcar"><span class="caixa-marcar__caixa caixa-marcar__caixa--marcada"><i class="pi pi-check"></i></span>Bruno Lima</div>
          </template>
        </PassoDoGuia>

        <PassoDoGuia
          :numero="8"
          titulo="Acompanhe o desempenho"
          :onde="['Edital', 'Alunos']"
          :quem="['orientador', 'professor']"
          sem-ia="A correção do simulador usa o gabarito que você conferiu."
          recorte-titulo="Alunos · TJSP 2025"
        >
          <p>Veja quantas questões cada aluno respondeu, o acerto, as provas completas e a última atividade. Clique no aluno para ver o acerto por disciplina e o caderno de erros.</p>
          <template #recorte>
            <div class="linha"><span>Ana Souza</span><span><b>412</b> q · <b class="positivo">71%</b></span></div>
            <div class="linha"><span>Bruno Lima</span><span><b>138</b> q · <b>54%</b></span></div>
            <div class="linha"><span>Carla Mendes</span><span class="mono-pequeno">sem atividade</span></div>
          </template>
        </PassoDoGuia>
      </ol>
    </section>

    <section class="dois">
      <div class="painel bloco">
        <h2>O que o aluno recebe</h2>
        <p class="bloco__descricao">Só os editais atribuídos a ele, sem as pendências do seu trabalho.</p>
        <ul class="lista-aluno">
          <li><i class="pi pi-file"></i><div><strong>Visão geral</strong><small>Dados do concurso e o conteúdo programático revisado.</small></div></li>
          <li><i class="pi pi-chart-bar"></i><div><strong>Cobertura</strong><small>Os artigos cobrados, com o texto da lei e quantas vezes cada um caiu.</small></div></li>
          <li><i class="pi pi-play-circle"></i><div><strong>Simulador</strong><small>Treino por disciplina, prova completa cronometrada e caderno de erros.</small></div></li>
          <li><i class="pi pi-book"></i><div><strong>Biblioteca de normas</strong><small>O texto oficial das normas, para consulta.</small></div></li>
        </ul>
      </div>
      <div class="painel bloco">
        <h2>Quem faz o quê</h2>
        <div class="tabela">
          <table>
            <thead><tr><th>Tarefa</th><th>Orientador</th><th>Professor</th><th>Aluno</th></tr></thead>
            <tbody>
              <tr><td>Incluir, extrair e revisar o edital</td><td class="sim">✓</td><td class="sim">✓</td><td>–</td></tr>
              <tr><td>Extrair de novo sobre uma revisão</td><td class="sim">✓</td><td>–</td><td>–</td></tr>
              <tr><td>Fontes, cobertura e provas</td><td class="sim">✓</td><td class="sim">✓</td><td>–</td></tr>
              <tr><td>Excluir prova</td><td class="sim">✓</td><td>–</td><td>–</td></tr>
              <tr><td>Gerir membros e atribuir editais</td><td class="sim">✓</td><td>–</td><td>–</td></tr>
              <tr><td>Ver Visão geral e Cobertura</td><td class="sim">✓</td><td class="sim">✓</td><td class="parcial">atribuídos</td></tr>
              <tr><td>Usar o simulador</td><td class="sim">✓</td><td class="sim">✓</td><td class="parcial">atribuídos</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section>
      <h2 class="titulo-secao">O que o sistema garante</h2>
      <div class="garantias">
        <div><strong>Cada item tem origem</strong><span>Todo item extraído traz o trecho literal e a página, e o sistema confere se o trecho está lá.</span></div>
        <div><strong>Lei só de fonte oficial</strong><span>O texto vem do que você envia. A IA só ajuda a achar a URL oficial, nunca escreve o texto.</span></div>
        <div><strong>Revogado não é faltando</strong><span>Artigo revogado aparece como revogado; o que não foi achado aparece como não encontrado.</span></div>
      </div>
    </section>

    <div class="rodape">
      <p>Pronto para começar? Inclua o primeiro edital da equipe.</p>
      <router-link :to="{ name: 'editais' }" class="rodape__link">Ir para Editais<i class="pi pi-arrow-right"></i></router-link>
    </div>
  </div>
</template>

<style scoped>
.guia {
  display: flex;
  flex-direction: column;
  gap: 2.25rem;
}

.abertura {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 2rem;
  align-items: start;
}
.abertura__eyebrow {
  color: var(--primary);
  margin: 0 0 0.5rem;
}
.abertura h1 {
  font-size: clamp(1.6rem, 3.2vw, 2.2rem);
  line-height: 1.12;
  margin-bottom: 0.85rem;
}
.abertura__lead {
  font-size: 1rem;
  color: var(--muted-foreground);
  margin: 0 0 0.6rem;
  max-width: 56ch;
}
.abertura__lead strong {
  color: var(--foreground);
}
.trilha {
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.trilha .rotulo {
  margin: 0;
}
.trilha ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.trilha li {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.trilha__ponto {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  border: 2px solid var(--warning);
}
.trilha--pronta .trilha__ponto {
  border-color: var(--positive);
  background: var(--positive);
}
.trilha small {
  font-size: 0.78rem;
  color: var(--muted-foreground);
}

/* Onde a IA entra */
.mapa-ia {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 1rem;
}
.mapa-ia__coluna {
  border-radius: var(--radius);
  padding: 1rem 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  min-width: 0;
}
.mapa-ia__coluna--ia {
  background: var(--ia-bg);
  border: 1px solid color-mix(in oklab, var(--ia) 30%, transparent);
}
.mapa-ia h2 {
  font-family: var(--font-display);
  font-size: 1.05rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.mapa-ia__coluna--ia h2 {
  color: var(--ia-foreground);
}
.mapa-ia ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.mapa-ia li {
  display: grid;
  grid-template-columns: 3.4rem minmax(0, 1fr);
  gap: 0.5rem;
  font-size: 0.85rem;
}
.mapa-ia li a {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-decoration: none;
  color: var(--primary);
  font-weight: 500;
  padding-top: 0.12rem;
}
.mapa-ia__coluna--ia li a {
  color: var(--ia-foreground);
}
.mapa-ia li a:hover {
  text-decoration: underline;
}
.mapa-ia li small {
  display: block;
  color: var(--muted-foreground);
  font-size: 0.78rem;
}
.mapa-ia__nota {
  margin: 0;
  font-size: 0.82rem;
  color: var(--ia-foreground);
  font-weight: 500;
  border-top: 1px solid color-mix(in oklab, var(--ia) 25%, transparent);
  padding-top: 0.6rem;
}

.fases-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.fases-nav a {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--foreground);
  font-size: 0.84rem;
  font-weight: 500;
  background: var(--card);
}
.fases-nav a:hover {
  background: var(--accent);
  border-color: transparent;
}
.fases-nav span {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--primary);
}

.fase {
  scroll-margin-top: 72px;
}
.fase__cabeca {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.6rem;
}
.fase__cabeca h2 {
  font-family: var(--font-display);
  font-size: 1.3rem;
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}
.fase__cabeca h2 span {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--primary);
  font-weight: 500;
}
.fase__termina {
  font-size: 0.8rem;
  color: var(--muted-foreground);
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.passos {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* Conteúdo dos recortes (slot do PassoDoGuia) */
.linha {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-width: 0;
}
.linha > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mono-pequeno {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--muted-foreground);
}
.recorte__icone {
  color: var(--primary);
}
.recorte__documento {
  font-family: var(--font-doc);
  font-size: 0.86rem;
  line-height: 1.5;
  background: var(--paper);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
}
.recorte__documento mark {
  background: var(--mark);
  color: var(--mark-foreground);
  padding: 0 0.15rem;
  border-radius: 3px;
}
.tag-ia {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.12rem 0.5rem;
  border-radius: 6px;
  background: var(--ia-bg);
  color: var(--ia-foreground);
  white-space: nowrap;
}
.barra {
  height: 6px;
  border-radius: 999px;
  background: var(--muted);
  overflow: hidden;
  display: flex;
}
.barra i {
  display: block;
  height: 100%;
}
.barra--aprovados {
  width: 62%;
  background: var(--positive);
}
.barra--rejeitados {
  width: 6%;
  background: var(--negative);
}
.positivo {
  color: var(--positive);
}
.caixa-marcar {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.caixa-marcar__caixa {
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 4px;
  border: 1.5px solid var(--border);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.caixa-marcar__caixa--marcada {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}
.caixa-marcar__caixa .pi {
  font-size: 0.6rem;
}

/* O que o aluno recebe e quem faz o quê */
.dois {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1.25rem;
}
.bloco {
  padding: 1.1rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  min-width: 0;
}
.bloco h2,
.titulo-secao {
  font-family: var(--font-display);
  font-size: 1.1rem;
}
.bloco__descricao {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.86rem;
}
.lista-aluno {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.lista-aluno li {
  display: grid;
  grid-template-columns: 1.6rem minmax(0, 1fr);
  gap: 0.5rem;
  align-items: start;
}
.lista-aluno li > .pi {
  width: 1.6rem;
  height: 1.6rem;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--accent);
  color: var(--primary);
  font-size: 0.8rem;
}
.lista-aluno strong {
  display: block;
}
.lista-aluno small {
  color: var(--muted-foreground);
  font-size: 0.8rem;
}
.tabela {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
th,
td {
  text-align: left;
  padding: 0.45rem 0.5rem;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
  color: var(--muted-foreground);
}
td:first-child {
  color: var(--foreground);
}
th {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}
th:not(:first-child),
td:not(:first-child) {
  text-align: center;
  width: 5.5rem;
}
td.sim {
  color: var(--positive);
  font-weight: 700;
}
td.parcial {
  color: var(--warning-foreground);
  font-size: 0.74rem;
}

.titulo-secao {
  margin-bottom: 1rem;
}
.garantias {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem 1.5rem;
}
.garantias div {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-top: 2px solid var(--primary);
  padding-top: 0.6rem;
}
.garantias strong {
  font-family: var(--font-display);
  font-size: 0.95rem;
}
.garantias span {
  color: var(--muted-foreground);
  font-size: 0.84rem;
}

.rodape {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  background: var(--accent);
  color: var(--accent-foreground);
  border-radius: var(--radius);
  padding: 1rem 1.2rem;
}
.rodape p {
  margin: 0;
  font-weight: 500;
}
.rodape__link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
  font-size: 0.86rem;
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  background: var(--primary);
  color: var(--primary-foreground);
  text-decoration: none;
}

@media (max-width: 900px) {
  .abertura,
  .mapa-ia,
  .dois {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 760px) {
  .garantias {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 560px) {
  th:not(:first-child),
  td:not(:first-child) {
    width: auto;
    padding-inline: 0.25rem;
  }
  th {
    font-size: 0.6rem;
    letter-spacing: 0.02em;
  }
}
</style>
