import { createRouter, createWebHistory } from 'vue-router'
import EditaisView from '../views/EditaisView.vue'
import EditalLayout from '../components/layout/EditalLayout.vue'
import EditalView from '../views/EditalView.vue'
import RevisaoView from '../views/RevisaoView.vue'
import FontesView from '../views/FontesView.vue'
import BibliotecaView from '../views/BibliotecaView.vue'
import NormaView from '../views/NormaView.vue'
import CoberturaView from '../views/CoberturaView.vue'
import ProvasView from '../views/ProvasView.vue'
import QuestoesView from '../views/QuestoesView.vue'
import SimuladorView from '../views/SimuladorView.vue'
import SimuladoView from '../views/SimuladoView.vue'
import AlunosView from '../views/AlunosView.vue'
import AlunoView from '../views/AlunoView.vue'
import LoginView from '../views/LoginView.vue'
import EquipeView from '../views/EquipeView.vue'
import ContaView from '../views/ContaView.vue'
import AdminEquipesView from '../views/AdminEquipesView.vue'
import { useSessao } from '../composables/useSessao'
import { destinoSeguro } from './destino'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/editais' },
    // publica: abre sem sessão e sem o menu.
    { path: '/entrar', name: 'entrar', component: LoginView, meta: { publica: true } },
    { path: '/editais', name: 'editais', component: EditaisView },
    // Telas de um edital: a casca (EditalLayout) mostra o nome e as abas; cada aba é uma rota filha, com URL própria.
    {
      path: '/editais/:id',
      component: EditalLayout,
      children: [
        { path: '', name: 'edital', component: EditalView },
        // naoAluno: o aluno não vê (etapa 4c); quem chega por link vai para a Visão geral.
        { path: 'revisao', name: 'revisao', component: RevisaoView, meta: { naoAluno: true } },
        { path: 'fontes', name: 'fontes', component: FontesView, meta: { naoAluno: true } },
        { path: 'cobertura', name: 'cobertura', component: CoberturaView },
        { path: 'provas', name: 'provas', component: ProvasView, meta: { naoAluno: true } },
        // A prova é da equipe e pode estar em mais de um edital: o :id diz de qual edital se chegou.
        { path: 'provas/:provaId', name: 'questoes', component: QuestoesView, meta: { naoAluno: true } },
        { path: 'simulador', name: 'simulador', component: SimuladorView },
        // Uma prova completa (etapa 5b), em andamento ou entregue.
        { path: 'simulador/provas/:simuladoId', name: 'simulado', component: SimuladoView },
        // Os alunos do edital e o desempenho de cada um (etapa 5c): orientador e professor.
        { path: 'alunos', name: 'alunos', component: AlunosView, meta: { naoAluno: true } },
        { path: 'alunos/:alunoId', name: 'aluno', component: AlunoView, meta: { naoAluno: true } }
      ]
    },
    { path: '/normas', name: 'normas', component: BibliotecaView },
    { path: '/normas/:id', name: 'norma', component: NormaView },
    // O aluno não vê os membros da equipe (etapa 4c).
    { path: '/equipe', name: 'equipe', component: EquipeView, meta: { naoAluno: true } },
    // semEquipe: abre mesmo para quem não está em nenhuma equipe (o administrador, por exemplo).
    { path: '/conta', name: 'conta', component: ContaView, meta: { semEquipe: true } },
    { path: '/admin/equipes', name: 'admin-equipes', component: AdminEquipesView, meta: { semEquipe: true, soAdmin: true } }
  ]
})

// Sem sessão, qualquer tela leva ao login (e volta para ela depois). Com sessão, o login leva para dentro.
router.beforeEach(async (to) => {
  const sessao = useSessao()
  if (!sessao.carregado.value) {
    try {
      await sessao.carregar()
    } catch {
      // Backend fora do ar: segue para o login, que mostra o erro ao tentar entrar.
    }
  }
  const logado = Boolean(sessao.usuario.value)
  if (to.meta.publica) return logado ? destinoSeguro(to.query.voltar) : true
  if (!logado) return { name: 'entrar', query: to.fullPath === '/' ? {} : { voltar: to.fullPath } }
  if (to.meta.soAdmin && !sessao.usuario.value.admin) return { name: 'editais' }
  if (to.meta.naoAluno && sessao.eAluno.value) return to.params.id ? { name: 'edital', params: { id: to.params.id } } : { name: 'editais' }
  // O administrador sem equipe começa pela administração.
  if (to.name === 'editais' && !sessao.equipeAtual.value && sessao.usuario.value.admin) return { name: 'admin-equipes' }
  return true
})

export default router
