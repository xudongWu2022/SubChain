param(
  [string]$WalletAddress = "",
  [int]$WebPort = 3000,
  [switch]$NoWeb,
  [switch]$KeepAnvil,
  [switch]$WithDb
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$devDir = Join-Path $root ".dev"
$anvilLog = Join-Path $devDir "anvil.log"
$anvilErrorLog = Join-Path $devDir "anvil.err.log"
$anvilPidPath = Join-Path $devDir "anvil.pid"
$webEnvPath = Join-Path $root "apps\web\.env.local"
$indexerEnvPath = Join-Path $root "apps\indexer\.env"
$rpcUrl = "http://127.0.0.1:8545"
$chainId = 31337
$deployerPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
$startedAnvil = $false
$anvilProcess = $null

function Add-FoundryToPath {
  $foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"
  if ((Test-Path $foundryBin) -and ($env:PATH -notlike "*$foundryBin*")) {
    $env:PATH = "$foundryBin;$env:PATH"
  }
}

function Assert-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command '$Name'. Install Foundry or Node dependencies, then try again."
  }
}

function Test-LocalRpc {
  try {
    $result = & cast chain-id --rpc-url $rpcUrl 2>$null
    return ($LASTEXITCODE -eq 0 -and $result -eq "$chainId")
  } catch {
    return $false
  }
}

function Wait-ForLocalRpc {
  for ($i = 0; $i -lt 30; $i++) {
    if (Test-LocalRpc) {
      return
    }

    Start-Sleep -Milliseconds 500
  }

  throw "Anvil did not become ready at $rpcUrl. See $anvilLog."
}

function Invoke-CheckedCommand($Description, $ScriptBlock) {
  Write-Host "==> $Description"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $ScriptBlock 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  $output | ForEach-Object { Write-Host $_ }

  if ($exitCode -ne 0) {
    throw "$Description failed with exit code $exitCode."
  }

  return $output
}

function Get-DeployedAddress($Output, $Label) {
  $line = $Output | Where-Object { $_ -match "${Label}:\s*(0x[a-fA-F0-9]{40})" } | Select-Object -Last 1
  if (-not $line) {
    throw "Could not find $Label address in deploy output."
  }

  [void]($line -match "${Label}:\s*(0x[a-fA-F0-9]{40})")
  return $Matches[1]
}

function Write-WebEnvironment($SubChainAddress, $MockUsdcAddress) {
  $preservedLines = @()

  if (Test-Path $webEnvPath) {
    $preservedLines = Get-Content $webEnvPath | Where-Object {
      $_ -and
      $_ -notmatch "^NEXT_PUBLIC_RPC_URL=" -and
      $_ -notmatch "^NEXT_PUBLIC_SUBCHAIN_ADDRESS=" -and
      $_ -notmatch "^NEXT_PUBLIC_USDC_ADDRESS="
    }
  }

  $nextLines = @(
    "NEXT_PUBLIC_RPC_URL=$rpcUrl",
    "NEXT_PUBLIC_SUBCHAIN_ADDRESS=$SubChainAddress",
    "NEXT_PUBLIC_USDC_ADDRESS=$MockUsdcAddress"
  )

  if ($preservedLines.Count -gt 0) {
    $nextLines += $preservedLines
  }

  $nextLines | Set-Content -Path $webEnvPath -Encoding utf8
}

function Set-EnvValue($Path, $Name, $Value) {
  $lines = @()

  if (Test-Path $Path) {
    $lines = @(Get-Content $Path | Where-Object { $_ -and $_ -notmatch "^$Name=" })
  }

  $nextLines = @($lines) + @("$Name=$Value")
  Set-Content -Path $Path -Value $nextLines -Encoding utf8
}

try {
  Set-Location $root
  New-Item -ItemType Directory -Force $devDir | Out-Null
  Add-FoundryToPath

  Assert-Command "npm"
  Assert-Command "anvil"
  Assert-Command "forge"
  Assert-Command "cast"

  if ($WithDb) {
    & (Join-Path $PSScriptRoot "db-local.ps1")
  }

  if (Test-LocalRpc) {
    Write-Host "==> Reusing existing Anvil RPC at $rpcUrl"
  } else {
    Write-Host "==> Starting Anvil at $rpcUrl"
    $anvilProcess = Start-Process -FilePath "anvil" -RedirectStandardOutput $anvilLog -RedirectStandardError $anvilErrorLog -PassThru -WindowStyle Hidden
    Set-Content -Path $anvilPidPath -Value $anvilProcess.Id -Encoding utf8
    $startedAnvil = $true
    Wait-ForLocalRpc
  }

  $deployOutput = Invoke-CheckedCommand "Deploying contracts" {
    Push-Location (Join-Path $root "contracts")
    try {
      forge script "script/Deploy.s.sol:Deploy" --rpc-url $rpcUrl --broadcast --private-key $deployerPrivateKey
    } finally {
      Pop-Location
    }
  }

  $mockUsdcAddress = Get-DeployedAddress $deployOutput "MockUSDC"
  $subChainAddress = Get-DeployedAddress $deployOutput "SubChain"

  Write-WebEnvironment $subChainAddress $mockUsdcAddress
  Set-EnvValue $indexerEnvPath "SUBCHAIN_ADDRESS" $subChainAddress
  Set-EnvValue $indexerEnvPath "RPC_URL" $rpcUrl

  Write-Host "==> Wrote apps/web/.env.local"
  Write-Host "    MockUSDC: $mockUsdcAddress"
  Write-Host "    SubChain: $subChainAddress"

  if ($WalletAddress) {
    if ($WalletAddress -notmatch "^0x[a-fA-F0-9]{40}$") {
      throw "WalletAddress must be a 0x-prefixed 20-byte address."
    }

    Invoke-CheckedCommand "Funding wallet with local ETH" {
      cast send $WalletAddress --value 10ether --private-key $deployerPrivateKey --rpc-url $rpcUrl
    } | Out-Null

    Invoke-CheckedCommand "Minting 1,000,000 mUSDC to wallet" {
      cast send $mockUsdcAddress "mint(address,uint256)" $WalletAddress 1000000000000 --private-key $deployerPrivateKey --rpc-url $rpcUrl
    } | Out-Null
  }

  if ($NoWeb) {
    Write-Host "==> Skipping web server because -NoWeb was provided."
    return
  }

  Write-Host "==> Starting Next.js on http://localhost:$WebPort"
  $stopTarget = "the web app"
  if ($startedAnvil) {
    $stopTarget = "the web app and Anvil"
  }
  Write-Host "    Press Ctrl+C to stop $stopTarget."
  Push-Location (Join-Path $root "apps\web")
  try {
    npx next dev -p $WebPort
  } finally {
    Pop-Location
  }
} finally {
  if ($startedAnvil -and -not $KeepAnvil -and $anvilProcess -and -not $anvilProcess.HasExited) {
    Write-Host ""
    Write-Host "==> Stopping Anvil"
    Stop-Process -Id $anvilProcess.Id
    Remove-Item -LiteralPath $anvilPidPath -ErrorAction SilentlyContinue
  }
}
