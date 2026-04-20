$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $root 'frontend'
$pythonLauncher = Join-Path $root 'launch-python-dev.ps1'
$devServerUrl = 'http://127.0.0.1:5173'

function Test-DevServerReady {
    try {
        Invoke-WebRequest -Uri $devServerUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $root '.venv\Scripts\python.exe'))) {
    Write-Host ''
    Write-Host "Missing Python virtual environment: $(Join-Path $root '.venv\Scripts\python.exe')" -ForegroundColor Red
    Write-Host 'Create .venv and install dependencies first.'
    exit 1
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Write-Host ''
    Write-Host 'npm.cmd was not found. Install Node.js and npm first.' -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath $frontendDir)) {
    Write-Host ''
    Write-Host "Missing frontend directory: $frontendDir" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath $pythonLauncher)) {
    Write-Host ''
    Write-Host "Missing Python launcher script: $pythonLauncher" -ForegroundColor Red
    exit 1
}

if (-not (Test-DevServerReady)) {
    Start-Process -FilePath 'powershell.exe' -WorkingDirectory $frontendDir -ArgumentList @(
        '-NoExit',
        '-ExecutionPolicy', 'Bypass',
        '-Command', 'npm run dev'
    ) | Out-Null

    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 500
        if (Test-DevServerReady) {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        Write-Host ''
        Write-Host 'The Vite dev server did not become ready within 30 seconds.' -ForegroundColor Red
        Write-Host 'Check the npm run dev window for errors.'
        exit 1
    }
}

$escapedPythonLauncher = $pythonLauncher.Replace("'", "''")

Start-Process -FilePath 'powershell.exe' -WorkingDirectory $root -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command', "& '$escapedPythonLauncher'"
) | Out-Null

exit 0

