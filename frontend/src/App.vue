<script setup>
import { useRoute } from 'vue-router'
import Toast from 'primevue/toast'
import Message from 'primevue/message'
import AppShell from './components/layout/AppShell.vue'
import { useSessao } from './composables/useSessao'

const route = useRoute()
const { usuario, equipeAtual } = useSessao()
</script>

<template>
  <Toast position="bottom-right" />
  <router-view v-if="route.meta.publica" />
  <AppShell v-else-if="usuario">
    <Message v-if="!equipeAtual && !route.meta.semEquipe" severity="warn">
      Você ainda não faz parte de nenhuma equipe. Peça ao orientador que inclua você na equipe dele.
    </Message>
    <!-- :key — trocar de equipe remonta a tela, que busca de novo os dados da equipe nova. -->
    <router-view v-else :key="equipeAtual?.id || 'sem-equipe'" />
  </AppShell>
</template>
