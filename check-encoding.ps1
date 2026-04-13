$p = Get-Item 'Legacy/pages/spiritual advancing/spiritual home.html'
$bytes = [System.IO.File]::ReadAllBytes($p.FullName)
Write-Host "len: $($bytes.Length)"
Write-Host "BOM: $([BitConverter]::ToString($bytes[0..2]))"
try {
    [System.Text.Encoding]::UTF8.GetString($bytes) | Out-Null
    Write-Host 'utf8 ok'
} catch {
    Write-Host 'utf8 fail'
}
try {
    [System.Text.Encoding]::GetEncoding('gb2312').GetString($bytes) | Out-Null
    Write-Host 'gb2312 ok'
} catch {
    Write-Host 'gb2312 fail'
}
