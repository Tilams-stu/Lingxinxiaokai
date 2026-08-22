<template>
  <div class="admin">
    <header class="admin-header">
      <div>
        <span class="eyebrow">受控数据查看</span>
        <span class="logo">管理后台</span>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="export-btn"
          :disabled="exporting"
          @click="doExport"
        >
          <i class="fa-solid fa-download" aria-hidden="true"></i>
          {{ exporting ? '导出中...' : '导出全部记录' }}
        </button>
        <a class="back-btn" href="/home">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          <span>返回首页</span>
        </a>
      </div>
    </header>

    <main class="admin-main">
      <section class="page-intro">
        <p class="kicker">管理员查询</p>
        <h1>看见每一次对话的来处</h1>
        <p class="intro-copy">在受控设备上查看账号与聊天记录。状态回顾、风险证据和 Pi 上下文摘要不会出现在这里。</p>
      </section>

      <section class="overview-grid" aria-label="数据概览">
        <article class="overview-card">
          <span class="overview-label">账号总数</span>
          <strong>{{ users.length }}</strong>
          <span class="overview-note">已注册账号</span>
        </article>
        <article class="overview-card overview-card-accent">
          <span class="overview-label">聊天消息</span>
          <strong>{{ totalMessages }}</strong>
          <span class="overview-note">用户与助手消息合计</span>
        </article>
        <article class="overview-card overview-card-soft">
          <span class="overview-label">当前筛选</span>
          <strong>{{ filteredUsers.length }}</strong>
          <span class="overview-note">匹配的账号</span>
        </article>
      </section>

      <div v-if="usersError" class="page-state page-state-error" role="alert">
        <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
        <span>{{ usersError }}</span>
        <button type="button" class="inline-action" @click="loadUsers">重试</button>
      </div>

      <div class="admin-layout" :class="{ 'detail-open': detailOpen }">
        <section class="user-panel" aria-labelledby="user-list-title">
          <div class="panel-heading">
            <div>
              <p class="kicker">账户目录</p>
              <h2 id="user-list-title">选择一个账号</h2>
            </div>
            <span class="count-badge">{{ filteredUsers.length }}</span>
          </div>

          <label class="search-field">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <span class="sr-only">搜索称呼或学号</span>
            <input v-model="searchQuery" type="search" placeholder="搜索称呼或学号" autocomplete="off">
            <button v-if="searchQuery" type="button" class="clear-search" aria-label="清除搜索" @click="searchQuery = ''">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </label>

          <div v-if="loadingUsers" class="panel-state" aria-live="polite">
            <span class="loading-dot" aria-hidden="true"></span>
            正在读取账号目录...
          </div>
          <div v-else-if="!filteredUsers.length" class="panel-state panel-state-empty" aria-live="polite">
            <i class="fa-regular fa-folder-open" aria-hidden="true"></i>
            <span>{{ searchQuery ? '没有匹配的账号' : '还没有注册账号' }}</span>
          </div>
          <div v-else class="user-list" role="list">
            <button
              v-for="user in pagedUsers"
              :key="user.id"
              type="button"
              class="user-row"
              :class="{ selected: selectedUser?.id === user.id }"
              role="listitem"
              @click="selectUser(user)"
            >
              <span class="avatar" aria-hidden="true">{{ initials(user.username) }}</span>
              <span class="user-row-main">
                <span class="user-name-line">
                  <strong>{{ user.username }}</strong>
                  <span v-if="user.is_admin" class="admin-mark">管理员</span>
                </span>
                <span class="user-meta">{{ user.student_id || '未填写学号' }}</span>
                <span class="user-timestamps">注册 {{ formatTime(user.created_at) }} · 最近登录 {{ formatTime(user.last_login) }}</span>
              </span>
              <span class="user-row-side">
                <strong>{{ user.chat_count }}</strong>
                <span>消息</span>
              </span>
              <i class="fa-solid fa-chevron-right row-arrow" aria-hidden="true"></i>
            </button>
          </div>

          <nav v-if="totalPages > 1" class="pagination" aria-label="账号分页">
            <button type="button" class="page-btn" :disabled="currentPage === 1" aria-label="上一页" @click="currentPage -= 1">
              <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
            </button>
            <span>{{ currentPage }} / {{ totalPages }}</span>
            <button type="button" class="page-btn" :disabled="currentPage === totalPages" aria-label="下一页" @click="currentPage += 1">
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </button>
          </nav>
        </section>

        <section class="detail-panel" aria-labelledby="detail-title">
          <div class="detail-header">
            <button type="button" class="mobile-back" @click="detailOpen = false">
              <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
              账号列表
            </button>
            <div v-if="selectedUser" class="detail-user">
              <span class="avatar avatar-large" aria-hidden="true">{{ initials(selectedUser.username) }}</span>
              <div>
                <p class="kicker">聊天记录</p>
                <h2 id="detail-title">{{ selectedUser.username }}</h2>
                <p>{{ selectedUser.student_id || '未填写学号' }} · {{ selectedUser.chat_count }} 条消息</p>
              </div>
            </div>
            <div v-else class="detail-placeholder">
              <p class="kicker">聊天记录</p>
              <h2 id="detail-title">选择账号后查看</h2>
              <p>左侧选择一个账号，查看按会话整理的消息。</p>
            </div>
          </div>

          <div v-if="selectedUser && messageError" class="page-state page-state-error" role="alert">
            <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
            <span>{{ messageError }}</span>
            <button type="button" class="inline-action" @click="reloadMessages">重试</button>
          </div>
          <div v-else-if="selectedUser && loadingMessages" class="panel-state detail-state" aria-live="polite">
            <span class="loading-dot" aria-hidden="true"></span>
            正在读取消息...
          </div>
          <div v-else-if="selectedUser && !messages.length" class="panel-state detail-state panel-state-empty" aria-live="polite">
            <i class="fa-regular fa-comments" aria-hidden="true"></i>
            这个账号还没有聊天记录
          </div>
          <div v-else-if="selectedUser" class="detail-content">
            <p v-if="messages.length < selectedUser.chat_count" class="limit-note" role="status">
              当前仅展示最近 500 条，完整内容请使用导出。
            </p>
            <div class="session-tabs" role="tablist" aria-label="聊天会话">
              <button
                v-for="group in sessionGroups"
                :key="group.id"
                type="button"
                class="session-tab"
                :class="{ active: selectedSessionId === group.id }"
                role="tab"
                :aria-selected="selectedSessionId === group.id"
                @click="selectedSessionId = group.id"
              >
                <span>{{ group.label }}</span>
                <small>{{ group.messages.length }} 条</small>
              </button>
            </div>

            <div v-if="selectedSession" class="conversation-card">
              <div class="conversation-heading">
                <div>
                  <p class="kicker">当前会话</p>
                  <h3>{{ selectedSession.label }}</h3>
                </div>
                <span>{{ formatTime(selectedSession.lastMessageAt) }}</span>
              </div>
              <ol class="message-list" aria-live="polite">
                <li v-for="message in selectedSession.messages" :key="message.id" class="message-row" :class="message.role === 'user' ? 'message-user' : 'message-assistant'">
                  <span class="message-role">{{ message.role === 'user' ? '用户' : '助手' }}</span>
                  <p>{{ message.content }}</p>
                  <time :datetime="message.created_at">{{ formatTime(message.created_at) }}</time>
                </li>
              </ol>
            </div>
          </div>
          <div v-else class="detail-empty-illustration" aria-hidden="true">
            <i class="fa-regular fa-message"></i>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

