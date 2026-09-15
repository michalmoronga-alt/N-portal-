# N-portal – hudobný pracovník. Beží trvalo pod službou (Node).
# Číta Windows Media Session (to isté, čo používa ModularPlayers/JaxCore) a na stdout píše JSON riadky:
#   {"type":"media","available":true,"app":"Chrome","status":"Playing","title":"…","artist":"…","album":"…","thumb":"data:image/jpeg;base64,…"}
# Povely číta zo súboru (parameter -CommandFile): play | pause | toggle | next | prev. Súbor po vykonaní zmaže.
param(
  [string]$CommandFile = "$env:USERPROFILE\.n-portal\service\media-cmd.txt",
  [int]$PollMs = 250
)
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, $type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}
function Emit($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
Emit @{ type = 'ready' }

$lastKey = ''
$lastThumbKey = ''
$lastThumb = $null

while ($true) {
  try {
    # --- povel z PWA ---
    if (Test-Path $CommandFile) {
      $cmd = (Get-Content $CommandFile -Raw -ErrorAction SilentlyContinue)
      Remove-Item $CommandFile -Force -ErrorAction SilentlyContinue
      $cmd = if ($cmd) { $cmd.Trim() } else { '' }
      $s = $mgr.GetCurrentSession()
      if ($s -and $cmd) {
        $ok = $false
        switch ($cmd) {
          'play'   { $ok = Await ($s.TryPlayAsync()) ([bool]) }
          'pause'  { $ok = Await ($s.TryPauseAsync()) ([bool]) }
          'toggle' { $ok = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
          'next'   { $ok = Await ($s.TrySkipNextAsync()) ([bool]) }
          'prev'   { $ok = Await ($s.TrySkipPreviousAsync()) ([bool]) }
        }
        Emit @{ type = 'ack'; action = $cmd; ok = [bool]$ok }
        $lastKey = '' # vynútiť nové načítanie stavu
        Start-Sleep -Milliseconds 150
      } elseif ($cmd) {
        Emit @{ type = 'ack'; action = $cmd; ok = $false; error = 'ziadny prehravac' }
      }
    }

    # --- stav prehrávania ---
    $s = $mgr.GetCurrentSession()
    if (-not $s) {
      if ($lastKey -ne 'none') { $lastKey = 'none'; Emit @{ type = 'media'; available = $false } }
    } else {
      $info = $s.GetPlaybackInfo()
      $status = [string]$info.PlaybackStatus
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $app = $s.SourceAppUserModelId
      $key = "$app|$status|$($p.Title)|$($p.Artist)"
      if ($key -ne $lastKey) {
        $lastKey = $key
        $thumbKey = "$app|$($p.Title)|$($p.Artist)|$($p.AlbumTitle)"
        if ($thumbKey -ne $lastThumbKey) {
          $lastThumbKey = $thumbKey
          $lastThumb = $null
          try {
            if ($p.Thumbnail) {
              $ras = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
              $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($ras)
              $ms = New-Object System.IO.MemoryStream
              $net.CopyTo($ms)
              $ct = if ($ras.ContentType) { $ras.ContentType } else { 'image/jpeg' }
              $lastThumb = 'data:' + $ct + ';base64,' + [Convert]::ToBase64String($ms.ToArray())
              $ms.Dispose(); $net.Dispose(); $ras.Dispose()
            }
          } catch { $lastThumb = $null }
        }
        Emit @{
          type = 'media'; available = $true
          app = $app; status = $status
          title = [string]$p.Title; artist = [string]$p.Artist; album = [string]$p.AlbumTitle
          thumb = $lastThumb
        }
      }
    }
  } catch {
    Emit @{ type = 'error'; message = [string]$_.Exception.Message }
    Start-Sleep -Milliseconds 1000
  }
  Start-Sleep -Milliseconds $PollMs
}
