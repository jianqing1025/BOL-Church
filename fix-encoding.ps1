# 正确的编码转换脚本 - 直接用GB2312读取并转换为UTF-8

$files = Get-ChildItem -Path "E:\Repo\bolccop\Legacy" -Recurse -Include *.html, *.htm

foreach ($file in $files) {
    try {
        Write-Host "转换文件: $($file.FullName)"

        # 直接用GB2312编码读取
        $gb2312 = [System.Text.Encoding]::GetEncoding('gb2312')
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        $content = $gb2312.GetString($bytes)

        # 更新charset声明
        $content = $content -replace 'charset=gb2312', 'charset=utf-8'
        $content = $content -replace 'charset=big5', 'charset=utf-8'
        $content = $content -replace 'charset=windows-1252', 'charset=utf-8'

        # 用UTF-8保存
        [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.Encoding]::UTF8)

        Write-Host "  ✓ 转换完成"
    } catch {
        Write-Host "  ✗ 转换失败: $($_.Exception.Message)"
    }
}

Write-Host "所有文件转换完成！"