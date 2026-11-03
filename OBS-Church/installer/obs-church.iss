; OBS Church — Windows installer (Inno Setup 6).
; Built by installer\build-installer.ps1, which stages the files in build_x64\stage.
;
; Installs for the current user (no administrator rights needed) and in portable
; mode: OBS Church keeps its settings beside itself, apart from any OBS Studio.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef StageDir
  #define StageDir "..\build_x64\stage"
#endif
#ifndef OutputDir
  #define OutputDir "..\build_x64\installer"
#endif

[Setup]
AppId={{6E4C2B1F-3F7A-4E39-9C0B-0B5C3E7A1C11}
AppName=OBS Church
AppVersion={#AppVersion}
AppVerName=OBS Church {#AppVersion}
AppPublisher=BOLCC
AppComments=OBS Studio 33 with slides, scripture and a Streaming/Recording section for church services
DefaultDirName={localappdata}\Programs\OBS Church
DefaultGroupName=OBS Church
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=OBS-Church-Setup-{#AppVersion}
SetupIconFile={#StageDir}\..\..\frontend\cmake\windows\obs-studio.ico
UninstallDisplayIcon={app}\bin\64bit\obs64.exe
Compression=lzma2/max
SolidCompression=yes
LZMANumBlockThreads=4
WizardStyle=modern
LicenseFile={#StageDir}\..\..\COPYING
CloseApplications=yes

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "zh_tw"; MessagesFile: "ChineseTraditional.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Debug symbols (.pdb, ~470 MB) stay out of the installer.
Source: "{#StageDir}\*"; DestDir: "{app}"; Excludes: "*.pdb"; Flags: ignoreversion recursesubdirs createallsubdirs
; Settings live beside the program, not in %APPDATA%\obs-studio.
Source: "portable_mode.txt"; DestDir: "{app}"; Flags: onlyifdoesntexist

[Dirs]
Name: "{app}\config"

[Icons]
Name: "{group}\OBS Church"; Filename: "{app}\bin\64bit\obs64.exe"; WorkingDir: "{app}\bin\64bit"
Name: "{group}\{cm:UninstallProgram,OBS Church}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\OBS Church"; Filename: "{app}\bin\64bit\obs64.exe"; WorkingDir: "{app}\bin\64bit"; Tasks: desktopicon

[Run]
Filename: "{app}\bin\64bit\obs64.exe"; WorkingDir: "{app}\bin\64bit"; Description: "{cm:LaunchProgram,OBS Church}"; Flags: nowait postinstall skipifsilent
