import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Options from './Options.vue'
import '@/assets/styles/variables.css'
import '@/content/floating-panel.css'
import 'katex/dist/katex.min.css'
import './style.css'

createApp(Options).use(createPinia()).mount('#app')
