@echo off
rem 双击即可：把当前分支推送到 origin（你的 GitHub 仓库）。
rem 首次推送会要求登录 —— GitHub 早就不收账号密码了，密码位置要填 Personal Access Token。
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   推送代码到 GitHub
echo ============================================
echo.
echo 目标仓库（origin）：
git remote get-url origin
echo.
echo 待推送分支：
git rev-parse --abbrev-ref HEAD
echo.
echo --------------------------------------------
echo ! 推送前请确认这个仓库是【私有】的 !
echo.
echo 仓库里含 132 张游戏截图、4 首商业发行 mp3（约 42MB）、21 个产品商标图标 ——
echo 它们都是 Cloudflare 构建必需的输入，拿不掉，而站点声明它们「仅站内使用」。
echo 推到公开仓库 = 公开再分发，且事后改可见性收不干净。
echo 设置路径：GitHub 仓库页 - Settings - General - Danger Zone - Change visibility
echo --------------------------------------------
echo.
choice /c YN /m "确认推送"
if errorlevel 2 (
  echo.
  echo 已取消，什么都没做。
  pause
  exit /b 0
)

echo.
git push -u origin HEAD
echo.
if errorlevel 1 (
  echo --------------------------------------------
  echo 推送失败。常见原因：
  echo   * 没登录 / 密码填成了账号密码：GitHub 要用 Personal Access Token
  echo     （GitHub - Settings - Developer settings - Personal access tokens）
  echo   * 仓库地址写错，或该仓库还不存在
  echo   * 网络/代理挡住了 github.com
  echo --------------------------------------------
) else (
  echo 推送完成。这个分支会成为仓库的默认分支；
  echo 在 Cloudflare Pages 建项目时，生产分支也设成它。
  echo 下一步见 docs\DEPLOY-CF.md。
)
echo.
pause
