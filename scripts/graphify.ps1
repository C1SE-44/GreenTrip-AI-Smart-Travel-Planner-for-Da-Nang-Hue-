# Uses a separate tool environment, never the application's Python packages.
$toolExecutable = Join-Path $env:USERPROFILE 'Documents\Codex\tools\graphify-0.9.108\Scripts\graphify.exe'
if (-not (Test-Path -LiteralPath $toolExecutable)) {
    throw 'Graphify is not installed at the documented tool path. See docs/AI_TOOLS.md.'
}
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    & $toolExecutable @args
    $toolExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $toolExitCode
