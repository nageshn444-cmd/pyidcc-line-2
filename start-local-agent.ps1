# Antigravity Local Autocomplete Agent Launcher
# Auto-checks Ollama, starts local agent, prints status

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Antigravity Local Autocomplete Agent - Local Stack    " -ForegroundColor Green
Write-Host "  Zero-Cost AI: Gemini -> OpenRouter Free -> Ollama      " -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Check if Ollama is running ---
Write-Host "[1/3] Checking local Ollama daemon at http://localhost:11434..." -ForegroundColor DarkCyan
try {
    $ollamaStatus = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 -ErrorAction Stop
    $modelCount = $ollamaStatus.models.Count
    Write-Host "  [OK] Ollama is running - $modelCount model(s) installed" -ForegroundColor Green
    foreach ($m in $ollamaStatus.models) {
        Write-Host "       * $($m.name)" -ForegroundColor Gray
    }
}
catch {
    Write-Host "  [WARN] Ollama not reachable on localhost:11434. Attempting auto-start..." -ForegroundColor Yellow
    if (Get-Command "ollama" -ErrorAction SilentlyContinue) {
        Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 3
        Write-Host "  [OK] Ollama daemon started." -ForegroundColor Green
    }
    else {
        Write-Host "  [INFO] Ollama CLI not in PATH. Install from: https://ollama.com/download" -ForegroundColor DarkYellow
    }
}
Write-Host ""

# --- Step 2: Check if agent server port 5050 is occupied ---
Write-Host "[2/3] Checking local agent server on port 5050..." -ForegroundColor DarkCyan
try {
    $existingStatus = Invoke-RestMethod -Uri "http://localhost:5050/status" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "  [INFO] Local agent server is already ONLINE (uptime: $($existingStatus.uptimeSeconds)s)." -ForegroundColor Yellow
}
catch {
    Write-Host "  [OK] Port 5050 is free. Starting agent server..." -ForegroundColor Green
}
Write-Host ""

# --- Step 3: Launch Local Agent Server ---
Write-Host "[3/3] Launching Antigravity Local Autocomplete Agent..." -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  Endpoints:" -ForegroundColor White
Write-Host "   * Status:      http://localhost:5050/status" -ForegroundColor Cyan
Write-Host "   * Chat API:    POST http://localhost:5050/v1/chat/completions" -ForegroundColor Cyan
Write-Host "   * Complete:    POST http://localhost:5050/v1/completions" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Providers Cascade:" -ForegroundColor White
Write-Host "   * Tier 1: Gemini 2.0 Flash (Free API)" -ForegroundColor DarkGreen
Write-Host "   * Tier 2: OpenRouter Free Models" -ForegroundColor DarkYellow
Write-Host "   * Tier 3: Local Ollama (100% Offline)" -ForegroundColor DarkCyan
Write-Host "  [Press Ctrl+C to stop]" -ForegroundColor DarkGray
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Join-Path $PSScriptRoot "local-autocomplete-agent.cjs"
node $scriptPath
