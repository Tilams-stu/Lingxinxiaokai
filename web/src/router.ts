import type { RouteRecordRaw } from 'vue-router'
import LoginView from './views/LoginView.vue'
import HomeView from './views/HomeView.vue'
import AdminView from './views/AdminView.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/login', component: LoginView, meta: { public: true } },
  { path: '/home', component: HomeView },
  { path: '/admin', component: AdminView },
  // TODO: /info /companion /users
]

