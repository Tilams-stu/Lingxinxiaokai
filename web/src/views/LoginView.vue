<template>
  <div id="login-root">
    <div id="canvas-container"></div>
    <div class="ui-container">
      <div ref="cardEl" class="login-card" id="login-card">
        <div class="header">
          <h1 class="title">聆心小开</h1>
          <p class="subtitle">拾起一片落叶，放下万千思绪。<br />让烦恼化作飞叶，随春风消散。</p>
        </div>

        <div class="auth-toggle" id="auth-toggle">
          <div class="toggle-slider"></div>
          <button type="button" class="toggle-btn" :class="{ active: mode === 'login' }" @click="switchMode('login')">登录</button>
          <button type="button" class="toggle-btn" :class="{ active: mode === 'register' }" @click="switchMode('register')">注册</button>
        </div>

        <form id="login-form" @submit.prevent="submit">
          <div class="input-group">
            <label>你的称呼</label>
            <input v-model.trim="username" type="text" placeholder="例如：旅人 / 星期八" required autocomplete="off" />
          </div>
          <div class="input-group" v-if="mode === 'register'">
            <label>你的学号</label>
            <input v-model.trim="studentId" type="text" placeholder="用于同步记录" required autocomplete="off" />
          </div>
          <div class="input-group" v-else>
            <label>你的学号</label>
            <input v-model.trim="studentId" type="text" placeholder="用于同步记录" required autocomplete="off" />
          </div>
          <div class="input-group">
            <label>你的密码</label>
            <input v-model="password" type="password" placeholder="心底的密码" required />
          </div>
          <button type="submit" class="submit-btn" id="submit-btn" :disabled="submitting">
            {{ mode === 'login' ? '随风释然' : '注册并化作飞叶' }}
          </button>
          <div v-if="error" class="error">{{ error }}</div>
        </form>
      </div>
    </div>
    <!-- 登录成功后全屏显示的过渡文案，与卡片完全分离，不重叠 -->
    <div ref="welcomeEl" class="welcome-overlay" id="welcome-msg">
      <span class="welcome-text">深呼吸...</span>
      <span class="welcome-text">万物复苏，心如止水</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import * as THREE from 'three'

const router = useRouter()
const route = useRoute()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const studentId = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref('')

type ThreeCtx = {
  burst: () => void
  dispose: () => void
}

const cardEl = ref<HTMLDivElement | null>(null)
const welcomeEl = ref<HTMLDivElement | null>(null)
let threeCtx: ThreeCtx | null = null

