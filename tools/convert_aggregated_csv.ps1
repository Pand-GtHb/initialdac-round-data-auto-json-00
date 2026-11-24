param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName Microsoft.VisualBasic

function ConvertTo-CsvRow([string[]]$Values) {
  $cells = foreach ($value in $Values) {
    $text = [string]$value
    if ($text -match '^(\s*)[=+\-@]' -or $text -match '^(\s*)''[=+\-@]') {
      $prefix = [regex]::Match($text, '^\s*').Value
      $text = $prefix + "'" + $text.Substring($prefix.Length)
    }
    '"' + $text.Replace('"', '""') + '"'
  }
  return ($cells -join ",")
}

function ConvertTo-IsoDate([string]$Value, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  if ($Value -match '^(\d{4})/(\d{1,2})/(\d{1,2})$') {
    $Value = '{0}-{1:D2}-{2:D2}' -f [int]$Matches[1], [int]$Matches[2], [int]$Matches[3]
  }
  $parsed = [datetime]::MinValue
  if (-not [datetime]::TryParseExact($Value, 'yyyy-MM-dd',
      [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$parsed)) {
    throw "$Label の日付「$Value」は未対応です。YYYY-MM-DD または YYYY/MM/DD を指定してください。"
  }
  return $parsed.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
}

$parser = [Microsoft.VisualBasic.FileIO.TextFieldParser]::new((Resolve-Path -LiteralPath $InputPath).Path, [Text.Encoding]::UTF8)
$parser.TextFieldType = [Microsoft.VisualBasic.FileIO.FieldType]::Delimited
$parser.SetDelimiters(',')
$parser.HasFieldsEnclosedInQuotes = $true
try {
  $sourceHeader = $parser.ReadFields()
  if ($null -eq $sourceHeader -or $sourceHeader.Length -lt 55) {
    throw "集計後CSVに必要な列がありません。Ｄシートの計算済み列（BC列まで）を含むCSVを指定してください。"
  }
  $requiredHeaders = @{
    0 = 'カード：入力'; 1 = 'ランク-自分：入力'; 2 = '星-自分：入力'; 3 = 'ランク：相手'
    4 = '星：相手'; 5 = '対戦相手'; 6 = '都道府県：所属店舗'; 7 = '所属店'
    8 = 'ブレフラ・譲り'; 9 = 'CN追加メモ'; 10 = '追加メモ'; 11 = 'チーム'
    12 = 'チーム所属'; 13 = '選択権あり=1'; 14 = 'ランダム'; 15 = 'コース'
    16 = '夜'; 17 = '勝=1'; 18 = '車種'; 19 = '車種：相手'
    20 = '都道府県：対戦店舗'; 21 = '対戦店舗'; 22 = '対戦相手：全角化'; 23 = '仮No.'
    24 = '日付：入力'; 25 = 'シーズン：入力'; 26 = 'ラウンド：入力'
    28 = 'Data_No.'; 29 = '日付'; 30 = 'CNメモ'; 31 = 'メモ'; 48 = 'シーズン'; 49 = 'ラウンド'
    52 = 'カード'; 53 = 'ランク：自分'; 54 = '星：自分'
  }
  foreach ($index in $requiredHeaders.Keys) {
    if ($sourceHeader[$index] -ne $requiredHeaders[$index]) {
      throw "集計後CSVの$($index + 1)列目が想定と異なります。期待値「$($requiredHeaders[$index])」、実際「$($sourceHeader[$index])」。"
    }
  }

  $formatHeader = @(
    'format_version', 'record_id', 'status', 'card', 'myRank', 'myStars', 'opponentRank',
    'opponentStars', 'opponent', 'homeArea', 'homeShop', 'behavior', 'copiedRate',
    'nameNote', 'note', 'team', 'teamShop', 'choice', 'random', 'course', 'night', 'win',
    'car', 'opponentCar', 'battleArea', 'battleShop', 'normalizedName', 'date', 'season', 'round', 'temporary_no'
  )
  $outputRows = [System.Collections.Generic.List[string]]::new()
  $outputRows.Add((ConvertTo-CsvRow $formatHeader))
  $rowNumber = 1
  $seen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $sourceIndexes = @(0,1,2,3,4,5,6,7,8,-1,9,10,11,12,13,14,15,16,17,18,19,20,21,22,24,25,26)
  $previousCard = ''
  while (-not $parser.EndOfData) {
    $source = $parser.ReadFields()
    $rowNumber++
    if ($null -eq $source -or $source.Length -eq 1 -and [string]::IsNullOrWhiteSpace($source[0])) { continue }
    if ($source.Length -lt 55) { throw "$rowNumber 行目の列数が不足しています。" }
    $dataNo = $source[28].Trim()
    if (-not $dataNo) { throw "$rowNumber 行目のData_No.が空欄です。重複防止のため変換できません。" }
    $recordId = "excel-datano:$dataNo"
    if (-not $seen.Add($recordId)) { throw "$rowNumber 行目のData_No.「$dataNo」が重複しています。" }

    $values = [System.Collections.Generic.List[string]]::new()
    foreach ($index in $sourceIndexes) {
      if ($index -lt 0) { $values.Add('') } else { $values.Add([string]$source[$index]) }
    }
    if (-not $values[0].Trim()) { $values[0] = $source[52] }
    if (-not $values[1]) { $values[1] = $source[53] }
    if (-not $values[2]) { $values[2] = $source[54] }
    if (-not $values[10]) { $values[10] = $source[30] }
    if (-not $values[11]) { $values[11] = $source[31] }
    if ($values[0].Trim()) {
      $previousCard = $values[0]
    } elseif ($previousCard) {
      $values[0] = $previousCard
    }
    $values[24] = ConvertTo-IsoDate $values[24] "$rowNumber 行目"
    if (-not $values[24]) { $values[24] = ConvertTo-IsoDate $source[29] "$rowNumber 行目" }
    if (-not $values[24]) { throw "$rowNumber 行目に日付がありません。" }
    if (-not $values[25]) { $values[25] = [string]$source[48] }
    if (-not $values[26]) { $values[26] = [string]$source[49] }
    if ($values[15] -eq 'R') { $values[15] = '1' }
    if ($values[17] -eq '夜') { $values[17] = '1' }
    if ([string]::IsNullOrWhiteSpace($values[18])) { $values[18] = '0' }
    $status = if ($values[7].Trim() -and $values[18].Trim() -match '^[01]$') { 'confirmed' } else { 'pending' }
    $row = @('1', $recordId, $status) + $values.ToArray() + @($source[23])
    $outputRows.Add((ConvertTo-CsvRow $row))
  }
}
finally {
  $parser.Close()
}

if ($outputRows.Count -eq 1) { throw "入力CSVに対戦データがありません。" }
$destination = [IO.Path]::GetFullPath($OutputPath)
$directory = [IO.Path]::GetDirectoryName($destination)
if (-not [IO.Directory]::Exists($directory)) { [IO.Directory]::CreateDirectory($directory) | Out-Null }
[IO.File]::WriteAllText($destination, ($outputRows -join "`r`n") + "`r`n", [Text.UTF8Encoding]::new($true))
Write-Output "$($outputRows.Count - 1)件を対戦記録CSV v1へ変換しました。"
