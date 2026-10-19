import { createRouter, createWebHistory } from 'vue-router'
import EditaisView from '../views/EditaisView.vue'
import EditalView from '../views/EditalView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/editais' },
    { path: '/editais', name: 'editais', component: EditaisView },
    { path: '/editais/:id', name: 'edital', component: EditalView }
  ]
})

export default router
