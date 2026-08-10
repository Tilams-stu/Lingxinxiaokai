# 聆心小开前端视觉优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在完全保留业务功能和前后端交互的前提下，将所有用户界面统一为简约、温暖、成熟的“林间静愈”视觉方案。

**Architecture:** Vue 页面继续使用现有单文件组件，以 `web/src/style.css` 提供全局设计变量和基础规则，各页面 scoped CSS 负责页面布局。两套传统聊天页面新增共享的纯 CSS 主题文件，并在原有内联样式后加载，以覆盖视觉而不触碰 JavaScript、DOM 标识符或请求逻辑。

**Tech Stack:** Vue 3、TypeScript 5、原生 CSS、Vite 8.1.5、传统 HTML/CSS、Three.js。

## Global Constraints

- 不修改 Vue Router 路径、路由守卫、API 地址、HTTP 方法、请求字段、Session、SSE 或错误处理。
- 不修改登录注册字段名称、顺序、校验、提交行为和成功过渡。
- 不修改聊天、历史记录、清空、导出、日记、情绪分析和冥想逻辑。
- 不修改后端 Python 代码、数据库结构与配置。
- 不在产品界面中使用项目 Logo，不新增第三方依赖、网络字体或插画资源。
- 主题固定为浅色，森林绿是唯一强调色；禁止脚手架紫色、过量毛玻璃和装饰性渐变。
- `DESIGN_VARIANCE: 5`、`MOTION_INTENSITY: 3`、`VISUAL_DENSITY: 4`。
- 保留所有现有 `id`、`data-*` 属性和 JavaScript 查询目标。

---

### Task 1: 建立 Vue 全局视觉基线并优化登录页

**Files:**
- Modify: `web/src/style.css`
- Modify: `web/src/views/LoginView.vue`

**Interfaces:**
- Consumes: 现有 Vue 根节点 `#app`、登录页 `#login-root` 和登录表单脚本。
- Produces: 全局 CSS 变量 `--lx-*`、统一基础焦点态，以及不改变模板与脚本契约的登录页样式。

- [ ] **Step 1: 记录行为边界基线**

Run:

```powershell
rg -n "'/api/auth/(login|register)'|credentials: 'include'|router.replace|id=\"auth-toggle\"|id=\"login-form\"" web/src/views/LoginView.vue
```

Expected: 登录、注册、Session 和路由跳转代码均存在，后续 diff 中这些行保持不变。

- [ ] **Step 2: 替换脚手架全局样式**

将 `web/src/style.css` 收敛为全局变量、字体栈、盒模型、页面底色、链接/按钮继承、`focus-visible` 和 `prefers-reduced-motion` 规则。变量使用以下固定值：

```css
:root {
  --lx-ink: #24382e;
  --lx-text: #52685c;
  --lx-muted: #7f9187;
  --lx-canvas: #f3f7f3;
  --lx-surface: #fffdf8;
  --lx-line: #dce6de;
  --lx-accent: #527a63;
  --lx-accent-strong: #3f6651;
  --lx-accent-soft: #e4eee7;
  --lx-danger: #a53d35;
}
```

- [ ] **Step 3: 优化登录页样式**

仅修改 `<style scoped>`：保持左右分栏和 Three.js 容器，降低背景泛白；将登录面板改为高可读的暖白实体面板；统一 20px 主容器圆角、14px 输入框圆角、10px 小组件圆角；补齐按钮、切换控件、输入框、错误信息和移动端的聚焦与禁用态；动画时长控制在 500ms 内，成功过渡原样保留。

- [ ] **Step 4: 检查行为代码未变化**

Run:

```powershell
git diff --word-diff=porcelain -- web/src/views/LoginView.vue | Select-String "api/auth|credentials|router.replace|JSON.stringify|switchMode"
```

Expected: 没有这些行为关键字的新增或删除。

- [ ] **Step 5: 运行 TypeScript 检查**

Run:

```powershell
cd web
npx.cmd tsc --noEmit
```

Expected: exit code 0。

### Task 2: 优化 Vue 首页与管理页

**Files:**
- Modify: `web/src/views/HomeView.vue`
- Modify: `web/src/views/AdminView.vue`

**Interfaces:**
- Consumes: 首页的 `/info`、`/companion`、`/admin` 链接、`isAdmin` 条件和 `logout()`；管理页的 `doExport()`。
- Produces: 统一的欢迎区、服务入口和后台操作界面，原有链接与事件保持不变。

- [ ] **Step 1: 记录导航和事件基线**

Run:

```powershell
rg -n "href=\"/(info|companion|admin|home)\"|@click=\"logout\"|@click=\"doExport\"|v-if=\"isAdmin\"" web/src/views/HomeView.vue web/src/views/AdminView.vue
```

Expected: 所有目标链接、管理员条件和点击事件均存在。

- [ ] **Step 2: 调整首页视觉结构**

允许增加纯展示容器与 `aria-hidden` 装饰，但保留所有链接和事件。将窄列表升级为最大宽度约 1040px 的欢迎区与双入口响应式网格；桌面双列、移动端单列；使用 CSS 叶脉形状作为低对比背景；管理入口使用较低视觉权重。

