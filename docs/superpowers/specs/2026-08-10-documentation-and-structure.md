# 文档与目录规范化设计

## 背景

当前版本已经完成后端安全与权限整改，但交接信息分散在根目录 README、少量英文运维文档和源码中；测试、历史图片与启动脚本也分布在运行目录内。后续维护者难以快速区分“运行时文件、源码、测试、构建产物和历史素材”。

## 目标

- 以当前可运行版本为唯一事实来源，补齐架构、开发、API、数据库、部署、安全、排障和交接说明。
- 保留 Flask 入口、Vue 工程和两个传统页面的现有运行关系，不重构后端包或改变业务行为。
- 将测试、启动脚本和未引用的历史素材归入职责明确的目录。
- 保留 `templates/start_venv_server.bat` 兼容入口，避免已有使用习惯失效。
- 用自动化检查确认目录移动没有破坏导入、路由、构建或安全基线。

## 目标目录

```text
Lingxinxiaokai/
├─ README.md                     # 项目入口和最短启动路径
├─ pytest.ini                    # 后端测试发现与导入路径
├─ configs/                      # 生产服务配置
├─ scripts/                      # 项目级启动脚本
├─ tests/backend/                # Flask 回归测试
├─ templates/                    # Flask 源码、传统页面、共享资源、Vue 构建产物
│  ├─ app.py
│  ├─ ai_service.py
│  ├─ db.py
│  ├─ server.py
│  ├─ assets/
│  └─ dist/
├─ web/                          # Vue/Vite 源码工程
├─ docs/                         # 面向开发、运维和使用者的文档
└─ artifacts/legacy-assets/      # 不参与运行的历史素材
```

## 关键决策

1. 不把 `templates` 改名为 `backend`，也不调整 `app.py`、`db.py` 等模块的 import 方式。这能避免 WSGI、Flask CLI、Windows 启动脚本和现有部署配置同时变更。
2. 将测试移到根目录 `tests/backend`，使用 `pytest.ini` 声明 `templates` 为 Python 导入路径，去掉测试文件内的 `sys.path` 修改。
3. `templates/assets/chat-api.js` 是传统页面仍在使用的运行资源，保持原位；没有任何源码引用的旧头像、模型示意图和截图移入 `artifacts/legacy-assets`。
4. 项目级启动脚本放到 `scripts`。旧入口保留为转发脚本，确保 `templates\start_venv_server.bat` 继续可用。
5. `templates/dist` 是提交到仓库的部署产物，`web` 是其唯一源码来源；交接文档明确禁止直接编辑 `dist`。
6. `docs/reference/system-prompt.txt` 与当前服务端提示词不一致，替换为引用真实源码位置的说明，避免维护者误改无效文件。

## 验收

- `pytest` 能从根目录发现并通过全部后端测试。
- TypeScript 类型检查和 Vite 构建通过，构建结果仍输出到 `templates/dist`。
- `npm audit` 无 high/critical 漏洞。
- 文档内部相对链接有效，文档中的命令与实际路径一致。
- 源码中不存在对已移动历史素材或旧测试目录的引用。
- 密钥、密码、聊天正文、真实测试账户和数据库文件未进入仓库。