function switchMode(next: 'login' | 'register') {
  mode.value = next
  const toggle = document.getElementById('auth-toggle')
  if (toggle) toggle.classList.toggle('register-mode', next === 'register')
}

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    const endpoint = mode.value === 'login' ? '/api/auth/login' : '/api/auth/register'
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({
        username: username.value,
        password: password.value,
        student_id: studentId.value,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || (res.status === 401 ? '称呼、学号或密码错误' : '请求未成功，请稍后重试'))

    const redirect = (route.query.redirect as string) || '/home'
    cardEl.value?.classList.add('fade-out')
    threeCtx?.burst()
    // 等卡片完全淡出后再显示过渡文案，避免重叠
    window.setTimeout(() => {
      if (cardEl.value) cardEl.value.style.visibility = 'hidden'
      if (welcomeEl.value) welcomeEl.value.classList.add('show')
    }, 500)
    window.setTimeout(async () => {
      try {
        await router.replace(redirect)
      } catch (_) {
        // 路由异常时兜底，防止停留在过渡文案页
        window.location.href = redirect
      }
    }, 2500)
  } catch (e: any) {
    error.value = e?.name === 'TypeError' ? '无法连接服务，请确认后端已启动。' : (e?.message || '请求失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

function initThree(): ThreeCtx | null {
  const container = document.getElementById('canvas-container')
  if (!container) return null

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2('#F7FAF8', 0.012)

  const initW = container.clientWidth || window.innerWidth
  const initH = container.clientHeight || window.innerHeight
  const camera = new THREE.PerspectiveCamera(45, initW / initH, 0.1, 1000)
  camera.position.set(0, 5, 80)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  const w = container.clientWidth || window.innerWidth
  const h = container.clientHeight || window.innerHeight
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  const createDewTexture = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.85)')
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(32, 32, 30, 0, Math.PI * 2)
    ctx.fill()
    return new THREE.CanvasTexture(canvas)
  }

  const texture = createDewTexture()

  const leafGroup = new THREE.Group()
  const velocities: Array<{ x: number; y: number; z: number }> = []
  const particleCount = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 6000
  const positions = new Float32Array(particleCount * 3)
  const colors = new Float32Array(particleCount * 3)

  const colorVein = new THREE.Color('#3A5A48')
  const colorMid = new THREE.Color('#7DA48D')
  const colorEdge = new THREE.Color('#EAF2EC')
  const leafLength = 45
  const leafMaxWidth = 18

  for (let i = 0; i < particleCount; i++) {
    const u = Math.random()
    const v = (Math.random() - 0.5) * 2
    const widthFactor = Math.sin(u * Math.PI) * (1 - Math.pow(u, 2.5))

    let px = v * leafMaxWidth * widthFactor
    let py = u * leafLength - leafLength * 0.4
    let pz = Math.abs(v) * 6 - Math.sin(u * Math.PI * 1.5) * 5
    px += Math.sin(u * Math.PI) * 8

    const noise = 0.2
    px += (Math.random() - 0.5) * noise
    py += (Math.random() - 0.5) * noise
    pz += (Math.random() - 0.5) * noise

    positions[i * 3] = px
    positions[i * 3 + 1] = py
    positions[i * 3 + 2] = pz

    const c = new THREE.Color()
    const absV = Math.abs(v)
    if (absV < 0.2) c.copy(colorVein).lerp(colorMid, absV / 0.2)
    else c.copy(colorMid).lerp(colorEdge, Math.pow((absV - 0.2) / 0.8, 1.5))
    c.multiplyScalar(0.7 + u * 0.3)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b

    velocities.push({ x: 0, y: 0, z: 0 })
  }

  const leafGeo = new THREE.BufferGeometry()
  leafGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  leafGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const leafMat = new THREE.PointsMaterial({
    size: 1.1,
    vertexColors: true,
    map: texture ?? undefined,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })

  const leaf = new THREE.Points(leafGeo, leafMat)
  leaf.rotation.z = -Math.PI * 0.15
  leaf.rotation.y = Math.PI * 0.1
  leaf.rotation.x = Math.PI * 0.05
  leafGroup.add(leaf)
  leafGroup.position.x = -12
  scene.add(leafGroup)

  const dustGeo = new THREE.BufferGeometry()
  const dustPos = new Float32Array(150 * 3)
  for (let i = 0; i < 150 * 3; i++) dustPos[i] = (Math.random() - 0.5) * 120
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dustMat = new THREE.PointsMaterial({
    size: 1.8,
    color: 0xffffff,
    map: texture ?? undefined,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  })
  const dustParticles = new THREE.Points(dustGeo, dustMat)
  scene.add(dustParticles)

  let targetCameraX = 0
  let targetCameraY = 5
  let isBursting = false
  let raf = 0

  const onMouseMove = (event: MouseEvent) => {
    if (isBursting) return
    const mouseX = (event.clientX / window.innerWidth) * 2 - 1
    const mouseY = -(event.clientY / window.innerHeight) * 2 + 1
    targetCameraX = mouseX * 8
    targetCameraY = 5 + mouseY * 8
  }

  const onResize = () => {
    const cw = container.clientWidth || window.innerWidth
    const ch = container.clientHeight || window.innerHeight
    camera.aspect = cw / ch
    camera.updateProjectionMatrix()
    renderer.setSize(cw, ch)
    if (!isBursting) leafGroup.position.x = -12
  }

  document.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', onResize)

  const animate = () => {
    raf = window.requestAnimationFrame(animate)
    const time = Date.now() * 0.001

    if (!isBursting) {
      const scale = 1 + Math.sin(time * 1.5) * 0.015
      leafGroup.scale.set(scale, scale, scale)
      leafGroup.position.y = Math.sin(time * 0.8) * 1.5
      camera.position.x += (targetCameraX - camera.position.x) * 0.03
      camera.position.y += (targetCameraY - camera.position.y) * 0.03
      camera.lookAt(0, 0, 0)
      dustParticles.rotation.y = time * 0.05
      dustParticles.position.y = Math.sin(time * 0.5) * 2
    } else {
      const fPos = leafGeo.attributes.position.array as Float32Array
      for (let i = 0; i < particleCount; i++) {
        const v = velocities[i]
        const px = fPos[i * 3]
        const pz = fPos[i * 3 + 2]
        const angle = Math.atan2(pz, px)
        const radius = Math.sqrt(px * px + pz * pz)
        v.x += -Math.sin(angle) * 0.5
        v.z += Math.cos(angle) * 0.5
        v.x += (px / (radius || 1)) * 0.15
        v.z += (pz / (radius || 1)) * 0.15
        v.y += 0.2 + Math.random() * 0.1
        fPos[i * 3] += v.x
        fPos[i * 3 + 1] += v.y
        fPos[i * 3 + 2] += v.z
        v.x *= 0.96
        v.y *= 0.96
        v.z *= 0.96
      }
      leafGeo.attributes.position.needsUpdate = true
      dustParticles.position.y += 0.2
      dustParticles.rotation.y += 0.02
      if (leafMat.opacity > 0) {
        leafMat.opacity -= 0.005
        dustMat.opacity -= 0.005
      }
    }
    renderer.render(scene, camera)
  }
  animate()

  const burst = () => {
    if (isBursting) return
    leafGroup.updateMatrixWorld()
    leafGeo.applyMatrix4(leafGroup.matrixWorld)
    leafGroup.position.set(0, 0, 0)
    leafGroup.rotation.set(0, 0, 0)
    leafGroup.scale.set(1, 1, 1)
    isBursting = true
  }

  const dispose = () => {
    window.cancelAnimationFrame(raf)
    document.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('resize', onResize)
    try {
      renderer.dispose()
      leafGeo.dispose()
      leafMat.dispose()
      dustGeo.dispose()
      dustMat.dispose()
      texture?.dispose()
    } catch (_) {}
    try {
      renderer.domElement?.parentElement?.removeChild(renderer.domElement)
    } catch (_) {}
  }

  return { burst, dispose }
}

