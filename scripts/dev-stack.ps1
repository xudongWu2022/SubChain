param(
  [int]$WebPort = 3000,
  [switch]$NoWeb,
  [switch]$NoIndexer,
  [switch]$KeepAnvil
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$devDir = Join-Path $root ".dev"
$indexerLog = Join-Path $devDir "indexer.log"
$indexerErrorLog = Join-Path $devDir "indexer.err.log"
$anvilPidPath = Join-Path $devDir "anvil.pid"
$indexerProcess = $null
$anvilProcessId = $null

function Stop-ChildProcess {
  param($Process, [string]$Name)

  if ($Process -and -not $Process.HasExited) {
    Write-Host ""
    Write-Host "==> Stopping $Name"
    Stop-Process -Id $Process.Id
  }
}

try {
  Set-Location $root
  New-Item -ItemType Directory -Force $devDir | Out-Null

  Write-Host "==> Preparing local database"
  & (Join-Path $PSScriptRoot "db-local.ps1")

  & (Join-Path $PSScriptRoot "dev-local.ps1") -NoWeb -KeepAnvil

  if (Test-Path $anvilPidPath) {
    $anvilProcessId = [int](Get-Content $anvilPidPath | Select-Object -First 1)
  }

  if (-not $NoIndexer) {
    Write-Host "==> Starting indexer"
    $indexerProcess = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev:indexer") -WorkingDirectory $root -RedirectStandardOutput $indexerLog -RedirectStandardError $indexerErrorLog -PassThru -WindowStyle Hidden
    Write-Host "    Indexer logs: $indexerLog"
  }

  if ($NoWeb) {
    Write-Host "==> Skipping web server because -NoWeb was provided."
    return
  }

  Write-Host "==> Starting Next.js on http://localhost:$WebPort"
  Write-Host "    Press Ctrl+C to stop the web app, Anvil, and indexer."

  Push-Location (Join-Path $root "apps\web")
  try {
    npx next dev -p $WebPort
  } finally {
    Pop-Location
  }
} finally {
  if (-not $KeepAnvil -and $anvilProcessId) {
    $anvilProcess = Get-Process -Id $anvilProcessId -ErrorAction SilentlyContinue
    Stop-ChildProcess $anvilProcess "Anvil"
    Remove-Item -LiteralPath $anvilPidPath -ErrorAction SilentlyContinue
  }

  Stop-ChildProcess $indexerProcess "indexer"
}
