$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskComfy = Join-Path (Split-Path $taskRoot -Parent) 'Tools\ComfyUI'
$taskPython = Join-Path $taskComfy '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'ComfyUI runtime not installed. See docs/local-ai.md.' }
try { Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 2 | Out-Null }
catch { Start-Process (Get-Command ollama).Source -ArgumentList 'serve' -WindowStyle Hidden }
try {
  Invoke-RestMethod 'http://127.0.0.1:8188/system_stats' -TimeoutSec 2 | Out-Null
  Write-Output 'ComfyUI is already running.'
} catch {
  $taskProcess = Start-Process $taskPython -WorkingDirectory $taskComfy -WindowStyle Hidden -PassThru `
    -ArgumentList 'main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch --disable-api-nodes --reserve-vram 1.5' `
    -RedirectStandardOutput (Join-Path $taskComfy 'pawside-output.log') `
    -RedirectStandardError (Join-Path $taskComfy 'pawside-error.log')
  Write-Output "ComfyUI starting (PID $($taskProcess.Id)). It only listens on this PC."
}
