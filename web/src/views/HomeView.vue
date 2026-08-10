<template>
  <div class="home">
    <header class="home-header">
      <span class="logo">聆心<span class="accent">小开</span></span>
      <button class="logout-btn" type="button" @click="logout">
        <i class="fa-solid fa-right-from-bracket"></i>
        <span>退出</span>
      </button>
    </header>

    <main class="home-main">
      <section class="intro">
        <h1>聆心小开</h1>
        <p>在这里，每一个情绪都值得被倾听</p>
      </section>

      <section class="nav-section">
        <h2 class="section-label">心理聊愈</h2>
        <div class="nav-cards">
          <a class="nav-card" href="/info">
            <span class="nav-icon"><i class="fa-solid fa-lightbulb"></i></span>
            <div class="nav-body">
              <h3>解惑助手</h3>
              <p>心理知识科普，解答疑惑</p>
            </div>
            <i class="fa-solid fa-chevron-right nav-arrow"></i>
          </a>
          <a class="nav-card" href="/companion">
            <span class="nav-icon"><i class="fa-solid fa-comments"></i></span>
            <div class="nav-body">
              <h3>倾诉空间</h3>
              <p>畅所欲言，获得温暖回应</p>
            </div>
            <i class="fa-solid fa-chevron-right nav-arrow"></i>
          </a>
        </div>
      </section>

      <section v-if="isAdmin" class="nav-section">
        <h2 class="section-label">管理</h2>
        <a class="nav-card admin-card" href="/admin">
          <span class="nav-icon"><i class="fa-solid fa-gear"></i></span>
          <div class="nav-body">
            <h3>管理后台</h3>
            <p>导出全站聊天记录</p>
          </div>
          <i class="fa-solid fa-chevron-right nav-arrow"></i>
        </a>
      </section>

    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const isAdmin = ref(false)

onMounted(async () => {
  try {
    const res = await fetch('/api/users/me', { credentials: 'include', cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      isAdmin.value = !!data?.user?.is_admin
    }
  } catch (_) {}
})

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', cache: 'no-store' })
  } catch (_) {}
  await router.push('/login')
}
</script>

<style scoped>
.home {
  min-height: 100vh;
  width: 100%;
  background: linear-gradient(160deg, #ebf0ec 0%, #f7faf8 50%, #eef5f0 100%);
  color: #4a5d52;
}

.home-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(125, 164, 141, 0.2);
  z-index: 100;
}

.logo {
  font-size: 1.15rem;
  font-weight: 600;
}

.logo .accent {
  color: #7da48d;
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(125, 164, 141, 0.35);
  border-radius: 20px;
  background: transparent;
  color: #87998d;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.25s ease;
}

.logout-btn:hover {
  border-color: #7da48d;
  color: #4a5d52;
}

.home-main {
  padding: 80px 24px 48px;
  max-width: 480px;
  margin: 0 auto;
}

.intro {
  text-align: center;
  margin-bottom: 40px;
}

.intro h1 {
  font-size: 1.6rem;
  font-weight: 600;
  margin: 0 0 8px;
}

.intro p {
  font-size: 0.95rem;
  color: #87998d;
  margin: 0;
}

.section-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: #87998d;
  margin: 0 0 12px;
}

.nav-section {
  margin-bottom: 28px;
}

.nav-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nav-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 20px rgba(74, 93, 82, 0.06);
  text-decoration: none;
  color: inherit;
  transition: all 0.3s ease;
}

.nav-card:hover {
  border-color: rgba(125, 164, 141, 0.4);
  box-shadow: 0 8px 28px rgba(125, 164, 141, 0.12);
  transform: translateY(-2px);
}

.nav-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e8f0ed;
  border-radius: 12px;
  color: #7da48d;
  font-size: 1.1rem;
}

.nav-body h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 4px;
}

.nav-body p {
  font-size: 0.85rem;
  color: #87998d;
  margin: 0;
}

.nav-arrow {
  margin-left: auto;
  color: #87998d;
  font-size: 0.85rem;
}

.admin-card .nav-icon {
  background: #f0e8e8;
  color: #a47d7d;
}

/* ====== 多端适配 ====== */
/* 大平板/iPad（769-1024px） */
@media (min-width: 769px) and (max-width: 1024px) {
  .home-main { max-width: 640px; padding: 80px 32px 56px; }
}
/* 小平板（481-768px） */
@media (min-width: 481px) and (max-width: 768px) {
  .home-main { max-width: 92%; padding: 76px 20px 48px; }
  .intro h1 { font-size: 1.5rem; }
}
/* 手机（<=480px） */
@media (max-width: 480px) {
  .home-main { padding: 70px 16px 40px; max-width: 100%; }
  .intro { margin-bottom: 28px; }
  .intro h1 { font-size: 1.35rem; }
  .intro p { font-size: 0.88rem; }
  .nav-card { padding: 14px 16px; gap: 12px; border-radius: 14px; }
  .nav-icon { width: 38px; height: 38px; font-size: 1rem; border-radius: 10px; }
  .nav-body h3 { font-size: 0.95rem; }
  .nav-body p { font-size: 0.8rem; }
  .logout-btn { padding: 6px 12px; font-size: 0.82rem; }
}
/* 超大屏（>=1400px） */
@media (min-width: 1400px) {
  .home-main { max-width: 640px; }
}
</style>