type UserRecord = {
  id: number
  username: string
  student_id: string
  is_admin: boolean
  created_at: string
  last_login: string | null
  chat_count: number
}

type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
  session_id: string | null
  created_at: string
}

type SessionGroup = {
  id: string
  label: string
  messages: ChatMessage[]
  lastMessageAt: string
}

const router = useRouter()
const users = ref<UserRecord[]>([])
const searchQuery = ref('')
const currentPage = ref(1)
const selectedUser = ref<UserRecord | null>(null)
const messages = ref<ChatMessage[]>([])
const selectedSessionId = ref<string | null>(null)
const loadingUsers = ref(true)
const loadingMessages = ref(false)
const usersError = ref('')
const messageError = ref('')
const exporting = ref(false)
const detailOpen = ref(false)
let messageRequestId = 0

const pageSize = 20

const filteredUsers = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) return users.value
  return users.value.filter((user) => `${user.username} ${user.student_id}`.toLocaleLowerCase().includes(query))
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / pageSize)))
const pagedUsers = computed(() => filteredUsers.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize))
const totalMessages = computed(() => users.value.reduce((sum, user) => sum + user.chat_count, 0))

const sessionGroups = computed<SessionGroup[]>(() => {
  const groups = new Map<string, SessionGroup>()
  for (const message of messages.value) {
    const id = message.session_id || '__ungrouped__'
    const current = groups.get(id) || { id, label: message.session_id || '历史未分组', messages: [], lastMessageAt: message.created_at }
    current.messages.push(message)
    if (message.created_at > current.lastMessageAt) current.lastMessageAt = message.created_at
    groups.set(id, current)
  }
  return [...groups.values()]
    .map((group) => ({ ...group, messages: [...group.messages].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id) }))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
})

