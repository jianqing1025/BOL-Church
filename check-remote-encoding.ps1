$b = [System.IO.File]::ReadAllBytes('remote.html')
Write-Host "remote len: $($b.Length)"
Write-Host "remote BOM: $([BitConverter]::ToString($b[0..2]))"
try {
    [System.Text.Encoding]::UTF8.GetString($b) | Out-Null
    Write-Host 'remote utf8 ok'
} catch {
    Write-Host 'remote utf8 fail'
}
try {
    [System.Text.Encoding]::GetEncoding('gb2312').GetString($b) | Out-Null
    Write-Host 'remote gb2312 ok'
} catch {
    Write-Host 'remote gb2312 fail'
}
