# Builds a Firefox-ready copy of the extension into dist/firefox (and dist/atlas-vault-firefox.zip)
$root = $PSScriptRoot
$out = Join-Path $root 'dist\firefox'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null
foreach ($item in 'background.js', 'icons', 'content', 'popup') {
  Copy-Item (Join-Path $root $item) $out -Recurse
}
# manifest.json + Firefox overlay (overlay keys replace same-named top-level keys; "_" keys are ignored)
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$overlay = Get-Content (Join-Path $root 'manifest.firefox.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($p in $overlay.PSObject.Properties) {
  if ($p.Name.StartsWith('_')) { continue }
  $manifest | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value -Force
}
$json = $manifest | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText((Join-Path $out 'manifest.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
$zip = Join-Path $root 'dist\atlas-vault-firefox.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
# Use tar (bsdtar) so zip entries use forward slashes; Compress-Archive uses backslashes, which AMO rejects
& "$env:SystemRoot\System32\tar.exe" -a -c -f $zip -C $out *
if ($LASTEXITCODE -ne 0) { throw "tar failed" }
Write-Host "Built $out and $zip"
