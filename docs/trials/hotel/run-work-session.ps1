param(
  [Parameter(Mandatory = $true)][string]$ApplicationPath,
  [Parameter(Mandatory = $true)][string]$LogDirectory,
  [string]$Session = 'tandrove-work'
)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $LogDirectory) { throw 'Use a new evidence directory; do not overwrite a run.' }
$trialLogs = (New-Item -ItemType Directory -Path $LogDirectory).FullName
$trialScripts = $PSScriptRoot
Push-Location -LiteralPath $ApplicationPath
function Invoke-TrialFile([string]$Name, [string]$Label) {
  $trialFile = Join-Path $trialScripts $Name
  $trialLog = Join-Path $trialLogs "$Label.log"
  & npx --yes --package @playwright/cli@0.1.23 playwright-cli "-s=$Session" run-code --filename $trialFile *> $trialLog
  $trialExit = $LASTEXITCODE
  $trialText = Get-Content -LiteralPath $trialLog -Raw
  if ($trialExit -ne 0 -or $trialText -notmatch '### Result\r?\n([^\r\n]+)') {
    throw "Trial command failed; inspect $trialLog"
  }
  $trialResult = $Matches[1] | ConvertFrom-Json
  if ($Name -eq 'browser-work-start.js') {
    if (-not $trialResult.started) { throw 'Trial did not start.' }
  } elseif ($Name -ne 'browser-work-abort.js' -and -not $trialResult.passed) {
    throw "Trial assertions failed; inspect $trialLog"
  }
  $trialResult | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $trialLogs "$Label.json") -Encoding utf8
  return $trialResult
}
try {
  $trialStart = Invoke-TrialFile 'browser-work-start.js' 'start'
  Write-Output "Started $($trialStart.startedAt); 50 rounds over at least 25 actual minutes."
  $trialClock = [System.Diagnostics.Stopwatch]::StartNew()
  for ($trialRound = 1; $trialRound -le 50; $trialRound++) {
    $trialDue = ($trialRound - 1) * 30000
    while ($trialClock.ElapsedMilliseconds -lt $trialDue) {
      Start-Sleep -Milliseconds ([int][Math]::Max(1, [Math]::Min(1000, $trialDue - $trialClock.ElapsedMilliseconds)))
    }
    $trialStep = Invoke-TrialFile 'browser-work-step.js' ('round-{0:d2}' -f $trialRound)
    Write-Output "Round $trialRound passed; cycles=$($trialStep.cycles), elapsedMs=$($trialStep.elapsedMs), roomReads=$($trialStep.roomReads)."
  }
  while ($trialClock.ElapsedMilliseconds -lt 1501000) {
    Start-Sleep -Milliseconds ([int][Math]::Max(1, [Math]::Min(1000, 1501000 - $trialClock.ElapsedMilliseconds)))
  }
  $trialStatus = Invoke-TrialFile 'browser-work-status.js' 'status'
  if ($trialStatus.elapsedMs -lt 1500000) { throw 'Monotonic browser-session duration is still below 25 minutes.' }
  $trialFinal = Invoke-TrialFile 'browser-work-finish.js' 'final'
  Write-Output "Passed: $($trialFinal.cycles) cycles in $($trialFinal.elapsedMs)ms; receipt: $(Join-Path $trialLogs 'final.json')"
} catch {
  try {
    $null = Invoke-TrialFile 'browser-work-abort.js' 'aborted'
    Write-Output 'Stopped session work. Inspect any committed booking before restarting.'
  } catch {
    Write-Output "Automatic trial cleanup did not complete: $($_.Exception.Message)"
  }
  throw
} finally { Pop-Location }
