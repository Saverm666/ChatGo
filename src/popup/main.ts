import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Popup from './Popup.vue'
import '@/assets/styles/variables.css'
import './style.css'

createApp(Popup).use(createPinia()).mount('#app')
