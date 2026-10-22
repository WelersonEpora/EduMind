import { createRouter, createWebHistory } from 'vue-router'
import EditaisView from '../views/EditaisView.vue'
import EditalView from '../views/EditalView.vue'
import RevisaoView from '../views/RevisaoView.vue'
import FontesView from '../views/FontesView.vue'
import BibliotecaView from '../views/BibliotecaView.vue'
import NormaView from '../views/NormaView.vue'
import CoberturaView from '../views/CoberturaView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/editais' },
    { path: '/editais', name: 'editais', component: EditaisView },
    // larguraTotal: a tela usa toda a largura disponível, sem o limite de leitura do shell.
    { path: '/editais/:id', name: 'edital', component: EditalView, meta: { larguraTotal: true } },
    { path: '/editais/:id/revisao', name: 'revisao', component: RevisaoView, meta: { larguraTotal: true } },
    { path: '/editais/:id/fontes', name: 'fontes', component: FontesView, meta: { larguraTotal: true } },
    { path: '/editais/:id/cobertura', name: 'cobertura', component: CoberturaView, meta: { larguraTotal: true } },
    { path: '/normas', name: 'normas', component: BibliotecaView },
    { path: '/normas/:id', name: 'norma', component: NormaView }
  ]
})

export default router
