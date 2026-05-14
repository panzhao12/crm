import { inject } from '@vercel/analytics';
import { mountApp } from '../createApp';
import WebApp from './WebApp.vue';

inject();
mountApp(WebApp);