- [ ] **Step 3: 统一管理页**

保持单一导出卡片和按钮，将页头、内容宽度、边框、圆角、字体和按钮状态统一到 Vue 全局变量，不增加统计卡或虚构数据。

- [ ] **Step 4: 核对链接和事件未变化**

Run:

```powershell
git diff --word-diff=porcelain -- web/src/views/HomeView.vue web/src/views/AdminView.vue | Select-String "href=|@click=|isAdmin|fetch\("
```

Expected: 仅允许新增展示类名或可访问性属性，不允许链接目标、事件名称、权限条件或请求逻辑变化。

- [ ] **Step 5: 运行 TypeScript 检查**

Run:

```powershell
cd web
npx.cmd tsc --noEmit
```

Expected: exit code 0。

### Task 3: 为两套传统聊天页面应用共享视觉主题

**Files:**
- Create: `templates/assets/chat-theme.css`
- Modify: `templates/index（心理科普）.html`
- Modify: `templates/index（心理陪伴）.html`

**Interfaces:**
- Consumes: 两页现有 `.sidebar`、`.nav-item`、`.top-header`、`.welcome-card`、`.msg-*`、`.input-*`、`.modal-*` 选择器。
- Produces: 一个只包含样式覆盖的共享主题；HTML 只新增同一个 `<link rel="stylesheet" href="/assets/chat-theme.css">`。

- [ ] **Step 1: 记录页面交互标识符基线**

Run:

```powershell
rg -n "id=\"(sidebar|chat|chatInner|input|send|btnClearChat|btnLogout|modal|menuToggle)|data-(view|action|close|q)=" templates/index（心理科普）.html templates/index（心理陪伴）.html
```

Expected: 两页现有标识符可被记录，后续不删除或改名。

- [ ] **Step 2: 创建共享主题 CSS**

覆盖全局变量、侧边栏、导航、页头、欢迎区、消息气泡、输入区、滚动按钮、模态框、日记输入、主按钮和移动端布局。使用暖白实体表面、1px 灰绿边框和低强度阴影；取消消息气泡 hover 位移；保留 `msgIn`、typing 和冥想等状态动画，并增加统一的 `prefers-reduced-motion` 降级。

- [ ] **Step 3: 在两页加载主题**

将以下标签放在各自内联 `<style>` 结束之后、`</head>` 之前，确保只覆盖视觉：

```html
<link rel="stylesheet" href="/assets/chat-theme.css">
```

- [ ] **Step 4: 核对 HTML 仅新增样式引用**

Run:

```powershell
git diff -- templates/index（心理科普）.html templates/index（心理陪伴）.html
```

Expected: 两个 HTML 文件各仅新增一行共享样式引用，不出现脚本、`id`、`data-*` 或请求代码变化。

- [ ] **Step 5: 静态检查主题约束**

Run:

```powershell
rg -n "#aa3bff|#c084fc|linear-gradient\([^;]*(#[0-9a-fA-F]{6}).*(#[0-9a-fA-F]{6})|transition:\s*all" web/src templates/assets/chat-theme.css
```

Expected: 新增样式中没有紫色默认主题、装饰性双色按钮渐变或 `transition: all`。

### Task 4: 构建、回归与启动服务

**Files:**
- Regenerate: `templates/dist/**`
- Verify: `tests/**`

**Interfaces:**
- Consumes: Vue 源码、传统页面、Flask 静态路由和现有测试。
- Produces: 可部署构建产物和本地可访问的前后端服务。

- [ ] **Step 1: 执行前端检查与构建**

Run:

```powershell
cd web
npx.cmd tsc --noEmit
npx.cmd --yes vite@8.1.5 build
npm.cmd audit --audit-level=high
```

Expected: TypeScript 与构建 exit code 0，audit 为 0 high/critical；`templates/dist` 更新。

- [ ] **Step 2: 执行后端回归测试**

Run:

```powershell
templates\.venv\Scripts\python.exe -m pytest -q
```

Expected: 全部测试通过。

- [ ] **Step 3: 检查变更范围**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: 仅出现计划中的 Vue 视觉文件、共享主题、两个 HTML 样式引用、构建产物和本计划文档。

- [ ] **Step 4: 浏览器冒烟测试**

在 1280px 桌面视口和 390px 移动视口检查 `/login`；登录后检查 `/home`、`/info`、`/companion`，管理员账号额外检查 `/admin`。确认登录注册切换、入口链接、聊天输入与发送、侧边栏、弹窗和管理导出按钮仍可操作；检查控制台无新增错误。

- [ ] **Step 5: 启动后端与前端开发服务**

在启动前检查 5000 和 5173 端口，复用属于当前项目且健康的进程；需要新进程时使用隐藏窗口启动。最终验证：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5000/api/health
Invoke-WebRequest -UseBasicParsing http://localhost:5173/login
```

Expected: 两个请求均返回 HTTP 200，并向用户提供访问地址。