const selectedSession = computed(() => sessionGroups.value.find((group) => group.id === selectedSessionId.value) || null)

watch(searchQuery, () => { currentPage.value = 1 })
watch(sessionGroups, (groups) => {
  if (!groups.some((group) => group.id === selectedSessionId.value)) selectedSessionId.value = groups[0]?.id || null
}, { immediate: true })

function initials(username: string) {
  return [...username.trim()].slice(0, 2).join('') || '聆'
}

function formatTime(value: string | null) {
  if (!value) return '暂无记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

function handleAccessFailure(status: number) {
  if (status === 401) {
    router.replace('/login')
    return true
  }
  if (status === 403) {
    router.replace('/home')
    return true
  }
  return false
}

async function ensureAdmin() {
  const response = await fetch('/api/users/me', { credentials: 'include', cache: 'no-store' })
  if (handleAccessFailure(response.status)) return false
  if (!response.ok) {
    usersError.value = '暂时无法确认管理员权限，请稍后重试。'
    return false
  }
  const data = await response.json().catch(() => ({}))
  if (!data?.user?.is_admin) {
    router.replace('/home')
    return false
  }
  return true
}

async function loadUsers() {
  loadingUsers.value = true
  usersError.value = ''
  try {
    const response = await fetch('/api/users', { credentials: 'include', cache: 'no-store' })
    if (handleAccessFailure(response.status)) return
    if (!response.ok) throw new Error('账号目录暂时不可用。')
    const data = await response.json()
    users.value = Array.isArray(data?.users) ? data.users : []
  } catch (error) {
    usersError.value = error instanceof Error ? error.message : '账号目录暂时不可用。'
  } finally {
    loadingUsers.value = false
  }
}

async function selectUser(user: UserRecord) {
  selectedUser.value = user
  detailOpen.value = true
  messages.value = []
  selectedSessionId.value = null
  messageError.value = ''
  loadingMessages.value = true
  const requestId = ++messageRequestId
  try {
    const response = await fetch(`/api/users/${user.id}/messages?limit=500`, { credentials: 'include', cache: 'no-store' })
    if (requestId !== messageRequestId) return
    if (handleAccessFailure(response.status)) return
    if (!response.ok) throw new Error('聊天记录暂时不可用。')
    const data = await response.json()
    messages.value = Array.isArray(data?.messages) ? data.messages : []
  } catch (error) {
    if (requestId === messageRequestId) messageError.value = error instanceof Error ? error.message : '聊天记录暂时不可用。'
  } finally {
    if (requestId === messageRequestId) loadingMessages.value = false
  }
}

async function reloadMessages() {
  if (selectedUser.value) await selectUser(selectedUser.value)
}

async function doExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const response = await fetch('/api/admin/export-all', { credentials: 'include', cache: 'no-store' })
    if (handleAccessFailure(response.status)) return
    if (!response.ok) throw new Error('导出失败，请确认管理员权限。')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    const disposition = response.headers.get('Content-Disposition') || ''
    const filename = disposition.match(/filename[*]?=(?:UTF-8'')?"?([^";\n]+)/i)
    anchor.download = filename ? filename[1].trim() : 'chat_export.json'
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    usersError.value = error instanceof Error ? error.message : '导出失败，请稍后重试。'
  } finally {
    exporting.value = false
  }
}

