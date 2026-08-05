# System-Wide Local AI Autocomplete Helper
# Usage:
#   powershell -File system-wide-hotkey.ps1 [-Prompt "text to complete"]
# If no prompt provided, reads text from Windows Clipboard, queries local agent, and copies completion to Clipboard.

param (
    [string]$Prompt = ""
)

if ([string]::IsNullOrWhiteSpace($Prompt)) {
    try {
        $Prompt = Get-Clipboard
    } catch {
        $Prompt = ""
    }
}

if ([string]::IsNullOrWhiteSpace($Prompt)) {
    Write-Host "Error: No prompt provided and clipboard is empty." -ForegroundColor Red
    exit 1
}

Write-Host "Querying Antigravity Local Autocomplete Agent..." -ForegroundColor Cyan

$body = @{
    prompt = $Prompt
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:5050/v1/completions" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 15
    $completion = $response.choices[0].text
    if ($completion) {
        Set-Clipboard -Value $completion
        Write-Host "================ Completion Received ================" -ForegroundColor Green
        Write-Host $completion -ForegroundColor White
        Write-Host "=====================================================" -ForegroundColor Green
        Write-Host "[OK] Copied completion to Clipboard! Paste (Ctrl+V) anywhere." -ForegroundColor Yellow
    } else {
        Write-Host "No completion returned from agent." -ForegroundColor Red
    }
} catch {
    Write-Host "Error calling local agent server: $_" -ForegroundColor Red
}
