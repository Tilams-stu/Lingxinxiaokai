import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { routes } from './router'
import './style.css'

const router = createRouter({
  history: createWebHistory(),
  routes,
})

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

router.beforeEach(async (to) => {
  if (to.meta?.public) return true
  try {
    const res = await fetchWithTimeout('/api/users/me', { credentials: 'include', cache: 'no-store' }, 8000)
    if (res.ok) return true
  } catch (_) {
    // 网络异常或超时时，统一回登录页，避免导航卡死在过渡页
  }
  return { path: '/login', query: { redirect: to.fullPath } }
})

createApp(App).use(router).mount('#app')
