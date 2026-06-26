param(
  [switch]$Stop,
  [switch]$Reset
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$databaseUrl = "postgres://postgres:postgres@localhost:5432/subchain"
$webEnvPath = Join-Path $root "apps\web\.env.local"
$indexerEnvPath = Join-Path $root "apps\indexer\.env"

function Assert-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command '$Name'. Install Docker Desktop, then try again."
  }
}

function Test-DockerRunning {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    docker info 1>$null 2>$null
    return $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

function Ensure-DockerRunning {
  if (Test-DockerRunning) {
    return
  }

  $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"

  if (Test-Path $dockerDesktop) {
    Write-Host "==> Starting Docker Desktop"
    Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  }

  for ($i = 0; $i -lt 90; $i++) {
    if (Test-DockerRunning) {
      return
    }

    Start-Sleep -Seconds 1
  }

  throw "Docker Desktop is installed, but the Docker engine is not running. Start Docker Desktop, wait until it is ready, then run npm run db:local again."
}

function Set-EnvValue($Path, $Name, $Value) {
  $lines = @()

  if (Test-Path $Path) {
    $lines = @(Get-Content $Path | Where-Object { $_ -and $_ -notmatch "^$Name=" })
  }

  $nextLines = @($lines) + @("$Name=$Value")
  Set-Content -Path $Path -Value $nextLines -Encoding utf8
}

function Wait-ForPostgres {
  for ($i = 0; $i -lt 40; $i++) {
    $status = docker inspect --format "{{.State.Health.Status}}" subchain-postgres 2>$null

    if ($LASTEXITCODE -eq 0 -and $status -eq "healthy") {
      return
    }

    Start-Sleep -Seconds 1
  }

  throw "Postgres did not become healthy. Run 'docker logs subchain-postgres' for details."
}

Set-Location $root
Assert-Command "docker"
Ensure-DockerRunning

if ($Stop) {
  docker compose down
  return
}

if ($Reset) {
  docker compose down -v
}

Write-Host "==> Starting local Postgres"
docker compose up -d postgres
Wait-ForPostgres

Write-Host "==> Applying indexer schema"
docker cp (Join-Path $root "apps\indexer\schema.sql") "subchain-postgres:/tmp/schema.sql"
docker exec subchain-postgres psql -U postgres -d subchain -f /tmp/schema.sql

Set-EnvValue $webEnvPath "DATABASE_URL" $databaseUrl
Set-EnvValue $indexerEnvPath "DATABASE_URL" $databaseUrl
Set-EnvValue $indexerEnvPath "RPC_URL" "http://127.0.0.1:8545"
Set-EnvValue $indexerEnvPath "START_BLOCK" "0"

Write-Host "==> Database ready"
Write-Host "    DATABASE_URL=$databaseUrl"
Write-Host "    Wrote apps/web/.env.local and apps/indexer/.env"
