<template>
  <div class="admin">
    <header class="admin-header">
      <span class="logo">管理后台</span>
      <a class="back-btn" href="/home">
        <i class="fa-solid fa-arrow-left"></i>
        <span>返回首页</span>
      </a>
    </header>

    <main class="admin-main">
      <section class="admin-card">
        <h2>数据导出</h2>
        <p class="desc">导出全站所有账号的聊天记录，按账号分块整理为 JSON 文件。</p>
        <button
          type="button"
          class="export-btn"
          :disabled="exporting"
          @click="doExport"
        >
          <i class="fa-solid fa-download"></i>
          {{ exporting ? '导出中...' : '一键导出全部聊天记录' }}
        </button>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const exporting = ref(false)

async function ensureAdmin() {
  const res = await fetch('/api/users/me', { credentials: 'include', cache: 'no-store' })
  if (!res.ok) {
    router.replace('/login')
    return false
  }
  const data = await res.json()
  if (!data?.user?.is_admin) {
    router.replace('/home')
    return false
  }
  return true
}

async function doExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const res = await fetch('/api/admin/export-all', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    })
    if (!res.ok) {
      alert('导出失败，请确认管理员权限')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const cd = res.headers.get('Content-Disposition') || ''
    const m = cd.match(/filename[*]?=(?:UTF-8'')?"?([^";\n]+)/i)
    a.download = m ? m[1].trim() : 'chat_export.json'
    a.click()
    URL.revokeObjectURL(url)
  } catch (_) {
    alert('导出失败，请稍后重试')
  } finally {
    exporting.value = false
  }
}

onMounted(async () => {
  const ok = await ensureAdmin()
  if (!ok) return
})
</script>

<style scoped>
.admin {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  background:
    radial-gradient(circle at 88% 16%, rgba(82, 122, 99, 0.09), transparent 28%),
    var(--lx-canvas);
  color: var(--lx-text);
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(980px, calc(100% - 48px));
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

.back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 8px 13px;
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-sm);
  color: var(--lx-muted);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
}

.back-btn:hover {
  border-color: #b9cabf;
  background: rgba(255, 253, 248, 0.75);
  color: var(--lx-ink);
}

.admin-main {
  width: min(980px, calc(100% - 48px));
  padding: clamp(58px, 10vh, 104px) 4px 60px;
  margin: 0 auto;
}

.admin-card {
  position: relative;
  max-width: 680px;
  padding: clamp(28px, 5vw, 48px);
  overflow: hidden;
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-lg);
  background: rgba(255, 253, 248, 0.94);
  box-shadow: var(--lx-shadow-md);
}

.admin-card::after {
  position: absolute;
  right: -70px;
  bottom: -112px;
  width: 220px;
  height: 220px;
  border: 1px solid rgba(82, 122, 99, 0.1);
  border-radius: 54% 46% 56% 44%;
  content: '';
  pointer-events: none;
  transform: rotate(24deg);
}

.admin-card h2 {
  position: relative;
  z-index: 1;
  margin: 0 0 14px;
  color: var(--lx-ink);
  font-size: clamp(25px, 4vw, 34px);
  font-weight: 740;
  letter-spacing: -0.04em;
}

.desc {
  position: relative;
  z-index: 1;
  max-width: 36em;
  margin: 0 0 28px;
  color: var(--lx-text);
  font-size: 14px;
  line-height: 1.75;
}

.export-btn {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: min(100%, 320px);
  min-height: 48px;
  padding: 12px 18px;
  border-radius: var(--lx-radius-md);
  background: var(--lx-accent);
  color: #fffdf8;
  font-size: 14px;
  font-weight: 680;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(63, 102, 81, 0.2);
  transition: background-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.export-btn:hover:not(:disabled) {
  background: var(--lx-accent-strong);
  transform: translateY(-1px);
  box-shadow: 0 13px 28px rgba(63, 102, 81, 0.25);
}

.export-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.export-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

@media (max-width: 480px) {
  .admin-header,
  .admin-main {
    width: calc(100% - 28px);
  }

  .admin-header {
    height: 62px;
  }

  .admin-main {
    padding: 38px 2px;
  }

  .admin-card {
    padding: 25px 20px;
  }

  .export-btn {
    width: 100%;
  }
}
</style>
