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
  position: relative;
  isolation: isolate;
  width: 100%;
  min-height: 100dvh;
  overflow: hidden;
  background:
    radial-gradient(circle at 8% 8%, rgba(82, 122, 99, 0.1), transparent 30%),
    var(--lx-canvas);
  color: var(--lx-text);
}

.home::before,
.home::after {
  position: fixed;
  z-index: -1;
  content: '';
  pointer-events: none;
}

.home::before {
  top: 18%;
  right: -7vw;
  width: min(34vw, 480px);
  aspect-ratio: 0.76;
  border: 1px solid rgba(82, 122, 99, 0.1);
  border-radius: 55% 45% 58% 42%;
  transform: rotate(24deg);
}

.home::after {
  top: 29%;
  right: 4vw;
  width: min(20vw, 280px);
  height: 1px;
  background: rgba(82, 122, 99, 0.12);
  transform: rotate(-51deg);
  transform-origin: right center;
}

.home-header {
  position: relative;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(1120px, calc(100% - 48px));
  height: 68px;
  padding: 0 4px;
  margin: 0 auto;
  border-bottom: 1px solid rgba(82, 122, 99, 0.16);
}

.logo {
  color: var(--lx-ink);
  font-size: 17px;
  font-weight: 720;
  letter-spacing: -0.02em;
}

.logo .accent {
  color: var(--lx-accent);
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 8px 13px;
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-sm);
  background: transparent;
  color: var(--lx-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
}

.logout-btn:hover {
  border-color: #b9cabf;
  background: rgba(255, 253, 248, 0.75);
  color: var(--lx-ink);
}

.home-main {
  display: grid;
  width: min(1120px, calc(100% - 48px));
  padding: clamp(70px, 10vh, 116px) 4px 64px;
  margin: 0 auto;
  grid-template-columns: minmax(280px, 0.8fr) minmax(420px, 1.2fr);
  column-gap: clamp(56px, 8vw, 112px);
  row-gap: 20px;
}

.intro {
  position: relative;
  align-self: start;
  padding: 12px 0 28px;
}

.intro::before {
  display: block;
  width: 46px;
  height: 3px;
  margin-bottom: 24px;
  border-radius: 3px;
  background: var(--lx-accent);
  content: '';
}

.intro h1 {
  max-width: 8ch;
  margin: 0 0 18px;
  color: var(--lx-ink);
  font-size: clamp(42px, 5.2vw, 68px);
  font-weight: 760;
  letter-spacing: -0.065em;
  line-height: 1.03;
}

.intro p {
  max-width: 18em;
  margin: 0;
  color: var(--lx-text);
  font-size: clamp(15px, 1.5vw, 18px);
  line-height: 1.8;
}

.section-label {
  margin: 0 0 14px;
  color: var(--lx-muted);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.06em;
}

.nav-section {
  grid-column: 2;
  margin-bottom: 12px;
}

.nav-cards {
  display: grid;
  gap: 14px;
}

.nav-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 118px;
  padding: 24px;
  overflow: hidden;
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-lg);
  background: rgba(255, 253, 248, 0.92);
  color: inherit;
  text-decoration: none;
  box-shadow: var(--lx-shadow-sm);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.nav-card::after {
  position: absolute;
  right: -38px;
  bottom: -52px;
  width: 116px;
  height: 116px;
  border: 1px solid rgba(82, 122, 99, 0.1);
  border-radius: 52% 48% 56% 44%;
  content: '';
  transform: rotate(28deg);
}

.nav-card:hover {
  border-color: #b8cbbf;
  box-shadow: 0 14px 34px rgba(36, 56, 46, 0.11);
  transform: translateY(-1px);
}

.nav-card:active {
  transform: translateY(1px);
}

.nav-icon {
  display: grid;
  width: 50px;
  height: 50px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(82, 122, 99, 0.12);
  border-radius: var(--lx-radius-md);
  background: var(--lx-accent-soft);
  color: var(--lx-accent-strong);
  font-size: 18px;
}

.nav-body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5px;
}

.nav-body h3 {
  margin: 0;
  color: var(--lx-ink);
  font-size: 17px;
  font-weight: 700;
}

.nav-body p {
  margin: 0;
  color: var(--lx-muted);
  font-size: 13.5px;
  line-height: 1.6;
}

.nav-arrow {
  position: relative;
  z-index: 1;
  margin-left: auto;
  color: var(--lx-accent);
  font-size: 13px;
}

.admin-card {
  min-height: 92px;
  padding-block: 18px;
  background: rgba(243, 247, 243, 0.88);
  box-shadow: none;
}

.admin-card .nav-icon {
  background: transparent;
}

@media (max-width: 840px) {
  .home-header,
  .home-main {
    width: min(680px, calc(100% - 40px));
  }

  .home-main {
    padding-top: 54px;
    grid-template-columns: 1fr;
    row-gap: 30px;
  }

  .intro,
  .nav-section {
    grid-column: 1;
  }

  .intro {
    padding-bottom: 0;
  }

  .intro h1 {
    max-width: none;
  }
}

@media (max-width: 480px) {
  .home-header,
  .home-main {
    width: calc(100% - 28px);
  }

  .home-header {
    height: 62px;
  }

  .home-main {
    padding: 38px 2px 36px;
    row-gap: 24px;
  }

  .intro::before {
    margin-bottom: 18px;
  }

  .intro h1 {
    margin-bottom: 12px;
    font-size: 39px;
  }

  .nav-card {
    min-height: 104px;
    gap: 14px;
    padding: 19px 17px;
  }

  .nav-icon {
    width: 44px;
    height: 44px;
    font-size: 16px;
  }

  .admin-card {
    min-height: 88px;
  }
}
</style>
