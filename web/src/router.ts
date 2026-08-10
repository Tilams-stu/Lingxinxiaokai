import type { RouteRecordRaw } from 'vue-router'

const LoginView = () => import('./views/LoginView.vue')
const HomeView = () => import('./views/HomeView.vue')
const AdminView = () => import('./views/AdminView.vue')

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/login', component: LoginView, meta: { public: true } },
  { path: '/home', component: HomeView },
  { path: '/admin', component: AdminView },
]

