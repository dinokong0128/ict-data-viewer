$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$config    = Get-Content "$scriptDir\ict-ingest.config.json" | ConvertFrom-Json
$logFile   = "$scriptDir\ingested.txt"

$ingested = @{}
if (Test-Path $logFile) {
  Get-Content $logFile | ForEach-Object { $ingested[$_] = $true }
}

foreach ($dir in $config.directories) {
  if (-not (Test-Path $dir)) {
    Write-Host "Directory not found, skipping: $dir"
    continue
  }

  Get-ChildItem -Path $dir -File | ForEach-Object {
    $filename = $_.Name
    if ($ingested.ContainsKey($filename)) { return }

    try {
      $content = Get-Content $_.FullName -Raw -Encoding UTF8

      $body = @{
        filename = $filename
        content  = $content
      } | ConvertTo-Json -Depth 2

      $response = Invoke-RestMethod `
        -Uri $config.apiUrl `
        -Method POST `
        -ContentType "application/json" `
        -Headers @{ "x-ingest-secret" = $config.apiSecret } `
        -Body $body

      Add-Content -Path $logFile -Value $filename
      Write-Host "OK: $filename"

    } catch {
      Write-Host "FAILED: $filename - $($_.Exception.Message)"
    }
  }
}
