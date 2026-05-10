import { createApp as createVueApp } from 'vue';
import { createPinia } from 'pinia';
import type { Component } from 'vue';
import '../styles.css';

export function mountApp(root: Component): void {
  const app = createVueApp(root);
  app.use(createPinia());
  app.mount('#app');
}
