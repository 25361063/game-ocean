param(
    [ValidateRange(1,65535)][int]$Port = 8123,
    [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$ruleName = "TideCoop-LAN-TCP-$Port"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw '请在管理员 PowerShell 中运行此脚本。'
}
if ($Remove) {
    Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Host "已撤销规则 $ruleName"
} elseif (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) {
    Write-Host "规则已存在：$ruleName"
} else {
    New-NetFirewallRule -Name $ruleName -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Profile Any | Out-Null
    Write-Host "已允许本地子网访问 TCP $Port。未关闭防火墙。"
}
