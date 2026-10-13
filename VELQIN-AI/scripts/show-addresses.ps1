# Prints the LAN addresses phones and tablets can use to reach VELQIN.
$port = 8080
if (Test-Path "$PSScriptRoot\..\.env") {
  $line = Get-Content "$PSScriptRoot\..\.env" | Where-Object { $_ -match '^\s*VELQIN_PORT\s*=' } | Select-Object -First 1
  if ($line) { $port = ($line -split '=', 2)[1].Trim() }
}
Write-Host "    This PC:        http://localhost:$port"
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback' } |
  ForEach-Object { Write-Host ("    Phone / iPad:   http://{0}:{1}   ({2})" -f $_.IPAddress, $port, $_.InterfaceAlias) }
