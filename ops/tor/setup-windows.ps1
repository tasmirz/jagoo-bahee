[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$BackendPort = 3000,

    [ValidateRange(1, 65535)]
    [int]$VirtualPort = 80,

    [ValidatePattern('^[a-zA-Z0-9_-]+$')]
    [string]$ServiceName = 'jagoo-bahee',

    [string]$TorExe,

    [switch]$NoInstall
)

$ErrorActionPreference = 'Stop'

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-TorExecutable {
    param([string]$ExplicitPath)

    if ($ExplicitPath) {
        $resolved = Resolve-Path -LiteralPath $ExplicitPath -ErrorAction Stop
        return $resolved.Path
    }

    $command = Get-Command tor.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Tor Browser\Browser\TorBrowser\Tor\tor.exe'),
        (Join-Path $env:ProgramFiles 'Tor Browser\Browser\TorBrowser\Tor\tor.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Tor Browser\Browser\TorBrowser\Tor\tor.exe'),
        (Join-Path $env:ProgramData 'chocolatey\bin\tor.exe')
    )
    return $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}

if (-not (Test-Administrator)) {
    throw 'Run this script from an elevated PowerShell window (Run as Administrator).'
}

$torPath = Find-TorExecutable -ExplicitPath $TorExe
if (-not $torPath -and -not $NoInstall) {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw 'Tor was not found. Install Tor Browser or pass -TorExe C:\path\to\tor.exe.'
    }
    & $winget.Source install --exact --id TorProject.TorBrowser --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget could not install Tor Browser (exit $LASTEXITCODE)."
    }
    $torPath = Find-TorExecutable
}
if (-not $torPath) {
    throw 'Tor was not found. Install Tor Browser or pass -TorExe C:\path\to\tor.exe.'
}

$root = Join-Path $env:ProgramData 'JagooBahee\Tor'
$dataDirectory = Join-Path $root 'data'
$hiddenServiceDirectory = Join-Path $root ('hidden-services\' + $ServiceName)
$torrc = Join-Path $root 'torrc'
$logFile = Join-Path $root 'tor.log'
$taskName = 'JagooBahee-Tor'

New-Item -ItemType Directory -Force -Path $root, $dataDirectory | Out-Null

$config = @"
# Managed by Jagoo Bahee ops/tor/setup-windows.ps1
DataDirectory $($dataDirectory -replace '\\', '/')
SocksPort 0
HiddenServiceDir $($hiddenServiceDirectory -replace '\\', '/')
HiddenServiceVersion 3
HiddenServicePort $VirtualPort 127.0.0.1:$BackendPort
Log notice file $($logFile -replace '\\', '/')
"@
[IO.File]::WriteAllText($torrc, $config, [Text.UTF8Encoding]::new($false))

& $torPath --verify-config -f $torrc
if ($LASTEXITCODE -ne 0) {
    throw 'Tor rejected the generated configuration.'
}

$quotedTorrc = '"{0}"' -f $torrc
$action = New-ScheduledTaskAction -Execute $torPath -Argument "-f $quotedTorrc"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Jagoo Bahee Tor onion service' -Force | Out-Null

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName $taskName

$hostnameFile = Join-Path $hiddenServiceDirectory 'hostname'
for ($attempt = 0; $attempt -lt 60 -and -not (Test-Path -LiteralPath $hostnameFile); $attempt++) {
    Start-Sleep -Seconds 1
}
if (-not (Test-Path -LiteralPath $hostnameFile)) {
    throw "Tor started, but no onion hostname was created. Inspect $logFile."
}

$onionHost = (Get-Content -Raw -LiteralPath $hostnameFile).Trim()
$onionUrl = if ($VirtualPort -eq 80) { "http://$onionHost" } else { "http://${onionHost}:$VirtualPort" }

Write-Host 'Jagoo Bahee onion service is ready:'
Write-Host $onionUrl
Write-Host "It forwards only to 127.0.0.1:$BackendPort."
Write-Host "Back up $hiddenServiceDirectory securely to preserve this onion address."
