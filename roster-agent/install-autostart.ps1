$ErrorActionPreference = 'Stop'
$AgentHome = Join-Path $env:LOCALAPPDATA 'PYIDCC-RosterAgent'
New-Item -ItemType Directory -Force -Path $AgentHome | Out-Null
$sourceAgent = Join-Path $PSScriptRoot 'agent.ps1'
$sourceConfig = Join-Path $PSScriptRoot 'config.json'
$exampleConfig = Join-Path $PSScriptRoot 'config.example.json'
if (-not (Test-Path $sourceAgent)) { throw 'agent.ps1 not found.' }
if (-not (Test-Path $sourceConfig)) { Copy-Item $exampleConfig $sourceConfig; Write-Host ('Created ' + $sourceConfig + '. Edit agentToken, then run this installer again.') -ForegroundColor Yellow; exit 0 }
Copy-Item $sourceAgent (Join-Path $AgentHome 'agent.ps1') -Force
Copy-Item $sourceConfig (Join-Path $AgentHome 'config.json') -Force
$taskName = 'PYIDCC GCC Roster Auto Deploy'
$ps = (Get-Command powershell.exe).Source
$agentPath = Join-Path $AgentHome 'agent.ps1'
schtasks.exe /Create /TN $taskName /TR ('"' + $ps + '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $agentPath + '"') /SC ONLOGON /RL LIMITED /F | Out-Null
Write-Host 'PYIDCC roster automation installed.' -ForegroundColor Green
Write-Host ('Task: ' + $taskName)
Write-Host ('State/log: ' + $AgentHome)
Write-Host ('Start now: schtasks.exe /Run /TN "' + $taskName + '"')
