import { createRouter, createWebHistory } from 'vue-router'
import EditaisView from '../views/EditaisView.vue'
import EditalView from '../views/EditalView.vue'
import RevisaoView from '../views/RevisaoView.vue'
import FontesView from '../views/FontesView.vue'
import BibliotecaView from '../views/BibliotecaView.vue'
import NormaView from '../views/NormaView.vue'
import CoberturaView from '../views/CoberturaView.vue'
import ProvasView from '../views/ProvasView.vue'
import QuestoesView from '../views/QuestoesView.vue'
import LoginView from '../views/LoginView.vue'
import { useSessao } from '../composables/useSessao'
import { destinoSeguro } from './destino'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/editais' },
    // publica: abre sem sessão e sem o menu.
    { path: '/entrar', name: 'entrar', component: LoginView, meta: { publica: true } },
    { path: '/editais', name: 'editais', component: EditaisView },
    // larguraTotal: a tela usa toda a largura disponível, sem o limite de leitura do shell.
    { path: '/editais/:id', name: 'edital', component: EditalView, meta: { larguraTotal: true } },
    { path: '/editais/:id/revisao', name: 'revisao', component: RevisaoView, meta: { larguraTotal: true } },
    { path: '/editais/:id/fontes', name: 'fontes', component: FontesView, meta: { larguraTotal: true } },
    { path: '/editais/:id/cobertura', name: 'cobertura', component: CoberturaView, meta: { larguraTotal: true } },
    { path: '/editais/:id/provas', name: 'provas', component: ProvasView, meta: { larguraTotal: true } },
    { path: '/provas/:provaId/questoes', name: 'questoes', component: QuestoesView, meta: { larguraTotal: true } },
    { path: '/normas', name: 'normas', component: BibliotecaView },
    { path: '/normas/:id', name: 'norma', component: NormaView }
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
  return true
})

export default router
