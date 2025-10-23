# HTTPulse 开发指南

## 缓存问题

在开发过程中，如果修改了代码（特别是i18n翻译文件）但重启后不生效，可能是缓存导致的。

### 解决方案

#### 方法1：使用 make dev（推荐）
```bash
make dev
```
该命令会自动清理缓存后再启动开发服务器。

#### 方法2：手动清理缓存
```bash
# Windows PowerShell
Remove-Item node_modules\.vite -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item .vite-cache -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue

# 或使用 npm 脚本
npm run clean
```

#### 方法3：使用带清理的开发命令
```bash
npm run dev:clean
```

### 常见缓存位置

- `node_modules/.vite` - Vite 默认缓存目录
- `.vite-cache` - 自定义缓存目录
- `dist` - 构建输出目录
- `src-tauri/target` - Rust 构建缓存

### 配置说明

#### Vite 配置 (vite.config.ts)
- 启用了 `usePolling: true` 强制监视文件变化
- 自定义缓存目录为 `.vite-cache`

#### Makefile
- `make dev` 命令会在启动前自动清理缓存

## 开发命令

### 启动开发服务器
```bash
# 仅前端（浏览器模式）
npm run dev

# 完整应用（Tauri）
make dev
# 或
cargo tauri dev
```

### 清理缓存
```bash
npm run clean
```

### 构建
```bash
make build
# 或
npm run build
cargo tauri build
```

### 代码格式化
```bash
npm run format
```

### 代码检查
```bash
npm run lint
```

## 注意事项

1. **修改 i18n 文件后**：建议使用 `make dev` 重启，确保翻译生效
2. **修改 Tauri 配置后**：需要完全重启开发服务器
3. **切换语言功能**：
   - 生产模式：会自动重启应用（3秒延迟）
   - 开发模式：可能需要手动重启（`relaunch` 在开发模式下不总是有效）
   - 如果自动重启失败，会显示错误提示，需要手动关闭并重新打开应用
4. **热重载限制**：某些文件（如配置文件、Rust代码）的修改需要手动重启

## 故障排查

### 翻译不生效
1. 检查 `src/i18n/*.ts` 文件是否正确保存
2. 清理缓存：`npm run clean`
3. 重启开发服务器：`make dev`

### 样式不更新
1. 清理 Vite 缓存
2. 检查浏览器缓存（Ctrl+Shift+R 强制刷新）

### Rust 编译错误
1. 清理 Rust 缓存：`make clean`
2. 重新构建：`make dev`
