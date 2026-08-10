# Scripts

项目级脚本统一放在这里。脚本只检查配置并启动服务，不会自动安装依赖或修改数据。

| 脚本 | 用途 |
| --- | --- |
| `start-backend.bat` | 从任意当前目录启动 `templates/server.py`；要求已经存在 `templates/.venv` 和 `templates/.env`。 |

旧命令 `templates\start_venv_server.bat` 仍可使用，它只负责转发到这里的规范入口。
