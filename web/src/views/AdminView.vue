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
  min-height: 100vh;
  background: linear-gradient(160deg, #ebf0ec 0%, #f7faf8 50%, #eef5f0 100%);
  color: #4a5d52;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 20px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(125, 164, 141, 0.2);
}

.logo {
  font-size: 1.1rem;
  font-weight: 600;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(125, 164, 141, 0.35);
  border-radius: 20px;
  color: #87998d;
  text-decoration: none;
  font-size: 0.9rem;
  transition: all 0.25s ease;
}

.back-btn:hover {
  border-color: #7da48d;
  color: #4a5d52;
}

.admin-main {
  padding: 48px 24px;
  max-width: 480px;
  margin: 0 auto;
}

.admin-card {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(74, 93, 82, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.9);
}

.admin-card h2 {
  margin: 0 0 12px;
  font-size: 1.15rem;
}

.desc {
  margin: 0 0 20px;
  font-size: 0.9rem;
  color: #87998d;
  line-height: 1.5;
}

.export-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 20px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #658a74, #7da48d);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s ease;
}

.export-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(125, 164, 141, 0.35);
}

.export-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

/* ====== 多端适配 ====== */
/* 大平板/iPad（769-1024px） */
@media (min-width: 769px) and (max-width: 1024px) {
  .admin-main { max-width: 640px; padding: 48px 32px; }
}
/* 小平板/大手机（481-768px） */
@media (min-width: 481px) and (max-width: 768px) {
  .admin-main { max-width: 92%; padding: 40px 20px; }
}
/* 手机（<=480px） */
@media (max-width: 480px) {
  .admin-main { padding: 32px 16px; max-width: 100%; }
  .admin-card { padding: 20px 18px; border-radius: 14px; }
  .admin-card h2 { font-size: 1.05rem; }
  .desc { font-size: 0.85rem; }
  .export-btn { padding: 12px 16px; font-size: 0.9rem; }
  .logo { font-size: 1rem; }
  .back-btn { padding: 6px 12px; font-size: 0.82rem; }
}
/* 超大屏（>=1400px） */
@media (min-width: 1400px) {
  .admin-main { max-width: 640px; }
}
</style>