onMounted(() => {
  if (window.WebGLRenderingContext && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    threeCtx = initThree()
  }
})
onBeforeUnmount(() => {
  threeCtx?.dispose()
  threeCtx = null
})
</script>

<style scoped>
#login-root {
  --bg-start: #e9f0ea;
  --bg-end: #f7f9f5;
  --text-main: #24382e;
  --text-sub: #66796f;
  --accent-color: #527a63;
  --accent-hover: #3f6651;
  --border-color: #d5e0d8;
  --input-bg: #fbfcf9;
  position: relative;
  isolation: isolate;
  width: 100%;
  min-height: 100dvh;
  overflow: hidden;
  background:
    radial-gradient(circle at 13% 12%, rgba(82, 122, 99, 0.1), transparent 34%),
    linear-gradient(125deg, var(--bg-start) 0%, var(--bg-end) 68%);
  color: var(--text-main);
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(420px, 0.92fr);
}

#login-root::after {
  position: absolute;
  z-index: -1;
  right: -8vw;
  bottom: -24vw;
  width: 46vw;
  height: 46vw;
  border: 1px solid rgba(82, 122, 99, 0.1);
  border-radius: 48% 52% 48% 52%;
  content: '';
  transform: rotate(-18deg);
}

#canvas-container {
  position: relative;
  width: 100%;
  min-height: 100dvh;
  z-index: 0;
  grid-column: 1;
}

.ui-container {
  position: relative;
  z-index: 10;
  display: flex;
  width: 100%;
  min-height: 100dvh;
  align-items: center;
  justify-content: flex-start;
  padding: clamp(28px, 5vw, 72px);
  animation: fadeInUI 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  grid-column: 2;
  overflow-y: auto;
}

.ui-container * {
  pointer-events: auto;
}

