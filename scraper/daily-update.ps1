# Daily automated catalog update: runs npm run scrape and pushes to GitHub if it succeeded.
# Runs from Windows Task Scheduler (see scraper/register-daily-task.ps1 to set it up).
# Logs to a file so a failed run can be diagnosed later.
#
# Note: deliberately does NOT set $ErrorActionPreference = "Stop". Native commands
# (git, npm) write routine, non-fatal messages to stderr (e.g. git's CRLF/LF line-ending
# notice) - under "Stop" those get wrapped into terminating errors by PowerShell 5.1 and
# would abort the whole run even though the underlying command actually succeeded. Success
# is judged by $LASTEXITCODE after each native command instead.

$projectDir = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectDir "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logFile = Join-Path $logDir ("daily-update-{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))

function Write-Log($message) {
    $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $message
    Write-Output $line
    Add-Content -Path $logFile -Value $line
}

try {
    Set-Location $projectDir
} catch {
    Write-Log "Fatal: could not cd to project dir: $_"
    exit 1
}

Write-Log "Starting daily update"

npm run scrape 2>&1 | ForEach-Object { Write-Log $_ }
$scrapeExitCode = $LASTEXITCODE

if ($scrapeExitCode -ne 0) {
    Write-Log "Scraper exited with error (code $scrapeExitCode) - skipping commit"
    exit 1
}

git add site/data/products.json 2>&1 | ForEach-Object { Write-Log $_ }

git diff --cached --quiet
$hasChanges = ($LASTEXITCODE -ne 0)

if (-not $hasChanges) {
    Write-Log "No catalog changes - nothing to commit"
} else {
    git commit -m "Automatic daily catalog update" 2>&1 | ForEach-Object { Write-Log $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Log "git commit failed (exit code $LASTEXITCODE)"
        exit 1
    }

    git push 2>&1 | ForEach-Object { Write-Log $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Log "git push failed (exit code $LASTEXITCODE)"
        exit 1
    }

    Write-Log "Catalog updated and pushed successfully"
}

Write-Log "Done"
