$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$config    = Get-Content "$scriptDir\ict-ingest.config.json" | ConvertFrom-Json
$logFile   = "$scriptDir\ingested.txt"

$ingested = @{}
if (Test-Path $logFile) {
  Get-Content $logFile | ForEach-Object { $ingested[$_] = $true }
}

$batchSize = if ($config.PSObject.Properties['batchSize']) { [int]$config.batchSize } else { 20 }

$fileAgeMinutes = if ($config.PSObject.Properties['fileAgeMinutes'] -and $null -ne $config.fileAgeMinutes) {
  [int]$config.fileAgeMinutes
} else {
  $null
}
$cutoff = if ($null -ne $fileAgeMinutes) { (Get-Date).AddMinutes(-$fileAgeMinutes) } else { $null }

# Collect all candidate files across configured directories
$candidates = [System.Collections.ArrayList]@()
foreach ($dir in $config.directories) {
  if (-not (Test-Path $dir)) {
    Write-Host "Directory not found, skipping: $dir"
    continue
  }

  Get-ChildItem -Path $dir -File -Recurse | ForEach-Object {
    if ($ingested.ContainsKey($_.Name)) { return }
    if ($null -ne $cutoff -and $_.LastWriteTime -lt $cutoff) { return }
    $null = $candidates.Add($_)
  }
}

Write-Host "Files to process: $($candidates.Count)"

# Send in batches
$batchNum = 0
for ($i = 0; $i -lt $candidates.Count; $i += $batchSize) {
  $end   = [Math]::Min($i + $batchSize - 1, $candidates.Count - 1)
  $batch = @($candidates)[$i..$end]
  $batchNum++

  $files = @()
  foreach ($f in $batch) {
    $files += @{
      filename = $f.Name
      content  = Get-Content $f.FullName -Raw -Encoding UTF8
    }
  }

  try {
    $body = @{ files = $files } | ConvertTo-Json -Depth 3 -Compress

    $response = Invoke-RestMethod `
      -Uri $config.apiUrl `
      -Method POST `
      -ContentType "application/json" `
      -Headers @{ "x-ingest-secret" = $config.apiSecret } `
      -Body $body

    # Build set of failed filenames from server response
    $failedNames = @{}
    foreach ($entry in $response.failed) {
      $failedNames[$entry.filename] = $entry.error
    }

    # Log results and append successes to ingested.txt
    foreach ($f in $batch) {
      if ($failedNames.ContainsKey($f.Name)) {
        Write-Host "FAILED: $($f.Name) - $($failedNames[$f.Name])"
      } else {
        Add-Content -Path $logFile -Value $f.Name
        Write-Host "OK: $($f.Name)"
      }
    }

    Write-Host "Batch $batchNum`: processed=$($response.processed), failed=$($response.failed.Count)"

  } catch {
    Write-Host "BATCH $batchNum ERROR: $($_.Exception.Message)"
    # No files appended; entire batch will be retried on next run
  }

  # Pause between batches (skip after the last one)
  if ($i + $batchSize -lt $candidates.Count) {
    Start-Sleep -Milliseconds 200
  }
}
