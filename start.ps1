$ErrorActionPreference = 'Stop'
$pagecuePython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $pagecuePython)) {
    $pagecuePython = (Get-Command python -ErrorAction Stop).Source
}
& $pagecuePython (Join-Path $PSScriptRoot 'companion\server.py')
exit $LASTEXITCODE
