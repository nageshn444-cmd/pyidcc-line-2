$ErrorActionPreference = 'Stop'
$AgentHome = Join-Path $env:LOCALAPPDATA 'PYIDCC-RosterAgent'
$AgentScript = Join-Path $PSScriptRoot 'agent.ps1'
New-Item -ItemType Directory -Force -Path $AgentHome | Out-Null
if (-not (Test-Path $AgentScript)) { throw 'agent.ps1 not found.' }
$configPath = Join-Path $AgentHome 'config.json'
if (-not (Test-Path $configPath)) { Copy-Item (Join-Path $PSScriptRoot 'config.example.json') $configPath; Write-Host ('Created ' + $configPath + '. Edit agentToken, then run again.') -ForegroundColor Yellow; exit 0 }
$code = Get-Content -Raw $AgentScript
$marker = $code.LastIndexOf('while ($true)')
if ($marker -ge 0) { Invoke-Expression ($code.Substring(0,$marker) + "`nTry-Sync") } else { throw 'Agent loop marker not found.' }
