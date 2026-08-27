@echo off
title Claude Code (Local & Free Multi-Model Router)
echo ==========================================================
echo  Starting Claude Code with Local Multi-Model Router
echo  Endpoint: http://localhost:5050/v1
echo  Model: claude-3-5-sonnet-20241022 (Free Multi-Model Cascade)
echo ==========================================================

:: Clear conflicting token
set ANTHROPIC_AUTH_TOKEN=

:: Set Local Router URL, Key, and Model
set ANTHROPIC_BASE_URL=http://localhost:5050
set ANTHROPIC_API_KEY=sk-ant-local-free-token
set ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

if "%~1"=="" (
    npx -y @anthropic-ai/claude-code --model claude-3-5-sonnet-20241022
) else (
    npx -y @anthropic-ai/claude-code --model "%~1"
)
pause