onMounted(async () => {
  if (await ensureAdmin()) await loadUsers()
})
</script>

<style scoped>
.admin {
  min-height: 100dvh;
  background:
    radial-gradient(circle at 86% 8%, rgba(82, 122, 99, 0.09), transparent 26%),
    var(--lx-canvas);
  color: var(--lx-text);
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(1240px, calc(100% - 48px));
  min-height: 76px;
  padding: 14px 0;
  margin: 0 auto;
  border-bottom: 1px solid rgba(82, 122, 99, 0.16);
}

.eyebrow,
.kicker {
  display: block;
  margin: 0 0 6px;
  color: var(--lx-accent-strong);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.logo {
  display: block;
  color: var(--lx-ink);
  font-size: 19px;
  font-weight: 760;
  letter-spacing: -0.03em;
}

.header-actions,
.back-btn,
.export-btn,
.mobile-back {
  display: flex;
  align-items: center;
}

.header-actions {
  gap: 10px;
}

.back-btn,
.mobile-back {
  gap: 8px;
  color: var(--lx-muted);
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
}

.back-btn {
  min-height: 40px;
  padding: 8px 13px;
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-sm);
  transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
}

.back-btn:hover {
  border-color: #b9cabf;
  background: rgba(255, 253, 248, 0.75);
  color: var(--lx-ink);
}

.export-btn {
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 9px 14px;
  border: 0;
  border-radius: var(--lx-radius-sm);
  background: var(--lx-accent);
  color: #fffdf8;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.export-btn:hover:not(:disabled) {
  background: var(--lx-accent-strong);
  transform: translateY(-1px);
}

.export-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.admin-main {
  width: min(1240px, calc(100% - 48px));
  padding: 48px 0 72px;
  margin: 0 auto;
}

.page-intro {
  max-width: 720px;
  margin-bottom: 30px;
}

.page-intro h1,
.panel-heading h2,
.detail-header h2,
.conversation-heading h3 {
  margin: 0;
  color: var(--lx-ink);
  letter-spacing: -0.04em;
}

.page-intro h1 {
  font-size: clamp(30px, 5vw, 48px);
  line-height: 1.06;
}

.intro-copy {
  max-width: 52em;
  margin: 15px 0 0;
  color: var(--lx-muted);
  font-size: 14px;
  line-height: 1.75;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.overview-card {
  display: grid;
  gap: 5px;
  min-height: 120px;
  padding: 20px;
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-md);
  background: rgba(255, 253, 248, 0.78);
}

.overview-card-accent {
  border-color: rgba(82, 122, 99, 0.22);
  background: rgba(232, 241, 234, 0.76);
}

.overview-card-soft {
  background: rgba(248, 246, 238, 0.78);
}

.overview-label,
.overview-note {
  color: var(--lx-muted);
  font-size: 12px;
}

.overview-card strong {
  color: var(--lx-ink);
  font-size: 30px;
  font-weight: 760;
  letter-spacing: -0.05em;
}

.admin-layout {
  display: grid;
  grid-template-columns: minmax(300px, 0.82fr) minmax(0, 1.55fr);
  min-height: 620px;
  overflow: hidden;
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-lg);
  background: rgba(255, 253, 248, 0.88);
  box-shadow: var(--lx-shadow-md);
}

.user-panel,
.detail-panel {
  min-width: 0;
}

.user-panel {
  border-right: 1px solid var(--lx-line);
  background: rgba(250, 249, 242, 0.72);
}

.panel-heading,
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 24px 24px 18px;
}

.panel-heading h2,
.detail-header h2 {
  font-size: 22px;
}

.count-badge {
  min-width: 28px;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(82, 122, 99, 0.12);
  color: var(--lx-accent-strong);
  font-size: 12px;
  font-weight: 720;
  text-align: center;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 18px 14px;
  padding: 0 12px;
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-sm);
  background: rgba(255, 253, 248, 0.92);
  color: var(--lx-muted);
}

