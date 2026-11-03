# Builds OBS Church and its Windows installer.
#
#   powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1 [-Version 1.2.19] [-SkipBuild]
#
# -Version is OBS Church's own (installer) version; -ObsVersion the OBS Studio it is built on.
#
# Needs: Node.js, CMake 4, Visual Studio 2026 Build Tools (C++ with ATL), Inno Setup 6.
param(
    [string]$Version = "1.2.19",
    [string]$ObsVersion = "33.0.4",
    [string]$Config = "RelWithDebInfo",
    [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root "build_x64"
$stage = Join-Path $build "stage"

function Find-Tool([string[]]$candidates, [string]$name) {
    foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw "$name not found"
}

$cmake = Find-Tool @("D:\Tools\cmake-4.4.4-windows-x86_64\bin\cmake.exe") "cmake.exe"
$iscc = Find-Tool @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe") "ISCC.exe"

# 1. The slide panel and output page (church-presenter -> frontend/data/church-presenter).
Push-Location (Join-Path $root "church-presenter")
try {
    if (-not (Test-Path "node_modules")) { npm ci; if ($LASTEXITCODE) { throw "npm ci failed" } }
    npm run build; if ($LASTEXITCODE) { throw "church-presenter build failed" }
} finally { Pop-Location }

# 2. OBS itself, with OBS Church's version in its title bar.
$versionHeader = Join-Path $root "frontend\church\ChurchVersion.hpp"
$versionLine = "#define OBS_CHURCH_VERSION `"$Version`""
$header = Get-Content -LiteralPath $versionHeader -Raw -Encoding UTF8
$versionChanged = $header -notmatch [regex]::Escape($versionLine)
if ($versionChanged) {
    $header = $header -replace '#define OBS_CHURCH_VERSION "[^"]*"', $versionLine
    [System.IO.File]::WriteAllText($versionHeader, $header, (New-Object System.Text.UTF8Encoding $false))
}
# Even with -SkipBuild the program itself is brought up to date (quick when nothing changed), so a
# version written above never ships in a program built before it.
if ($SkipBuild) {
    & $cmake --build $build --config $Config --target obs-studio '--' -m -p:BuildProjectReferences=false
    if ($LASTEXITCODE) { throw "obs-studio build failed (is the test copy of OBS still open?)" }
}
if (-not $SkipBuild) {
    & $cmake --preset windows-x64 -S $root "-DOBS_VERSION_OVERRIDE=$ObsVersion"; if ($LASTEXITCODE) { throw "cmake configure failed" }
    & $cmake --build $build --config $Config '--' -m; if ($LASTEXITCODE) { throw "cmake build failed" }
}

# 3. Stage what gets installed.
$builtExe = Join-Path $build "frontend\$Config\obs64.exe"
if (-not (Test-Path -LiteralPath $builtExe)) { throw "Built OBS executable not found: $builtExe" }
if ((Get-Item -LiteralPath $builtExe).VersionInfo.FileVersion -ne $ObsVersion) {
    throw "Executable version does not match OBS version $ObsVersion. Build that version first."
}
$resolvedStage = [System.IO.Path]::GetFullPath($stage)
$resolvedBuild = [System.IO.Path]::GetFullPath($build).TrimEnd('\') + '\'
if (-not $resolvedStage.StartsWith($resolvedBuild, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Stage is outside the build directory" }
if (Test-Path -LiteralPath $resolvedStage) { Remove-Item -LiteralPath $resolvedStage -Recurse -Force }
& $cmake --install $build --config $Config --prefix $stage; if ($LASTEXITCODE) { throw "cmake install failed" }

# The Visual C++ runtime, app-local, so no separate (administrator) install is needed.
$vs = & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -property installationPath
$crt = Get-ChildItem (Join-Path $vs "VC\Redist\MSVC") -Directory |
    Where-Object { $_.Name -match '^\d' } | Sort-Object Name -Descending | Select-Object -First 1 |
    ForEach-Object { Get-ChildItem (Join-Path $_.FullName "x64") -Directory -Filter "Microsoft.VC*.CRT" } | Select-Object -First 1
if ($crt) {
    Copy-Item (Join-Path $crt.FullName "*.dll") (Join-Path $stage "bin\64bit") -Force
} else {
    Write-Warning "Visual C++ runtime not found; the target PC must have it installed."
}

# 4. The installer.
$out = Join-Path $build "installer"
& $iscc "/DAppVersion=$Version" "/DStageDir=$stage" "/DOutputDir=$out" (Join-Path $PSScriptRoot "obs-church.iss")
if ($LASTEXITCODE) { throw "Inno Setup failed" }
Write-Host "Installer: $(Join-Path $out "OBS-Church-Setup-$Version.exe")"