@keyframes fadeInUI {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-card {
  width: min(420px, 100%);
  max-width: calc(100vw - 48px);
  padding: clamp(30px, 4vw, 46px);
  border: 1px solid rgba(82, 122, 99, 0.18);
  border-radius: 20px;
  background: rgba(255, 253, 248, 0.94);
  box-shadow: 0 26px 70px rgba(36, 56, 46, 0.12);
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.header {
  margin-bottom: 28px;
}

.title {
  margin: 0 0 9px;
  color: var(--text-main);
  font-size: clamp(27px, 3vw, 34px);
  font-weight: 720;
  letter-spacing: -0.035em;
  line-height: 1.2;
}

.subtitle {
  margin: 0;
  color: var(--text-sub);
  font-size: 13.5px;
  line-height: 1.75;
}

.auth-toggle {
  position: relative;
  display: flex;
  padding: 4px;
  margin-bottom: 26px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: #edf3ee;
}

.toggle-btn {
  position: relative;
  z-index: 2;
  flex: 1;
  border-radius: 9px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  font-size: 14px;
  font-weight: 650;
  padding: 10px 0;
  text-align: center;
  transition: color 0.2s ease;
  user-select: none;
}

.toggle-btn.active {
  color: var(--text-main);
}

.toggle-slider {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 1;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  border: 1px solid rgba(82, 122, 99, 0.1);
  border-radius: 9px;
  background: #fffdf8;
  box-shadow: 0 4px 12px rgba(36, 56, 46, 0.08);
  transition: transform 0.3s cubic-bezier(0.2, 0.7, 0.2, 1);
}

.auth-toggle.register-mode .toggle-slider {
  transform: translateX(100%);
}

.input-group {
  margin-bottom: 19px;
}

.input-group label {
  display: block;
  margin-bottom: 8px;
  color: #354d40;
  font-size: 13px;
  font-weight: 650;
}

.input-group input {
  width: 100%;
  padding: 14px 15px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  outline: none;
  background: var(--input-bg);
  color: var(--text-main);
  font-size: 14.5px;
  line-height: 1.4;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
  appearance: none;
}

.input-group input:hover {
  border-color: #bdcec2;
}

.input-group input:focus-visible {
  outline: none;
  border-color: var(--accent-color);
  background: #fffefb;
  box-shadow: 0 0 0 3px rgba(82, 122, 99, 0.14);
}

.input-group input::placeholder {
  color: #7b8d83;
  opacity: 1;
}

.submit-btn {
  width: 100%;
  min-height: 50px;
  padding: 13px 18px;
  margin-top: 5px;
  border-radius: 14px;
  background: var(--accent-color);
  box-shadow: 0 10px 22px rgba(63, 102, 81, 0.2);
  color: #fffdf8;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.06em;
  transition: background-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.submit-btn:hover:enabled {
  background: var(--accent-hover);
  box-shadow: 0 13px 28px rgba(63, 102, 81, 0.25);
  transform: translateY(-1px);
}

.submit-btn:active:enabled {
  transform: translateY(1px);
}

.submit-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.login-card.fade-out {
  opacity: 0;
  transform: scale(0.96) translateY(-8px);
  pointer-events: none;
}

.welcome-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: linear-gradient(125deg, var(--bg-start), var(--bg-end));
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.5s ease;
}

.welcome-overlay.show {
  opacity: 1;
  pointer-events: auto;
}

.welcome-text {
  color: var(--text-main);
  font-size: 20px;
  font-weight: 500;
  letter-spacing: 0.16em;
}

.error {
  padding: 10px 12px;
  margin-top: 12px;
  border: 1px solid rgba(165, 61, 53, 0.2);
  border-radius: 10px;
  background: rgba(165, 61, 53, 0.06);
  color: #8f352f;
  font-size: 13px;
  line-height: 1.55;
}

@media (max-width: 1024px) {
  #login-root {
    grid-template-columns: minmax(0, 0.82fr) minmax(390px, 1fr);
  }

  .ui-container {
    padding: 28px;
  }
}

@media (max-width: 768px) {
  #login-root {
    min-height: 100dvh;
    grid-template-columns: 1fr;
    grid-template-rows: minmax(180px, 30dvh) 1fr;
    overflow-y: auto;
  }

  #canvas-container {
    min-height: 30dvh;
    grid-row: 1;
    grid-column: 1;
  }

  .ui-container {
    min-height: auto;
    padding: 0 20px 32px;
    grid-row: 2;
    grid-column: 1;
    align-items: flex-start;
    justify-content: center;
  }

  .login-card {
    width: min(440px, 100%);
    max-width: none;
    padding: 30px 26px;
    margin-top: -22px;
  }
}

@media (max-width: 480px) {
  #login-root {
    grid-template-rows: minmax(150px, 25dvh) 1fr;
  }

  #canvas-container {
    min-height: 25dvh;
  }

  .ui-container {
    padding: 0 14px 24px;
  }

  .login-card {
    padding: 25px 20px;
  }

  .title {
    font-size: 27px;
  }

  .input-group {
    margin-bottom: 16px;
  }
}

@media (max-height: 520px) and (orientation: landscape) {
  #login-root {
    grid-template-columns: minmax(260px, 0.8fr) minmax(390px, 1fr);
    grid-template-rows: 1fr;
    overflow: hidden;
  }

  #canvas-container {
    min-height: 100dvh;
    grid-row: 1;
    grid-column: 1;
  }

  .ui-container {
    min-height: 100dvh;
    padding: 14px 20px;
    grid-row: 1;
    grid-column: 2;
    align-items: flex-start;
  }

  .login-card {
    padding: 22px 26px;
    margin: 0;
  }
}
</style>