.search-field:focus-within {
  border-color: rgba(82, 122, 99, 0.55);
  box-shadow: 0 0 0 3px rgba(82, 122, 99, 0.1);
}

.search-field input {
  width: 100%;
  min-height: 42px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--lx-ink);
  font: inherit;
  font-size: 13px;
}

.clear-search,
.page-btn,
.inline-action,
.mobile-back,
.session-tab,
.user-row {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.clear-search {
  padding: 4px;
  background: transparent;
  color: var(--lx-muted);
}

.user-list {
  display: grid;
  gap: 2px;
  padding: 0 10px 10px;
}

.user-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto 12px;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 13px 12px;
  border-radius: var(--lx-radius-sm);
  background: transparent;
  color: var(--lx-text);
  text-align: left;
  transition: background-color 0.18s ease, transform 0.18s ease;
}

.user-row:hover,
.user-row.selected {
  background: rgba(232, 241, 234, 0.82);
}

.user-row.selected {
  box-shadow: inset 3px 0 0 var(--lx-accent);
}

.avatar {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 13px;
  background: #dceade;
  color: var(--lx-accent-strong);
  font-size: 13px;
  font-weight: 760;
}

.avatar-large {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  border-radius: 16px;
}

.user-row-main,
.user-name-line,
.user-row-side,
.detail-user,
.message-row {
  min-width: 0;
}

.user-row-main,
.user-name-line,
.user-row-side {
  display: flex;
}

.user-row-main {
  flex-direction: column;
  gap: 4px;
}

.user-name-line {
  align-items: center;
  gap: 6px;
}

.user-name-line strong,
.user-meta,
.user-row-side span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-name-line strong {
  color: var(--lx-ink);
  font-size: 13px;
}

.user-meta,
.user-timestamps,
.user-row-side,
.row-arrow {
  color: var(--lx-muted);
  font-size: 11px;
}

.user-timestamps {
  max-width: 100%;
  overflow: hidden;
  color: color-mix(in srgb, var(--lx-muted) 82%, transparent);
  font-size: 10px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-mark {
  padding: 2px 5px;
  border-radius: 999px;
  background: rgba(82, 122, 99, 0.12);
  color: var(--lx-accent-strong);
  font-size: 9px;
  font-weight: 720;
}

.user-row-side {
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.user-row-side strong {
  color: var(--lx-ink);
  font-size: 13px;
}

.row-arrow {
  font-size: 10px;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 18px 18px;
  color: var(--lx-muted);
  font-size: 12px;
}

.page-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: rgba(82, 122, 99, 0.1);
  color: var(--lx-accent-strong);
}

.page-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.detail-panel {
  background: rgba(255, 253, 248, 0.68);
}

.detail-header {
  min-height: 108px;
  border-bottom: 1px solid var(--lx-line);
}

.detail-user {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-header p:not(.kicker) {
  margin: 6px 0 0;
  color: var(--lx-muted);
  font-size: 12px;
}

.detail-placeholder {
  padding: 3px 0;
}

.detail-placeholder p:not(.kicker) {
  max-width: 34em;
  line-height: 1.6;
}

.detail-content {
  padding: 18px 24px 26px;
}

.limit-note {
  margin: 0 0 14px;
  padding: 10px 12px;
  border: 1px solid rgba(181, 129, 65, 0.22);
  border-radius: var(--lx-radius-sm);
  background: rgba(250, 241, 220, 0.65);
  color: #7c5a2c;
  font-size: 12px;
  line-height: 1.5;
}

.session-tabs {
  display: flex;
  gap: 8px;
  max-width: 100%;
  padding-bottom: 14px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.session-tab {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 4px;
  min-width: 130px;
  padding: 10px 12px;
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-sm);
  background: rgba(250, 249, 242, 0.72);
  color: var(--lx-muted);
  font-size: 12px;
  text-align: left;
}

.session-tab small {
  color: inherit;
  font-size: 10px;
}

.session-tab.active {
  border-color: rgba(82, 122, 99, 0.42);
  background: rgba(220, 234, 222, 0.8);
  color: var(--lx-accent-strong);
}

.conversation-card {
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-md);
  background: rgba(255, 253, 248, 0.88);
}

.conversation-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 18px;
  border-bottom: 1px solid var(--lx-line);
}

