param(
  [Parameter(Mandatory = $true)][string]$ProfileDirectory,
  [Parameter(Mandatory = $true)][string]$ConfigPath,
  [string]$ChromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe',
  [ValidateRange(1024, 65535)][int]$Port = 19439
)
$ErrorActionPreference = 'Stop'
$trialProfile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDirectory)
$trialConfig = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ConfigPath)
if (Test-Path -LiteralPath $trialProfile) { throw 'Use a new dedicated test profile, never a personal browser profile.' }
if (Test-Path -LiteralPath $trialConfig) { throw 'Use a new configuration path.' }
if (-not (Test-Path -LiteralPath (Split-Path -Parent $trialConfig) -PathType Container)) { throw 'Create the configuration parent directory before launching Chrome.' }
if (-not (Test-Path -LiteralPath $ChromePath -PathType Leaf)) { throw 'Set ChromePath to the installed Chrome executable.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw 'Choose an unused debugging port; do not attach to another browser.' }
$trialChrome = (Resolve-Path -LiteralPath $ChromePath).ProviderPath
$trialEndpoint = "http://127.0.0.1:$Port"
$trialArguments = @(
  "--remote-debugging-port=$Port",
  '--remote-debugging-address=127.0.0.1',
  ('--user-data-dir="' + $trialProfile + '"'),
  '--no-first-run', '--no-default-browser-check', 'about:blank'
)
$trialBrowser = $null
$trialConfigCreated = $false
try {
  $trialBrowser = Start-Process -FilePath $trialChrome -ArgumentList $trialArguments -WindowStyle Hidden -PassThru
  $trialStartup = [System.Diagnostics.Stopwatch]::StartNew()
  $trialReady = $false
  while ($trialStartup.ElapsedMilliseconds -lt 10000) {
    if ($trialBrowser.HasExited) { throw 'The owned Chrome process exited before its debugging endpoint became ready.' }
    try {
      $trialListeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
      $trialOwnedListener = $trialListeners.Count -gt 0 -and @($trialListeners | Where-Object { $_.OwningProcess -ne $trialBrowser.Id }).Count -eq 0
      if ($trialOwnedListener) {
        $trialVersion = Invoke-RestMethod -Uri "$trialEndpoint/json/version" -TimeoutSec 1 -ErrorAction Stop
        $trialSocket = [Uri]$trialVersion.webSocketDebuggerUrl
        $trialReady = $trialSocket.Scheme -eq 'ws' -and $trialSocket.IsLoopback -and $trialSocket.Port -eq $Port
      }
    } catch { $trialReady = $false }
    if ($trialReady) { break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $trialReady) { throw 'The owned Chrome debugging endpoint was not ready within 10 seconds.' }
  # Bind this exact owned browser, not a future process that reuses its port.
  $trialConfigJson = @{ browser = @{ browserName = 'chromium'; cdpEndpoint = $trialSocket.AbsoluteUri } } | ConvertTo-Json -Depth 3
  # CreateNew preserves any configuration that appeared after the initial check.
  $trialStream = [System.IO.File]::Open($trialConfig, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  $trialConfigCreated = $true
  try {
    $trialBytes = [System.Text.Encoding]::UTF8.GetBytes($trialConfigJson)
    $trialStream.Write($trialBytes, 0, $trialBytes.Length)
  } finally { $trialStream.Dispose() }
  $trialQuotedConfig = $trialConfig.Replace("'", "''")
  Write-Output "Owned Chrome PID $($trialBrowser.Id), dedicated profile $trialProfile, CDP port $Port."
  Write-Output "Attach with: npx --yes --package @playwright/cli@0.1.23 playwright-cli -s=tandrove-work open 'http://127.0.0.1:13009/home?trialAccounts=1' --config '$trialQuotedConfig'"
} catch {
  $trialStartupError = $_
  if ($trialConfigCreated) {
    try { Remove-Item -LiteralPath $trialConfig -ErrorAction Stop }
    catch { Write-Warning "Could not remove the newly created configuration: $trialConfig" }
  }
  if ($null -ne $trialBrowser) {
    try {
      if (-not $trialBrowser.HasExited) {
        $trialBrowser.Kill()
        if (-not $trialBrowser.WaitForExit(5000)) { Write-Warning "The owned Chrome process $($trialBrowser.Id) did not exit within 5 seconds." }
      }
    } catch { Write-Warning "Could not stop the owned Chrome process $($trialBrowser.Id)." }
  }
  Write-Warning "Any newly created dedicated profile is preserved for diagnostics: $trialProfile"
  throw $trialStartupError
}
