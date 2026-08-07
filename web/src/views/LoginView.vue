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
          <div class="toggle-btn" :class="{ active: mode === 'login' }" @click="switchMode('login')">登录</div>
          <div class="toggle-btn" :class="{ active: mode === 'register' }" @click="switchMode('register')">注册</div>
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
    if (!res.ok) throw new Error(data?.message || '登录失败')

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
    error.value = e?.message || '登录失败'
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
  const particleCount = 35000
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
  threeCtx = initThree()
})
onBeforeUnmount(() => {
  threeCtx?.dispose()
  threeCtx = null
})
</script>

<style scoped>
/* 注意：scoped 样式里的 :root 不会生效，变量必须挂在 #login-root 上，否则颜色/边框会全部失效 */
#login-root {
  --bg-start: #ebf0ec;
  --bg-end: #f7faf8;
  --text-main: #4a5d52;
  --text-sub: #87998d;
  --accent-color: #7da48d;
  --accent-hover: #658a74;
  --border-color: rgba(74, 93, 82, 0.18);
  --input-bg: rgba(255, 255, 255, 0.92);
  position: relative;
  width: 100%;
  min-height: 100vh;
  overflow: hidden;
  background: linear-gradient(135deg, var(--bg-start) 0%, var(--bg-end) 100%);
  color: var(--text-main);
  font-family: 'PingFang SC', -apple-system, 'Helvetica Neue', Arial, sans-serif;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr;
}

/* 左半屏：叶片区域，不遮挡右侧卡片 */
#canvas-container {
  position: relative;
  width: 100%;
  min-height: 100vh;
  z-index: 0;
  grid-column: 1;
}

/* 右半屏：登录卡片，可滚动避免内容重叠 */
.ui-container {
  position: relative;
  z-index: 10;
  display: flex;
  width: 100%;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  animation: fadeInUI 1.2s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
  grid-column: 2;
  overflow-y: auto;
}
.ui-container * {
  pointer-events: auto;
}

@media (max-width: 768px) {
  #login-root {
    grid-template-columns: 1fr;
    grid-template-rows: 35vh 1fr;
  }
  #canvas-container {
    min-height: 35vh;
    grid-row: 1;
    grid-column: 1;
  }
  .ui-container {
    min-height: auto;
    padding: 20px;
    grid-row: 2;
    grid-column: 1;
  }
}

/* 平板/iPad 竖屏（769-1024px） */
@media (min-width: 769px) and (max-width: 1024px) {
  #login-root { grid-template-columns: 0.85fr 1fr; }
  .ui-container { padding: 20px; }
  .login-card { width: 340px; padding: 32px 32px 30px; }
}

/* 小平板/大手机（481-768px） */
@media (min-width: 481px) and (max-width: 768px) {
  .login-card { width: 100%; max-width: 420px; padding: 32px 28px; }
}

/* 手机（<=480px） */
@media (max-width: 480px) {
  #login-root { grid-template-rows: 28vh 1fr; }
  #canvas-container { min-height: 28vh; }
  .ui-container { padding: 16px; }
  .login-card { width: 100%; padding: 24px 20px; border-radius: 20px; }
  .title { font-size: 24px !important; letter-spacing: 1px !important; }
}

/* 横屏低高（手机横屏） */
@media (max-height: 480px) and (max-width: 900px) and (orientation: landscape) {
  #login-root { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; }
  #canvas-container { min-height: 100vh; grid-row: 1; grid-column: 1; }
  .ui-container { min-height: 100vh; grid-row: 1; grid-column: 2; padding: 14px; }
  .login-card { padding: 20px 26px; }
}

@keyframes fadeInUI {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.login-card {
  background-color: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  width: 380px;
  max-width: calc(100vw - 48px);
  padding: 40px 40px 36px;
  box-shadow: 0 30px 60px rgba(74, 93, 82, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.7);
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.header {
  margin-bottom: 30px;
}
.title {
  font-size: 30px;
  font-weight: 600;
  margin: 0 0 10px 0;
  letter-spacing: 2px;
  color: #3a4a41;
}
.subtitle {
  font-size: 14px;
  color: var(--text-sub);
  margin: 0;
  line-height: 1.8;
  letter-spacing: 0.5px;
}

.auth-toggle {
  display: flex;
  position: relative;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 20px;
  margin-bottom: 25px;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, 0.9);
}
.toggle-btn {
  flex: 1;
  text-align: center;
  padding: 12px 0;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  z-index: 2;
  transition: color 0.3s;
  color: var(--text-sub);
  user-select: none;
}
.toggle-btn.active {
  color: var(--text-main);
}
.toggle-slider {
  position: absolute;
  top: 5px;
  left: 5px;
  width: calc(50% - 5px);
  height: calc(100% - 10px);
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 2px 10px rgba(74, 93, 82, 0.1);
  transition: 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  z-index: 1;
}
.auth-toggle.register-mode .toggle-slider {
  transform: translateX(100%);
}

.input-group {
  margin-bottom: 22px;
}
.input-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 10px;
  letter-spacing: 1px;
}
.input-group input {
  width: 100%;
  padding: 16px 20px;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  box-sizing: border-box;
  font-size: 14px;
  color: #3a4a41;
  outline: none;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  -webkit-appearance: none;
  appearance: none;
}
.input-group input:focus {
  background-color: #fff;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 4px rgba(125, 164, 141, 0.2);
  transform: translateY(-2px);
}
.input-group input::placeholder {
  color: #8a9b92;
  opacity: 1;
}

.submit-btn {
  width: 100%;
  padding: 18px;
  margin-top: 10px;
  background-color: var(--accent-color);
  color: #ffffff;
  border: none;
  border-radius: 30px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 10px 25px rgba(125, 164, 141, 0.3);
}
.submit-btn:hover:enabled {
  background-color: var(--accent-hover);
  transform: translateY(-3px);
  box-shadow: 0 15px 35px rgba(125, 164, 141, 0.45);
}
.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.login-card.fade-out {
  opacity: 0;
  transform: scale(0.96) translateY(-8px);
  pointer-events: none;
}

/* 登录成功后的全屏过渡文案，与登录卡片完全分离，永不重叠 */
.welcome-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: linear-gradient(135deg, var(--bg-start) 0%, var(--bg-end) 100%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 1.5s ease;
}
.welcome-overlay.show {
  opacity: 1;
  pointer-events: auto;
}
.welcome-text {
  font-size: 22px;
  font-weight: 300;
  color: var(--text-main);
  letter-spacing: 6px;
}

.error {
  margin-top: 10px;
  color: #b42318;
  font-size: 13px;
}
</style>

