@echo off
rem 双击即可：构建整个站点（博客 + /lab/）→ 起本地静态预览 → 自动打开浏览器。
rem 预览的是真实产物 dist/（含 404、_redirects、搜索索引），与线上一致。
rem 与「启动终端.cmd」的区别：那个只起 /lab/ 的 Vite dev，看不了博客页。
chcp 65001 >nul
cd /d "%~dp0"

if not exist node_modules (
  echo 首次运行，正在安装依赖（npm ci）...
  call npm ci
  if errorlevel 1 (
    echo.
    echo 依赖安装失败。
    pause
    exit /b 1
  )
)

echo 正在构建站点（check:content -^> check:features -^> 博客 -^> lab -^> 重定向 -^> 搜索 -^> check:site）...
call npm run build
if errorlevel 1 (
  echo.
  echo 构建失败，预览未启动。上面的日志能看到是哪一步红了。
  pause
  exit /b 1
)

echo.
echo 构建完成，正在启动本地预览并打开浏览器...
echo 关闭本窗口（或按 Ctrl+C）即可停止预览。
call npm run preview -- --open

pause
