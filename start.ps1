$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if (-not $nodePath) {
  $runtime = Get-ChildItem -Path 'C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.*\dependencies\node\bin\node.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
  if ($runtime) { $nodePath = $runtime.FullName }
}
if (-not $nodePath) { Write-Host 'Node.js 18+ is required. Install Node.js, then run this launcher again.'; Read-Host 'Press Enter to close'; exit 1 }
$sitePort = if ($env:PORT) { $env:PORT } else { '4173' }
Write-Host "Open http://127.0.0.1:$sitePort in your browser. Press Ctrl+C to stop."
& $nodePath (Join-Path $PSScriptRoot 'server.mjs')
if ($LASTEXITCODE -ne 0) { Read-Host 'Press Enter to close' }
