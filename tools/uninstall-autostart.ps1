# N-portal – odstráni automatický štart služby (úlohu v Plánovači). Službu samotnú nechá bežať.
$taskName = 'N-portal service'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Úloha '$taskName' odstránená."
} else {
  Write-Host "Úloha '$taskName' neexistuje."
}
