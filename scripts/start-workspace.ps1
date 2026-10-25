param(
  [ValidateSet('all', 'backend', 'app', 'admin')][string]$Role = 'all',
  [string]$BackendDirectory,
  [string]$AdminDirectory
)
$ErrorActionPreference = 'Stop'
$appDirectory = Split-Path $PSScriptRoot -Parent
$workspaceDirectory = Split-Path $appDirectory -Parent
function Find-ProjectDirectory([string]$ExplicitPath, [string[]]$Names) {
  if ($ExplicitPath) { return (Resolve-Path -LiteralPath $ExplicitPath).Path }
  foreach ($name in $Names) {
    $candidate = Join-Path $workspaceDirectory $name
    if (Test-Path -LiteralPath $candidate -PathType Container) { return (Resolve-Path -LiteralPath $candidate).Path }
  }
  throw "缺少关联仓库，请将 $($Names[0]) clone 到同一父目录，或传入目录参数。"
}
if ($Role -in @('all', 'backend')) {
  $BackendDirectory = Find-ProjectDirectory $BackendDirectory @('food-delivery-backend', 'RuoYi-Vue')
  . (Join-Path $BackendDirectory 'scripts/load-local-config.ps1')
}
if ($Role -in @('all', 'admin')) {
  $AdminDirectory = Find-ProjectDirectory $AdminDirectory @('food-delivery-admin', 'RuoYi-Vue3')
}
switch ($Role) {
  'backend' { & (Join-Path $BackendDirectory 'scripts/start-backend.ps1'); exit }
  'app' {
    Set-Location -LiteralPath $appDirectory
    if (!(Test-Path -LiteralPath node_modules)) { & npm ci; if ($LASTEXITCODE -ne 0) { throw '应用依赖安装失败' } }
    & npm run dev:h5
    exit $LASTEXITCODE
  }
  'admin' {
    Set-Location -LiteralPath $AdminDirectory
    if (!(Test-Path -LiteralPath .env.development)) { Copy-Item -LiteralPath .env.development.example -Destination .env.development }
    if (!(Test-Path -LiteralPath node_modules)) { & npm ci; if ($LASTEXITCODE -ne 0) { throw '管理后台依赖安装失败' } }
    & npm run dev -- --host 127.0.0.1 --port 54142
    exit $LASTEXITCODE
  }
}
$backendPort = if ($env:FOOD_PORT) { [int]$env:FOOD_PORT } else { 8086 }
$env:FOOD_BACKEND = "http://127.0.0.1:$backendPort"
$logDirectory = Join-Path $appDirectory '.logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$entries = @(@{ name = 'backend'; port = $backendPort }, @{ name = 'app'; port = 54141 }, @{ name = 'admin'; port = 54142 })
foreach ($entry in $entries) {
  if (Get-NetTCPConnection -LocalPort $entry.port -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "$($entry.name) 端口 $($entry.port) 已被占用，跳过启动，请确认是本项目服务。"
    continue
  }
  $arguments = @('-NoProfile', '-File', ('"' + $PSCommandPath + '"'), '-Role', $entry.name, '-BackendDirectory', ('"' + $BackendDirectory + '"'), '-AdminDirectory', ('"' + $AdminDirectory + '"'))
  $process = Start-Process -FilePath pwsh -ArgumentList $arguments -WorkingDirectory $appDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory ($entry.name + '.log')) -RedirectStandardError (Join-Path $logDirectory ($entry.name + '.err.log'))
  Write-Host "已启动 $($entry.name)，PID $($process.Id)；构建和启动状态见 .logs。"
}
Write-Host '应用入口：http://127.0.0.1:54141/；平台入口：http://127.0.0.1:54142/food'
