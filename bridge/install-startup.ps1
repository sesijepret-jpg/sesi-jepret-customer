param(
    [string]$PythonPath = (Get-Command python -ErrorAction Stop).Source
)

$ErrorActionPreference = 'Stop'
$bridgeDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$bridgeScript = Join-Path $bridgeDirectory 'canon_bridge.py'
if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) {
    throw "Python tidak ditemukan: $PythonPath"
}
& $PythonPath -c 'import PIL'
if ($LASTEXITCODE -ne 0) {
    throw 'Pillow belum terpasang pada Python yang dipilih.'
}

$taskName = 'SesiJepret Camera Bridge'
$pythonWindowless = Join-Path (Split-Path -Parent $PythonPath) 'pythonw.exe'
if (-not (Test-Path -LiteralPath $pythonWindowless -PathType Leaf)) {
    throw "Python tanpa jendela tidak ditemukan: $pythonWindowless"
}
$action = New-ScheduledTaskAction -Execute $pythonWindowless -Argument ('"' + $bridgeScript + '"') -WorkingDirectory $bridgeDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Output "Bridge akan dimulai saat masuk Windows: $taskName"
