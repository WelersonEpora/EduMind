<script setup>
import Toast from 'primevue/toast'
import AppShell from './components/layout/AppShell.vue'
</script>

<template>
  <Toast position="bottom-right" />
  <AppShell>
    <router-view />
  </AppShell>
</template>
