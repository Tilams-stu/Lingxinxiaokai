# 数据库、备份与迁移

## 文件位置与连接设置

默认数据库是 `templates/data/chat.db`，可用 `CHAT_DB_PATH` 覆盖。`templates/data` 被 Git 忽略，不得提交正式数据或备份。

每个 SQLite 连接启用：

- `PRAGMA foreign_keys = ON`
- `PRAGMA journal_mode = WAL`
- `PRAGMA busy_timeout = 5000`

当前架构适合单机、低并发部署。Gunicorn 默认只启用一个 worker，避免多进程下 SQLite 和内存限流状态不一致。

## 表结构

### `users`

| 字段 | 说明 |
| --- | --- |
| `id` | 自增主键 |
| `username` | 唯一称呼 |
| `password_hash` | Werkzeug 密码哈希，不可反解 |
| `student_id` | 学号，唯一索引 |
| `is_admin` | 0 普通用户，1 管理员 |
| `created_at` | 创建时间 |
| `last_login` | 最近登录时间，可为空 |

### `chat_messages`

| 字段 | 说明 |
| --- | --- |
| `id` | 自增主键 |
| `user_id` | 外键指向 `users.id`，删除用户时级联删除消息 |
| `role` | 只能是 `user` 或 `assistant` |
| `content` | 消息纯文本 |
| `session_id` | 页面生成的会话标识 |
| `created_at` | UTC ISO 时间或旧数据的 SQLite 时间 |

索引：

- `uq_users_student_id(student_id)`：学号唯一。
- `ix_chat_user_session_time(user_id, session_id, created_at)`：会话恢复和删除。
- `ix_chat_user_time(user_id, created_at)`：用户历史查询。

## 初始化和迁移

应用每次启动都会执行幂等的 `init_db`：创建缺少的表/字段/索引，不删除聊天正文，也不会自动合并账户。

旧库在创建学号唯一索引前会检查重复学号。发现重复时启动立即终止，错误信息为“数据库迁移已停止”。此时必须使用备份人工确认账户归属；禁止通过删除任意账户或覆盖学号来强行继续。

## 备份

首次升级和每次发布前都应备份。最稳妥的离线方式：

1. 停止 Flask/Gunicorn，确认没有写入。
2. 创建仓库外的受控备份目录。
3. 复制数据库并记录时间、应用版本和操作者。

```powershell
$backupDir = 'D:\LingxinBackups'
New-Item -ItemType Directory -Force -Path $backupDir
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath 'templates\data\chat.db' -Destination "$backupDir\chat-$stamp.db"
```

如必须在线备份，应使用 SQLite 官方 `.backup` 命令而不是只复制主文件，因为 WAL 模式可能仍有未合并数据：

```powershell
sqlite3 templates\data\chat.db ".backup 'D:/LingxinBackups/chat-online.db'"
```

备份中含学号和聊天正文，访问级别应与正式数据库相同。

## 恢复

1. 停止服务。
2. 先把当前数据库保留为故障现场副本，不要直接覆盖唯一副本。
3. 将选定备份复制为 `templates/data/chat.db`。
4. 启动服务并检查迁移输出、`/api/health`、登录和聊天历史。

恢复前后都不要手工修改密码哈希或消息正文。需要处理重复学号时，先复制数据库到隔离环境，记录每项人工调整，再用完整测试验证。
