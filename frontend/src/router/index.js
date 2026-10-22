import { createRouter, createWebHistory } from 'vue-router'
import EditaisView from '../views/EditaisView.vue'
import EditalView from '../views/EditalView.vue'
import RevisaoView from '../views/RevisaoView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/editais' },
    { path: '/editais', name: 'editais', component: EditaisView },
    // larguraTotal: a tela usa toda a largura disponível, sem o limite de leitura do shell.
    { path: '/editais/:id', name: 'edital', component: EditalView, meta: { larguraTotal: true } },
    { path: '/editais/:id/revisao', name: 'revisao', component: RevisaoView, meta: { larguraTotal: true } }
  ]
})

export default router