.conversation-heading h3 {
  font-size: 17px;
  overflow-wrap: anywhere;
}

.conversation-heading > span {
  flex: 0 0 auto;
  color: var(--lx-muted);
  font-size: 11px;
}

.message-list {
  display: grid;
  gap: 14px;
  max-height: 560px;
  padding: 20px 18px 24px;
  margin: 0;
  overflow-y: auto;
  list-style: none;
}

.message-row {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 10px;
  padding: 12px 14px;
  border-radius: 14px;
}

.message-user {
  margin-right: 9%;
  background: #edf4ed;
}

.message-assistant {
  margin-left: 9%;
  background: #f5f2e9;
}

.message-role {
  color: var(--lx-accent-strong);
  font-size: 11px;
  font-weight: 760;
}

.message-row p {
  min-width: 0;
  margin: 0;
  color: var(--lx-text);
  font-size: 13px;
  line-height: 1.72;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message-row time {
  grid-column: 2;
  color: var(--lx-muted);
  font-size: 10px;
}

.page-state,
.panel-state {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--lx-muted);
  font-size: 13px;
  line-height: 1.6;
}

.page-state {
  margin: 0 0 18px;
  padding: 12px 14px;
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-sm);
  background: rgba(255, 253, 248, 0.8);
}

.page-state-error {
  border-color: rgba(175, 92, 79, 0.24);
  background: rgba(252, 239, 235, 0.82);
  color: #8a493f;
}

.panel-state {
  justify-content: center;
  min-height: 160px;
  padding: 24px;
}

.detail-state {
  min-height: 300px;
}

.panel-state-empty {
  flex-direction: column;
  color: var(--lx-muted);
}

.panel-state-empty i {
  color: rgba(82, 122, 99, 0.48);
  font-size: 24px;
}

.inline-action {
  margin-left: auto;
  padding: 3px 8px;
  border-radius: 7px;
  background: rgba(82, 122, 99, 0.12);
  color: var(--lx-accent-strong);
  font-size: 12px;
  font-weight: 720;
}

.loading-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--lx-accent);
  box-shadow: 12px 0 0 rgba(82, 122, 99, 0.28), 24px 0 0 rgba(82, 122, 99, 0.12);
  animation: breathe 1.2s ease-in-out infinite;
}

.detail-empty-illustration {
  display: grid;
  place-items: center;
  min-height: 490px;
  color: rgba(82, 122, 99, 0.22);
  font-size: 58px;
}

.mobile-back {
  display: none;
  padding: 0;
  background: transparent;
  color: var(--lx-accent-strong);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes breathe {
  0%, 100% { opacity: 0.35; transform: translateX(0); }
  50% { opacity: 1; transform: translateX(4px); }
}

@media (prefers-reduced-motion: reduce) {
  .loading-dot { animation: none; }
  .back-btn,
  .export-btn,
  .user-row { transition: none; }
}

@media (max-width: 840px) {
  .admin-layout {
    display: block;
    min-height: 0;
  }

  .user-panel {
    border-right: 0;
  }

  .detail-panel {
    display: none;
  }

  .admin-layout.detail-open .user-panel {
    display: none;
  }

  .admin-layout.detail-open .detail-panel {
    display: block;
  }

  .mobile-back {
    display: flex;
    margin-bottom: 16px;
  }

  .detail-header {
    display: block;
  }

  .detail-content {
    padding-top: 16px;
  }
}

@media (max-width: 620px) {
  .admin-header,
  .admin-main {
    width: calc(100% - 28px);
  }

  .admin-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
    padding: 16px 0;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions .export-btn,
  .header-actions .back-btn {
    flex: 1;
    justify-content: center;
  }

  .admin-main {
    padding: 34px 0 44px;
  }

  .overview-grid {
    grid-template-columns: 1fr;
  }

  .overview-card {
    min-height: 96px;
  }

  .panel-heading,
  .detail-header,
  .detail-content {
    padding-left: 16px;
    padding-right: 16px;
  }

  .message-user,
  .message-assistant {
    margin-left: 0;
    margin-right: 0;
  }

  .conversation-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
