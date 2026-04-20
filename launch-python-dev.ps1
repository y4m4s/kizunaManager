$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonExe = Join-Path $root '.venv\Scripts\python.exe'
$mainScript = Join-Path $root 'main.py'
$logDir = Join-Path $root 'logs'
$logFile = Join-Path $logDir 'launch-python-dev.log'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host ''
Write-Host 'Starting Python desktop app...' -ForegroundColor Cyan
Write-Host "Python : $pythonExe"
Write-Host "Script : $mainScript"
Write-Host "Log    : $logFile"
Write-Host ''

if (-not (Test-Path -LiteralPath $pythonExe)) {
    Write-Host "Missing Python virtual environment: $pythonExe" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath $mainScript)) {
    Write-Host "Missing main.py: $mainScript" -ForegroundColor Red
    exit 1
}

try {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $pythonExe -u $mainScript --dev 2>&1 | Tee-Object -FilePath $logFile
    $exitCode = $LASTEXITCODE
}
catch {
    $_ | Tee-Object -FilePath $logFile -Append
    $exitCode = 1
}
finally {
    $ErrorActionPreference = $previousErrorActionPreference
}

Write-Host ''
if ($exitCode -eq 0) {
    Write-Host 'Python process finished.' -ForegroundColor Green
}
else {
    Write-Host "Python process exited with code $exitCode." -ForegroundColor Red
    Write-Host 'Check the log above or this file:' -ForegroundColor Yellow
    Write-Host $logFile
}

exit $exitCode
