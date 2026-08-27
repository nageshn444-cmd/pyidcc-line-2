<#
.SYNOPSIS
  Launch Claude Code CLI locally connected to all local and free models via the Antigravity Router (Zero Cost).
#>

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Starting Claude Code with Local & Free Multi-Model Router" -ForegroundColor Green
Write-Host " Base URL: http://localhost:5050" -ForegroundColor Yellow
Write-Host " Zero Cost Policy: $0.00 (Gemini Free + OpenRouter + Ollama)" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Clear conflicting Auth Token so it cleanly uses the Local Router API Key
Remove-Item env:ANTHROPIC_AUTH_TOKEN -ErrorAction SilentlyContinue
$env:ANTHROPIC_AUTH_TOKEN = $null

# 2. Set Local Router Environment Variables
$env:ANTHROPIC_BASE_URL = "http://localhost:5050"
$env:ANTHROPIC_API_KEY = "sk-ant-local-free-token"
$env:ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022"

# 3. Check if local router is running, if not start in background
try {
    $status = Invoke-RestMethod -Uri "http://localhost:5050/status" -TimeoutSec 2 -ErrorAction Stop
    Write-Host " Local Multi-Model Router is ONLINE on port 5050." -ForegroundColor Green
} catch {
    Write-Host " Starting local router on port 5050..." -ForegroundColor Yellow
    Start-Process -FilePath "node" -ArgumentList "local-autocomplete-agent.cjs" -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

# 4. Launch Claude Code CLI with all passed arguments
npx -y @anthropic-ai/claude-code --model "claude-3-5-sonnet-20241022" @args
