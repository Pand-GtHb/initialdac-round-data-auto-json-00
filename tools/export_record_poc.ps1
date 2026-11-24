param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [ValidateRange(1, 100000)][int]$Count = 300
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$inputFile = (Resolve-Path -LiteralPath $InputPath).Path
if ([IO.Path]::GetFullPath($OutputPath) -eq $inputFile) { throw 'Output must not overwrite the workbook.' }
$stream = [IO.File]::Open($inputFile, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
try { $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Read) }
catch { $stream.Dispose(); throw }
function Read-Part($name) {
    $entry = $zip.GetEntry($name)
    if ($null -eq $entry) { throw "Missing workbook part: $name" }
    $reader = New-Object IO.StreamReader($entry.Open())
    try { [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
}
function Cell-Text($cell) {
    if ($null -eq $cell) { return '' }
    if ($cell.t -eq 'e') { throw "Excel error at $($cell.r): $($cell.v)" }
    if ($cell.t -eq 's') { return $strings[[int]$cell.v] }
    if ($cell.t -eq 'inlineStr') {
        return ($cell.is.SelectNodes('.//*[local-name()="t" and not(parent::*[local-name()="rPh"])]') |
            ForEach-Object { $_.InnerText }) -join ''
    }
    return [string]$cell.v
}
function Normalize-RecordDate([string]$value, [string]$label) {
    if ([string]::IsNullOrWhiteSpace($value)) { throw "Missing date at $label" }
    $serial = [double]0
    if ([double]::TryParse($value, [Globalization.NumberStyles]::Float,
        [Globalization.CultureInfo]::InvariantCulture, [ref]$serial)) {
        return [datetime]::FromOADate($serial)
    }
    $parsed = [datetime]::MinValue
    $formats = [string[]]@('yyyy-MM-dd', 'yyyy/M/d', 'yyyy/MM/dd')
    if (-not [datetime]::TryParseExact($value, $formats, [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::None, [ref]$parsed)) {
        throw "Invalid date at $label`: $value"
    }
    return $parsed
}
try {
    $shared = Read-Part 'xl/sharedStrings.xml'
    $strings = @($shared.sst.si | ForEach-Object {
        ($_.SelectNodes('.//*[local-name()="t" and not(parent::*[local-name()="rPh"])]') |
            ForEach-Object { $_.InnerText }) -join ''
    })
    $workbook = Read-Part 'xl/workbook.xml'
    $sheet = @($workbook.workbook.sheets.sheet | Where-Object { $_.name -eq 'D' -or $_.name -eq ([string][char]0xFF24) })
    if ($sheet.Count -ne 1) { throw 'Expected exactly one D worksheet.' }
    $relationships = Read-Part 'xl/_rels/workbook.xml.rels'
    $id = $sheet[0].GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $target = ($relationships.Relationships.Relationship | Where-Object { $_.Id -eq $id }).Target
    if ($target.StartsWith('/')) { $target = $target.TrimStart('/') } else { $target = 'xl/' + $target }
    $xml = Read-Part $target
    $fields = @('card','myRank','myStars','opponentRank','opponentStars','opponent','homeArea',
        'homeShop','behavior','copiedRate','nameNote','note','team','teamShop','choice','random',
        'course','night','win','car','opponentCar','battleArea','battleShop','normalizedName',
        'date','season','round')
    $columnByField = @{
        card = 'BA'; myRank = 'BB'; myStars = 'BC'; opponentRank = 'D'; opponentStars = 'E'
        opponent = 'F'; homeArea = 'G'; homeShop = 'H'; behavior = 'I'; nameNote = 'AE'
        note = 'AF'; team = 'L'; teamShop = 'M'; choice = 'N'; random = 'O'; course = 'P'
        night = 'Q'; win = 'R'; car = 'S'; opponentCar = 'T'; battleArea = 'U'
        battleShop = 'V'; normalizedName = 'W'; date = 'AD'; season = 'AW'; round = 'AX'
    }
    $headerRow = $xml.worksheet.sheetData.row | Where-Object { $_.r -eq '9' }
    foreach ($pair in @{ J = 'CN追加メモ'; N = '選択権あり=1'; X = '仮No.'; AC = 'Data_No.'; AD = '日付'; BA = 'カード' }.GetEnumerator()) {
        $headerCell = $headerRow.c | Where-Object { $_.r -eq ($pair.Key + '9') }
        if ((Cell-Text $headerCell) -ne $pair.Value) { throw "Unexpected column header: $($pair.Key)9" }
    }
    $records = [Collections.Generic.List[object]]::new()
    $seenIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $placeholderOpponentRows = [Collections.Generic.List[string]]::new()
    $unknownOpponentPrefix = [string]::Concat([char]0x76F8, [char]0x624B, [char]0x4E0D, [char]0x660E, ' (Data_No. ')
    foreach ($row in $xml.worksheet.sheetData.row) {
        if ([int]$row.r -lt 10) { continue }
        $cells = @{}
        foreach ($cell in $row.c) { $cells[($cell.r -replace '\d','')] = $cell }
        $dataNo = (Cell-Text $cells['AC']).Trim()
        if (-not (Cell-Text $cells['BA']).Trim() -and -not (Cell-Text $cells['F']).Trim() -and
            -not (Cell-Text $cells['AD']).Trim()) { continue }
        if (-not $dataNo) { throw "Missing Data_No. at row $($row.r)" }
        if (-not $seenIds.Add($dataNo)) { throw "Duplicate Data_No. $dataNo at row $($row.r)" }
        $card = Cell-Text $cells['BA']
        if (-not $card.Trim()) { throw "Missing card at row $($row.r)" }
        $name = Cell-Text $cells['F']
        if (-not $name.Trim()) {
            $name = $unknownOpponentPrefix + $dataNo + ')'
            $placeholderOpponentRows.Add("row $($row.r) (Data_No. $dataNo)")
        }
        $values = [ordered]@{}
        foreach ($field in $fields) {
            $column = $columnByField[$field]
            $values[$field] = if ($column) { Cell-Text $cells[$column] } else { '' }
        }
        $values.opponent = $name
        if ($values.random -eq 'R') { $values.random = '1' }
        if ($values.night -eq [string][char]0x591C) { $values.night = '1' }
        if ([string]::IsNullOrWhiteSpace($values.win)) {         $values.win = '0' }
        $dateValue = $values.date
        $matchDate = Normalize-RecordDate $dateValue "row $($row.r)"
        $values.date = $matchDate.ToString('yyyy-MM-dd')
        $timestamp = $matchDate.ToString('yyyy-MM-dd') + 'T00:00:00+09:00'
        $record = [ordered]@{
            id = "excel-datano:$dataNo"
            status = 'pending'
            values = $values
            createdAt = $timestamp
            updatedAt = $timestamp
        }
        $temporaryNo = (Cell-Text $cells['X']).Trim()
        if ($temporaryNo) { $record.temporaryNo = $temporaryNo }
        $records.Add($record)
    }
    $selected = @($records | Select-Object -Last $Count)
    $output = [ordered]@{ schema = 1; masterType = 'OPPONENT_Master'; source = [IO.Path]::GetFileName($inputFile); records = $selected }
    $json = ConvertTo-Json -InputObject $output -Depth 8
    [IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputPath), $json, [Text.UTF8Encoding]::new($false))
    Write-Output "Exported $($selected.Count) of $($records.Count) source rows. Dates: $($selected[0].values.date) - $($selected[-1].values.date)"
    if ($placeholderOpponentRows.Count) {
        Write-Warning "Assigned unique unknown-opponent labels to: $($placeholderOpponentRows -join ', ')"
    }
} finally { $zip.Dispose() }
