param(
  [string]$AccessPath = "E:\Repo\bolccop\Data\2019BOLCCOP-jIANQING.accdb",
  [switch]$Remote
)

$ErrorActionPreference = "Stop"

function SqlText($value) {
  if ($null -eq $value -or [DBNull]::Value.Equals($value)) {
    return "NULL"
  }
  $text = [string]$value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return "NULL"
  }
  return "'" + $text.Replace("'", "''") + "'"
}

function SqlBool($value) {
  if ($null -eq $value -or [DBNull]::Value.Equals($value)) {
    return "0"
  }
  if ([bool]$value) {
    return "1"
  }
  return "0"
}

function SqlTextOrEmpty($value) {
  if ($null -eq $value -or [DBNull]::Value.Equals($value)) {
    return "''"
  }
  $text = [string]$value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return "''"
  }
  return "'" + $text.Replace("'", "''") + "'"
}

function GroupId($name) {
  if ([string]::IsNullOrWhiteSpace($name)) {
    return $null
  }
  $slug = ([string]$name).Trim().ToLowerInvariant() -replace '[^a-z0-9\u4e00-\u9fff]+', '-'
  $slug = $slug.Trim('-')
  if ([string]::IsNullOrWhiteSpace($slug)) {
    $slug = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(([string]$name).Trim())).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  }
  return "import-group-$slug"
}

if (!(Test-Path $AccessPath)) {
  throw "Access file not found: $AccessPath"
}

$connectionString = "Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=$AccessPath;"
$connection = New-Object System.Data.Odbc.OdbcConnection $connectionString
$table = New-Object System.Data.DataTable

try {
  $connection.Open()
  $command = $connection.CreateCommand()
  $command.CommandText = "SELECT * FROM [T_Accounts] ORDER BY [ID]"
  $adapter = New-Object System.Data.Odbc.OdbcDataAdapter $command
  [void]$adapter.Fill($table)
}
finally {
  $connection.Close()
}

$outputDir = Join-Path (Get-Location) ".tmp"
New-Item -ItemType Directory -Force $outputDir | Out-Null
$sqlPath = Join-Path $outputDir "import-members.sql"
$source = Split-Path $AccessPath -Leaf
$now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$groups = @{}
$seenEmails = @{}
foreach ($row in $table.Rows) {
  $groupName = [string]$row["Group"]
  $groupId = GroupId $groupName
  if ($groupId) {
    $groups[$groupId] = $groupName.Trim()
  }
}

$lines = New-Object System.Collections.Generic.List[string]
foreach ($groupId in $groups.Keys) {
  $lines.Add("INSERT OR IGNORE INTO member_groups (id, name, description, created_at) VALUES ($(SqlText $groupId), $(SqlText $groups[$groupId]), 'Imported from Access T_Accounts', $(SqlText $now));")
}

foreach ($row in $table.Rows) {
  $sourcePid = [string]$row["PID"]
  if ([string]::IsNullOrWhiteSpace($sourcePid)) {
    $sourcePid = [string]$row["ID"]
  }

  $memberId = "access-$sourcePid"
  $fullName = [string]$row["FullName"]
  if ([string]::IsNullOrWhiteSpace($fullName)) {
    $fullName = (([string]$row["First Name"]) + " " + ([string]$row["Last Name"])).Trim()
  }
  if ([string]::IsNullOrWhiteSpace($fullName)) {
    $fullName = "Imported Member $sourcePid"
  }

  $groupId = GroupId ([string]$row["Group"])
  $cellPhone = [string]$row["Cell Tel"]
  $homePhone = [string]$row["Home Tel"]
  $phone = if (![string]::IsNullOrWhiteSpace($cellPhone)) { $cellPhone } else { $homePhone }
  $status = if ([bool]$row["External contact"]) { "visitor" } else { "active" }
  $email = ([string]$row["Email"]).Trim()
  if (![string]::IsNullOrWhiteSpace($email)) {
    $emailKey = $email.ToLowerInvariant()
    if ($seenEmails.ContainsKey($emailKey)) {
      $email = $null
    }
    else {
      $seenEmails[$emailKey] = $true
    }
  }

  $lines.Add(@"
INSERT INTO members (
  id, import_pid, name, first_name, last_name, partner, email, phone, home_phone,
  group_id, status, join_date, address, city, state_region, postal_code, notes,
  contact_confirmed, external_contact, import_source, created_at, updated_at
) VALUES (
  $(SqlText $memberId), $(SqlText $sourcePid), $(SqlText $fullName), $(SqlText $row["First Name"]), $(SqlText $row["Last Name"]), $(SqlText $row["Partner"]), $(SqlText $email), $(SqlText $phone), $(SqlText $homePhone),
  $(SqlText $groupId), $(SqlText $status), '2019-01-01', $(SqlText $row["Address"]), $(SqlText $row["City"]), $(SqlText $row["State"]), $(SqlText $row["Zip"]), $(SqlTextOrEmpty $row["Remark"]),
  $(SqlBool $row["Contact Confirmed"]), $(SqlBool $row["External contact"]), $(SqlText $source), $(SqlText $now), $(SqlText $now)
)
ON CONFLICT(id) DO UPDATE SET
  import_pid = excluded.import_pid,
  name = excluded.name,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  partner = excluded.partner,
  email = excluded.email,
  phone = excluded.phone,
  home_phone = excluded.home_phone,
  group_id = excluded.group_id,
  status = excluded.status,
  address = excluded.address,
  city = excluded.city,
  state_region = excluded.state_region,
  postal_code = excluded.postal_code,
  notes = excluded.notes,
  contact_confirmed = excluded.contact_confirmed,
  external_contact = excluded.external_contact,
  import_source = excluded.import_source,
  updated_at = excluded.updated_at;
"@)
}

Set-Content -Path $sqlPath -Value $lines -Encoding UTF8

$args = @("wrangler", "d1", "execute", "church-finance", "--file", $sqlPath)
if ($Remote) {
  $args += "--remote"
}
else {
  $args += "--local"
}

Write-Host "Generated $($table.Rows.Count) member import statements: $sqlPath"
& npx.cmd @args
