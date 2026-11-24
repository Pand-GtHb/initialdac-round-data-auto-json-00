Attribute VB_Name = "DacMasterExport"
Option Explicit

Private ids As Object

Private Sub Fail(ByVal message As String)
    Err.Raise vbObjectError + 501, , message
End Sub

Private Function Dict() As Object
    Set Dict = CreateObject("Scripting.Dictionary")
    Dict.CompareMode = vbBinaryCompare
End Function

Private Sub PutObject(ByVal parent As Object, ByVal key As String, ByVal value As Object)
    If parent.Exists(key) Then parent.Remove key
    parent.Add key, value
End Sub

Private Function Required(ByVal item As Object, ByVal key As String) As Variant
    If Not item.Exists(key) Then Fail "基準JSONに必要な項目がありません: " & key
    If IsObject(item(key)) Then
        Set Required = item(key)
    Else
        Required = item(key)
    End If
End Function

Private Function Obj(ByVal item As Object, ByVal key As String, ByVal expected As String) As Object
    If Not item.Exists(key) Then Fail "基準JSONに必要な項目がありません: " & key
    If Not IsObject(item(key)) Then Fail "基準JSONの項目が不正です: " & key
    Set Obj = item(key)
    If TypeName(Obj) <> expected Then Fail "基準JSONの項目の種類が不正です: " & key
End Function

Private Sub CopyCollectionOrEmpty(ByVal source As Object, ByVal sourceKey As String, _
                                  ByVal destination As Object, ByVal destinationKey As String)
    Dim values As Collection
    If source.Exists(sourceKey) Then
        Set values = Obj(source, sourceKey, "Collection")
    Else
        Set values = New Collection
    End If
    PutObject destination, destinationKey, values
End Sub

Private Function TextValue(ByVal value As Variant, ByVal location As String) As String
    If IsError(value) Then Fail "Excelのエラー値: " & location
    If IsNull(value) Or IsEmpty(value) Then Exit Function
    If IsObject(value) Or IsArray(value) Then Fail "未対応の値: " & location
    TextValue = CStr(value)
End Function

Private Function CellText(ByVal cell As Range) As String
    CellText = TextValue(cell.Value2, cell.Parent.Name & "!" & cell.Address(False, False))
End Function

Private Function OptionalText(ByVal value As String) As Variant
    If Len(value) = 0 Then OptionalText = Null Else OptionalText = value
End Function

Private Function OptionalNumber(ByVal cell As Range) As Variant
    Dim value As Variant
    value = cell.Value2
    If IsError(value) Then Fail "Excelのエラー値: " & cell.Parent.Name & "!" & cell.Address(False, False)
    If Len(TextValue(value, cell.Address(False, False))) = 0 Then
        OptionalNumber = Null
    ElseIf IsNumeric(value) Then
        OptionalNumber = CDbl(value)
    Else
        Fail "数値ではありません: " & cell.Parent.Name & "!" & cell.Address(False, False)
    End If
End Function

Private Function OptionalMetric(ByVal cell As Range) As Variant
    Dim value As Variant, text As String
    value = cell.Value2
    text = TextValue(value, cell.Parent.Name & "!" & cell.Address(False, False))
    If Len(text) = 0 Then
        OptionalMetric = Null
    ElseIf IsNumeric(value) Then
        OptionalMetric = CDbl(value)
    Else
        OptionalMetric = text
    End If
End Function

Private Function DisplayText(ByVal cell As Range) As String
    Dim value As String
    If IsError(cell.Value2) Then Fail "Excelのエラー値: " & cell.Parent.Name & "!" & cell.Address(False, False)
    value = CStr(cell.Text)
    If InStr(value, "#") > 0 Then Fail "番号を表示できません。列幅を広げて保存してください: " & cell.Address(False, False)
    DisplayText = value
End Function

Private Function IsoDate(ByVal cell As Range) As String
    Dim value As Variant
    value = cell.Value2
    If IsError(value) Then Fail "日付がエラーです: " & cell.Address(False, False)
    If Not IsNumeric(value) Then Fail "日付がありません: " & cell.Address(False, False)
    If CDbl(value) < 61 Or CDbl(value) <> Fix(CDbl(value)) Or CDbl(value) > 2958465 Then
        Fail "日付が不正です: " & cell.Address(False, False)
    End If
    IsoDate = Format$(DateAdd("d", CLng(value), DateSerial(1899, 12, 30)), "yyyy-mm-dd")
End Function

Private Function Source(ByVal sheet As Worksheet, ByVal first As Range, Optional ByVal last As Range) As String
    Source = sheet.Name & "!" & first.Address(False, False)
    If Not last Is Nothing Then Source = Source & ":" & last.Address(False, False)
End Function

Private Function IndexBy(ByVal items As Collection, ByVal field As String, ByVal label As String) As Object
    Dim result As Object, item As Variant, key As String, id As String
    Set result = Dict()
    For Each item In items
        If Not IsObject(item) Then Fail label & "の基準JSONが不正です"
        If TypeName(item) <> "Dictionary" Then Fail label & "の基準JSONが不正です"
        key = TextValue(Required(item, field), label)
        id = TextValue(Required(item, "id"), label)
        If Len(key) = 0 Or Len(id) = 0 Or result.Exists(key) Or ids.Exists(id) Then
            Fail label & "のキーまたはIDが空か重複しています"
        End If
        result.Add key, item
        ids.Add id, True
    Next item
    Set IndexBy = result
End Function

Private Function IndexStores(ByVal items As Collection) As Object
    Dim result As Object, item As Variant, key As String, id As String
    Set result = Dict()
    For Each item In items
        If Not IsObject(item) Then Fail "店舗の基準JSONが不正です"
        key = TextValue(Required(item, "areaId"), "店舗") & vbNullChar & TextValue(Required(item, "label"), "店舗")
        id = TextValue(Required(item, "id"), "店舗")
        If Len(id) = 0 Or result.Exists(key) Or ids.Exists(id) Then Fail "店舗のキーまたはIDが重複しています"
        result.Add key, item
        ids.Add id, True
    Next item
    Set IndexStores = result
End Function

Private Function Take(ByVal index As Object, ByVal key As String, ByVal prefix As String) As Object
    Dim item As Object, id As String, i As Long, code As Long
    If Len(key) = 0 Then Fail prefix & "の照合キーが空です"
    If index.Exists(key) Then
        Set item = index(key)
        index.Remove key
    Else
        Set item = Dict()
        id = prefix & "-excel-"
        For i = 1 To Len(key)
            code = AscW(Mid$(key, i, 1))
            If code < 0 Then code = code + 65536
            id = id & Right$("0000" & Hex$(code), 4)
        Next i
        If ids.Exists(id) Then Fail prefix & "の新しいIDが基準JSONのIDと重複しています"
        ids.Add id, True
        item.Add "id", id
    End If
    Set Take = item
End Function

Private Sub AssertNoMissing(ByVal index As Object, ByVal label As String)
    Dim key As Variant, examples As String, count As Long
    If index.Count = 0 Then Exit Sub
    For Each key In index.Keys
        If count < 5 Then examples = examples & vbCrLf & "・" & Replace(CStr(key), vbNullChar, " / ")
        count = count + 1
    Next key
    Fail label & "に削除または改名の可能性があります（" & CStr(index.Count) & "件）。IDの対応を確認してください。" & examples
End Sub

Private Function LastRow(ByVal sheet As Worksheet, ByVal column As Long, ByVal minimum As Long) As Long
    LastRow = sheet.Cells(sheet.Rows.Count, column).End(xlUp).Row
    If LastRow < minimum Then LastRow = minimum
    If LastRow > 10000 Then Fail sheet.Name & "の対象範囲が大きすぎます。"
End Function

Private Sub UniqueAdd(ByVal seen As Object, ByVal key As String, ByVal label As String)
    If Len(key) = 0 Or seen.Exists(key) Then Fail label & "の値が空か重複しています"
    seen.Add key, True
End Sub

Private Function TextList(ByVal sheet As Worksheet, ByVal column As Long, ByVal start As Long) As Collection
    Dim result As New Collection, seen As Object, r As Long, value As String
    Set seen = Dict()
    For r = start To LastRow(sheet, column, start)
        value = CellText(sheet.Cells(r, column))
        If Len(value) > 0 And Not seen.Exists(value) Then
            seen.Add value, True
            result.Add value
        End If
    Next r
    Set TextList = result
End Function

Private Function TableTextList(ByVal sheet As Worksheet, ByVal tableName As String, ByVal column As Long) As Collection
    Dim table As ListObject, result As New Collection, seen As Object, cell As Range, value As String
    Set table = sheet.ListObjects(tableName)
    If column < 1 Or column > table.ListColumns.Count Then Fail tableName & "の列が不足しています"
    Set seen = Dict()
    If Not table.DataBodyRange Is Nothing Then
        For Each cell In table.ListColumns(column).DataBodyRange.Cells
            value = CellText(cell)
            If Len(value) > 0 And Not seen.Exists(value) Then
                seen.Add value, True
                result.Add value
            End If
        Next cell
    End If
    Set TableTextList = result
End Function

Private Function AllDashes(ByVal value As String) As Boolean
    Dim i As Long
    If Len(value) < 5 Then Exit Function
    For i = 1 To Len(value)
        If Mid$(value, i, 1) <> "-" Then Exit Function
    Next i
    AllDashes = True
End Function

Private Function ManufacturerName(ByVal value As String) As String
    If Len(value) < 9 Then Exit Function
    If Left$(value, 4) <> "--- " Or Right$(value, 4) <> " ---" Then Exit Function
    ManufacturerName = Trim$(Mid$(value, 5, Len(value) - 8))
End Function

Private Function ReadUtf8(ByVal path As String) As String
    Dim stream As Object
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2
    stream.Charset = "utf-8"
    stream.Open
    stream.LoadFromFile path
    ReadUtf8 = stream.ReadText
    stream.Close
End Function

Private Sub SaveAsciiJson(ByVal path As String, ByVal text As String)
    Dim fso As Object, file As Object, temp As String, parsed As Object
    Dim saved As Boolean, message As String
    On Error GoTo Failed
    If LCase$(Right$(path, 5)) <> ".json" Then Fail "保存先の拡張子を .json にしてください"
    Set fso = CreateObject("Scripting.FileSystemObject")
    If fso.FileExists(path) Then Fail "保存先に同名のファイルがあります: " & path
    temp = path & ".partial"
    If fso.FileExists(temp) Then Fail "一時ファイルが既にあります: " & temp
    Set file = fso.CreateTextFile(temp, False, False)
    saved = True
    file.Write text
    file.Close
    Set file = Nothing
    Set parsed = DacParseJson(ReadUtf8(temp))
    fso.MoveFile temp, path
    Exit Sub
Failed:
    message = Err.Description
    On Error Resume Next
    If Not file Is Nothing Then file.Close
    If saved Then
        Err.Clear
        If fso.FileExists(temp) Then fso.DeleteFile temp, True
        If Err.Number <> 0 Then message = message & vbCrLf & "一時ファイルを削除できません: " & temp & " / " & Err.Description
    End If
    On Error GoTo 0
    Fail message
End Sub

Private Function GetMaster() As Workbook
    Dim wb As Workbook
    For Each wb In Application.Workbooks
        If StrComp(wb.Name, "Data-シーズン6.xlsx", vbTextCompare) = 0 Then
            If wb Is ThisWorkbook Then Fail "マスターとツールを別のブックにしてください"
            If Not wb.Saved Then Fail "マスターを再計算し、保存してから実行してください"
            If Application.CalculationState <> xlDone Then Fail "Excelの再計算が完了していません"
            If wb.Date1904 Then Fail "1904年日付システムには対応していません"
            Set GetMaster = wb
            Exit Function
        End If
    Next wb
    Fail "Data-シーズン6.xlsx を同じExcelで開き、再計算して保存してください"
End Function

Public Sub CARD_Master出力()
    ExportOne "CARD_Master"
End Sub

Public Sub ROUND_Master出力()
    ExportOne "ROUND_Master"
End Sub

Public Sub CAR_Master出力()
    ExportOne "CAR_Master"
End Sub

Public Sub STORE_Master出力()
    ExportOne "STORE_Master"
End Sub

Public Sub RANK_Master出力()
    ExportOne "RANK_Master"
End Sub

Public Sub CORD_Master出力()
    ExportOne "CORD_Master"
End Sub

Public Sub AREA_Master出力()
    ExportOne "AREA_Master"
End Sub

Public Sub TEAM_Master出力()
    ExportOne "TEAM_Master"
End Sub

Private Function MasterTypes() As Variant
    MasterTypes = Array("AREA_Master", "CAR_Master", "ROUND_Master", "STORE_Master", _
                        "TEAM_Master", "CARD_Master", "RANK_Master", "CORD_Master")
End Function

Private Function MasterFileName(ByVal masterType As String) As String
    Select Case masterType
        Case "STORE_Master": MasterFileName = "01_STORE_Master.json"
        Case "TEAM_Master": MasterFileName = "02_TEAM_Master.json"
        Case "CARD_Master": MasterFileName = "03_CARD_Master.json"
        Case "OPPONENT_Master": MasterFileName = "04_OPPONENT_Master.json"
        Case "ROUND_Master": MasterFileName = "05_ROUND_Master.json"
        Case "CAR_Master": MasterFileName = "06_CAR_Master.json"
        Case "RANK_Master": MasterFileName = "07_RANK_Master.json"
        Case "AREA_Master": MasterFileName = "08_AREA_Master.json"
        Case "CORD_Master": MasterFileName = "09_CODE_Master.json"
        Case Else: Fail "Unknown master type: " & masterType
    End Select
End Function

Private Function ExistingMasterPath(ByVal fso As Object, ByVal folder As String, _
                                    ByVal masterType As String) As String
    Dim path As String
    path = fso.BuildPath(folder, MasterFileName(masterType))
    If Not fso.FileExists(path) Then path = fso.BuildPath(folder, masterType & ".json")
    If Not fso.FileExists(path) Then Fail "Required master file not found: " & _
        fso.BuildPath(folder, MasterFileName(masterType))
    ExistingMasterPath = path
End Function

Private Function SelectJson(ByVal title As String) As String
    Dim selected As Variant
    selected = Application.GetOpenFilename("JSON ファイル (*.json), *.json", , title)
    If VarType(selected) = vbBoolean Then Exit Function
    SelectJson = CStr(selected)
End Function

Private Function LoadMasterData(ByVal path As String, ByVal masterType As String) As Object
    Dim root As Object, common As Object, personal As Object, data As Object, kind As String
    Set root = DacParseJson(ReadUtf8(path))
    kind = TextValue(Required(root, "kind"), "kind")
    If TextValue(Required(root, "schemaVersion"), "schemaVersion") <> "1" Then Fail "JSONのバージョンが不正です: " & path
    If kind = "dac-master" Then
        If TextValue(Required(root, "masterType"), "masterType") <> masterType Then
            Fail masterType & "ではないJSONが選択されました: " & path
        End If
        Set data = Obj(root, "data", "Dictionary")
        If masterType = "CARD_Master" Then RemoveCardNumbers data
        Set LoadMasterData = data
        Exit Function
    End If
    If kind <> "dac-settings-bundle" Then Fail "対応していない基準JSONです: " & path
    Set common = Obj(root, "common", "Dictionary")
    Set personal = Obj(root, "personal", "Dictionary")
    If TextValue(Required(common, "kind"), "kind") <> "dac-settings-design-draft" Or _
       TextValue(Required(personal, "kind"), "kind") <> "dac-personal-settings-design-draft" Or _
       TextValue(Required(common, "schemaVersion"), "schemaVersion") <> "1" Or _
       TextValue(Required(personal, "schemaVersion"), "schemaVersion") <> "1" Then
        Fail "基準JSONの共通設定・個人設定が不正です: " & path
    End If
    Set data = Dict()
    Select Case masterType
        Case "CAR_Master"
            PutObject data, "vehicles", Obj(common, "vehicles", "Collection")
            CopyCollectionOrEmpty common, "vehicleDividers", data, "vehicleDividers"
        Case "ROUND_Master"
            PutObject data, "courses", Obj(common, "courses", "Collection")
            PutObject data, "seasons", Obj(common, "seasons", "Collection")
            PutObject data, "rounds", Obj(common, "rounds", "Collection")
            CopyCollectionOrEmpty common, "roundLabels", data, "roundLabels"
        Case "AREA_Master": PutObject data, "areas", Obj(common, "areas", "Collection")
        Case "STORE_Master": PutObject data, "stores", Obj(common, "stores", "Collection")
        Case "TEAM_Master": PutObject data, "teams", Obj(personal, "teams", "Collection")
        Case "CARD_Master": PutObject data, "cards", Obj(personal, "cards", "Collection")
        Case "RANK_Master"
            CopyCollectionOrEmpty common, "rankLabels", data, "rankLabels"
            CopyCollectionOrEmpty common, "starLabels", data, "starLabels"
            CopyCollectionOrEmpty common, "rankLevels", data, "rankLevels"
        Case "CORD_Master"
            CopyCollectionOrEmpty common, "behaviorCodes", data, "behaviorCodes"
        Case Else: Fail "未対応のマスターです: " & masterType
    End Select
    If masterType = "CARD_Master" Then RemoveCardNumbers data
    Set LoadMasterData = data
End Function

Private Sub RemoveCardNumbers(ByVal data As Object)
    Dim card As Variant
    For Each card In Obj(data, "cards", "Collection")
        If card.Exists("number") Then card.Remove "number"
    Next card
End Sub

Private Function LabelIds(ByVal items As Collection, ByVal description As String, _
                          Optional ByVal allowDuplicateLabels As Boolean = False) As Object
    Dim result As Object, seenIds As Object, item As Variant, label As String, id As String
    Set result = Dict()
    Set seenIds = Dict()
    For Each item In items
        If Not IsObject(item) Then Fail description & "の参照JSONが不正です"
        If TypeName(item) <> "Dictionary" Then Fail description & "の参照JSONが不正です"
        label = TextValue(Required(item, "label"), description)
        id = TextValue(Required(item, "id"), description)
        If Len(label) = 0 Or Len(id) = 0 Or seenIds.Exists(id) Then Fail description & "の名前またはIDが空か重複しています"
        seenIds.Add id, True
        If result.Exists(label) Then
            If Not allowDuplicateLabels Then Fail description & "の名前が重複しています: " & label
            result(label) = ""
        Else
            result.Add label, id
        End If
    Next item
    Set LabelIds = result
End Function

Private Function MakeMaster(ByVal wb As Workbook, ByVal masterType As String, _
                            ByVal old As Object, ByVal dependencies As Object) As Object
    Dim data As Object, root As Object, lookup As Object, lookup2 As Object, lookup3 As Object
    Dim index As Object, index2 As Object, index3 As Object, sheet As Worksheet
    Set ids = Dict()
    Set data = Dict()
    Select Case masterType
        Case "CAR_Master"
            Set lookup = Dict()
            Set index = IndexBy(Obj(old, "vehicles", "Collection"), "label", "車種")
            PutObject data, "vehicles", ExportVehicles(wb.Worksheets("車種"), index, lookup, data)
        Case "AREA_Master"
            Set lookup = Dict()
            Set index = IndexBy(Obj(old, "areas", "Collection"), "legacyCode", "エリア")
            PutObject data, "areas", ExportAreas(wb.Worksheets("その他設定"), index, lookup)
        Case "STORE_Master"
            Set lookup = LabelIds(Obj(dependencies("AREA_Master"), "areas", "Collection"), "エリア")
            Set lookup2 = Dict()
            Set index = IndexStores(Obj(old, "stores", "Collection"))
            PutObject data, "stores", ExportStores(wb.Worksheets("都道府県別店舗"), index, lookup, lookup2)
        Case "TEAM_Master"
            Set index = IndexBy(Obj(old, "teams", "Collection"), "label", "チーム")
            PutObject data, "teams", ExportTeams(wb.Worksheets("カード表"), index)
        Case "CARD_Master"
            Set lookup = LabelIds(Obj(dependencies("CAR_Master"), "vehicles", "Collection"), "車種")
            Set lookup2 = LabelIds(Obj(dependencies("TEAM_Master"), "teams", "Collection"), "チーム")
            Set index = IndexBy(Obj(old, "cards", "Collection"), "label", "カード")
            PutObject data, "cards", ExportCards(wb.Worksheets("カード表"), index, lookup, lookup2)
        Case "ROUND_Master"
            Set lookup = Dict()
            Set lookup2 = Dict()
            Set index = IndexBy(Obj(old, "courses", "Collection"), "legacyNo", "コース")
            Set index2 = IndexBy(Obj(old, "seasons", "Collection"), "label", "シーズン")
            Set index3 = IndexBy(Obj(old, "rounds", "Collection"), "sourceLabel", "ラウンド")
            Set sheet = wb.Worksheets("ラウンド設定")
            PutObject data, "courses", ExportCourses(sheet, index, lookup)
            PutObject data, "seasons", ExportSeasons(sheet, index2, lookup2)
            PutObject data, "rounds", ExportRounds(sheet, index3, lookup2, lookup)
            PutObject data, "roundLabels", TableTextList(sheet, "リスト_ラウンド", 1)
        Case "RANK_Master"
            Set sheet = wb.Worksheets("その他設定")
            PutObject data, "rankLabels", TableTextList(sheet, "リスト_ランク", 1)
            PutObject data, "starLabels", TableTextList(sheet, "リスト_ランク", 2)
            PutObject data, "rankLevels", ExportRankLevels(sheet)
        Case "CORD_Master"
            PutObject data, "behaviorCodes", ExportBehavior(wb.Worksheets("その他設定"))
        Case Else: Fail "未対応のマスターです: " & masterType
    End Select
    Set root = Dict()
    root.Add "kind", "dac-master"
    root.Add "schemaVersion", 1
    root.Add "masterType", masterType
    root.Add "sourceWorkbook", wb.Name
    root.Add "extractedAtLocal", Format$(Now, "yyyy-mm-dd\Thh:nn:ss")
    PutObject root, "data", data
    Set MakeMaster = root
End Function

Private Function MasterEnvelope(ByVal masterType As String, ByVal data As Object, _
                                ByVal sourceWorkbook As String) As Object
    Dim root As Object
    Set root = Dict()
    root.Add "kind", "dac-master"
    root.Add "schemaVersion", 1
    root.Add "masterType", masterType
    root.Add "sourceWorkbook", sourceWorkbook
    root.Add "extractedAtLocal", Format$(Now, "yyyy-mm-dd\Thh:nn:ss")
    PutObject root, "data", data
    Set MasterEnvelope = root
End Function

Private Sub CheckMasterUnchanged(ByVal wb As Workbook)
    If Not wb.Saved Or Application.CalculationState <> xlDone Then Fail "出力中にマスターが変更されました。保存してやり直してください。"
End Sub

Private Function SnapshotPath(ByVal fso As Object, ByVal baseline As String, _
                              ByVal baselineKind As String, ByVal masterType As String) As String
    Dim path As String
    If baselineKind = "dac-settings-bundle" Then
        SnapshotPath = baseline
        Exit Function
    End If
    path = ExistingMasterPath(fso, fso.GetParentFolderName(baseline), masterType)
    SnapshotPath = path
End Function

Private Function LoadSnapshot(ByVal fso As Object, ByVal baseline As String, _
                              ByVal baselineKind As String, ByVal masterType As String) As Object
    Set LoadSnapshot = LoadMasterData(SnapshotPath(fso, baseline, baselineKind, masterType), masterType)
End Function

Private Function SnapshotText(ByVal fso As Object, ByVal baseline As String, _
                              ByVal baselineKind As String, ByVal masterType As String, _
                              ByVal data As Object) As String
    Dim root As Object
    If baselineKind = "dac-master" And masterType = "CARD_Master" Then
        Set root = DacParseJson(ReadUtf8(SnapshotPath(fso, baseline, baselineKind, masterType)))
        PutObject root, "data", data
        SnapshotText = DacWriteJson(root)
    ElseIf baselineKind = "dac-master" Then
        SnapshotText = ReadUtf8(SnapshotPath(fso, baseline, baselineKind, masterType))
    Else
        SnapshotText = DacWriteJson(MasterEnvelope(masterType, data, "dac-settings-bundle"))
    End If
End Function

Private Sub ExportMasterGroup(ByVal groupName As String, ByVal selectedTypes As Object, _
                              ByVal includeOpponent As Boolean)
    Dim wb As Workbook, fso As Object, first As Object, root As Object
    Dim old As Object, data As Object, dependencies As Object, outputs As Object
    Dim dialog As Object, baseline As String, baselineKind As String
    Dim folder As String, target As String, staging As String, path As String
    Dim typ As Variant, message As String, created As Boolean, opponentCount As Long
    On Error GoTo Failed

    Set wb = GetMaster()
    baseline = SelectJson("前回のマスターファイル、または初回の設定JSONを選択")
    If Len(baseline) = 0 Then Exit Sub
    Set first = DacParseJson(ReadUtf8(baseline))
    baselineKind = TextValue(Required(first, "kind"), "kind")
    If baselineKind <> "dac-master" Then
        Fail "日次・タイミング更新には、全マスター出力済みフォルダー内のJSONを選択してください。初回は全マスターを出力してください。"
    End If

    Set fso = CreateObject("Scripting.FileSystemObject")
    Set dependencies = Dict()
    Set outputs = Dict()
    For Each typ In MasterTypes()
        Set data = LoadSnapshot(fso, baseline, baselineKind, CStr(typ))
        If selectedTypes.Exists(CStr(typ)) Then
            If CStr(typ) = "RANK_Master" Or CStr(typ) = "CORD_Master" Then
                Set old = Dict()
            Else
                Set old = data
            End If
            Set root = MakeMaster(wb, CStr(typ), old, dependencies)
            PutObject dependencies, CStr(typ), Obj(root, "data", "Dictionary")
            outputs.Add CStr(typ), DacWriteJson(root)
        Else
            PutObject dependencies, CStr(typ), data
            outputs.Add CStr(typ), SnapshotText(fso, baseline, baselineKind, CStr(typ), data)
        End If
    Next typ
    CheckMasterUnchanged wb

    Set dialog = Application.FileDialog(4)
    dialog.Title = groupName & "マスターを保存する親フォルダーを選択"
    If dialog.Show <> -1 Then Exit Sub
    folder = CStr(dialog.SelectedItems(1))
    target = fso.BuildPath(folder, "DAC_" & groupName & "_" & Format$(Now, "yyyymmdd_hhnnss"))
    staging = target & ".partial"
    If fso.FolderExists(target) Or fso.FolderExists(staging) Then Fail "同名の出力フォルダーがあります: " & target

    CheckMasterUnchanged wb
    fso.CreateFolder staging
    created = True
    For Each typ In MasterTypes()
        SaveAsciiJson fso.BuildPath(staging, MasterFileName(CStr(typ))), CStr(outputs(CStr(typ)))
    Next typ
    If includeOpponent Then
        opponentCount = OPPONENT_Master_ExportToPath(fso.BuildPath(staging, MasterFileName("OPPONENT_Master")))
    End If
    CheckMasterUnchanged wb
    fso.MoveFolder staging, target
    created = False
    If includeOpponent Then
        MsgBox groupName & "マスターを出力しました。" & vbCrLf & target & vbCrLf & _
               "日次取込ではSTORE、TEAM、CARD、OPPONENT_Masterの４ファイルを選択してください。" & vbCrLf & _
               "OPPONENT_Master: " & opponentCount & "件", vbInformation
    Else
        MsgBox groupName & "マスターを出力しました。" & vbCrLf & target & vbCrLf & _
               "変更したマスターJSONだけをアプリで選択してください。", vbInformation
    End If
    Exit Sub
Failed:
    message = Err.Description
    If created Then
        On Error Resume Next
        If fso.FolderExists(staging) Then fso.DeleteFolder staging, True
        If Err.Number <> 0 Then message = message & vbCrLf & "一時フォルダーを削除できません: " & staging & " / " & Err.Description
        On Error GoTo 0
    End If
    MsgBox groupName & "マスターを出力できませんでした。" & vbCrLf & message, vbExclamation
End Sub

Public Sub 日次マスター出力()
    Dim selected As Object
    Set selected = Dict()
    selected.Add "STORE_Master", True
    selected.Add "TEAM_Master", True
    selected.Add "CARD_Master", True
    ExportMasterGroup "Daily", selected, True
End Sub

Public Sub タイミングマスター出力()
    Dim types As Variant, selected As Object, choice As Variant
    Dim prompt As String, tokens As Variant, token As Variant
    Dim index As Long, number As Long, masterType As String
    On Error GoTo Failed
    types = Array("ROUND_Master", "CAR_Master", "RANK_Master", "AREA_Master", "CORD_Master")
    prompt = "更新するマスター番号をカンマ区切りで入力してください。" & vbCrLf & vbCrLf & _
             "1: ROUND_Master" & vbCrLf & "2: CAR_Master" & vbCrLf & _
             "3: RANK_Master" & vbCrLf & "4: AREA_Master" & vbCrLf & "5: CORD_Master"
    choice = Application.InputBox(prompt, "タイミング更新", Type:=2)
    If VarType(choice) = vbBoolean Then Exit Sub
    Set selected = Dict()
    tokens = Split(CStr(choice), ",")
    For Each token In tokens
        If Not IsNumeric(Trim$(CStr(token))) Then Fail "1～5の番号をカンマ区切りで入力してください"
        If CDbl(Trim$(CStr(token))) <> Fix(CDbl(Trim$(CStr(token)))) Then Fail "1～5の整数を入力してください"
        number = CLng(Trim$(CStr(token)))
        If number < 1 Or number > 5 Then Fail "番号は1～5で指定してください"
        index = number - 1
        masterType = CStr(types(index))
        If selected.Exists(masterType) Then Fail "同じ番号が重複しています: " & number
        selected.Add masterType, True
    Next token
    ExportMasterGroup "Timing", selected, False
    Exit Sub
Failed:
    MsgBox "タイミングマスターを出力できませんでした。" & vbCrLf & Err.Description, vbExclamation
End Sub

Private Sub LoadDependency(ByVal dependencies As Object, ByVal masterType As String)
    Dim path As String
    path = SelectJson("参照先の " & masterType & " または従来の設定JSONを選択")
    If Len(path) = 0 Then Fail "参照先 " & masterType & " の選択が中止されました"
    PutObject dependencies, masterType, LoadMasterData(path, masterType)
End Sub

Private Sub ExportOne(ByVal masterType As String)
    Dim wb As Workbook, old As Object, dependencies As Object, root As Object
    Dim baseline As String, output As Variant, text As String
    On Error GoTo Failed
    If masterType = "OPPONENT_Master" Then
        OPPONENT_Master_Export
        Exit Sub
    End If
    Set wb = GetMaster()
    If masterType = "RANK_Master" Or masterType = "CORD_Master" Then
        Set old = Dict()
    Else
        baseline = SelectJson(masterType & " の前回JSON、または初回の従来設定JSONを選択")
        If Len(baseline) = 0 Then Exit Sub
        Set old = LoadMasterData(baseline, masterType)
    End If
    Set dependencies = Dict()
    Select Case masterType
        Case "STORE_Master": LoadDependency dependencies, "AREA_Master"
        Case "CARD_Master"
            LoadDependency dependencies, "CAR_Master"
            LoadDependency dependencies, "TEAM_Master"
    End Select
    Set root = MakeMaster(wb, masterType, old, dependencies)
    text = DacWriteJson(root)
    CheckMasterUnchanged wb
    output = Application.GetSaveAsFilename(MasterFileName(masterType), "JSON ファイル (*.json), *.json")
    If VarType(output) = vbBoolean Then Exit Sub
    CheckMasterUnchanged wb
    SaveAsciiJson CStr(output), text
    MsgBox masterType & " を出力しました。" & vbCrLf & CStr(output) & vbCrLf & _
           "個人情報を含むファイルは公開しないでください。", vbInformation
    Exit Sub
Failed:
    MsgBox masterType & " を出力できませんでした。" & vbCrLf & Err.Description, vbExclamation
End Sub

Public Sub 全マスター出力()
    Dim wb As Workbook, fso As Object, first As Object, old As Object, root As Object
    Dim outputs As Object, dependencies As Object, dialog As Object, typ As Variant
    Dim baseline As String, folder As String, target As String, staging As String, path As String
    Dim message As String, created As Boolean, opponentCount As Long
    On Error GoTo Failed
    Set wb = GetMaster()
    baseline = SelectJson("従来設定JSON、または前回のマスターファイルのいずれかを選択")
    If Len(baseline) = 0 Then Exit Sub
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set first = DacParseJson(ReadUtf8(baseline))
    Set outputs = Dict()
    Set dependencies = Dict()
    For Each typ In MasterTypes()
        If CStr(typ) = "RANK_Master" Or CStr(typ) = "CORD_Master" Then
            Set old = Dict()
        Else
            If TextValue(Required(first, "kind"), "kind") = "dac-settings-bundle" Then
                path = baseline
            Else
                path = ExistingMasterPath(fso, fso.GetParentFolderName(baseline), CStr(typ))
            End If
            Set old = LoadMasterData(path, CStr(typ))
        End If
        Set root = MakeMaster(wb, CStr(typ), old, dependencies)
        PutObject dependencies, CStr(typ), Obj(root, "data", "Dictionary")
        outputs.Add CStr(typ), DacWriteJson(root)
    Next typ
    CheckMasterUnchanged wb
    Set dialog = Application.FileDialog(4)
    dialog.Title = "すべてのマスターを保存する親フォルダーを選択"
    If dialog.Show <> -1 Then Exit Sub
    folder = CStr(dialog.SelectedItems(1))
    target = fso.BuildPath(folder, "DAC_Master_" & Format$(Now, "yyyymmdd_hhnnss"))
    staging = target & ".partial"
    If fso.FolderExists(target) Or fso.FolderExists(staging) Then Fail "同名の出力フォルダーがあります: " & target
    CheckMasterUnchanged wb
    fso.CreateFolder staging
    created = True
    For Each typ In MasterTypes()
        SaveAsciiJson fso.BuildPath(staging, MasterFileName(CStr(typ))), CStr(outputs(CStr(typ)))
    Next typ
    opponentCount = OPPONENT_Master_ExportToPath( _
        fso.BuildPath(staging, MasterFileName("OPPONENT_Master")))
    CheckMasterUnchanged wb
    fso.MoveFolder staging, target
    created = False
    MsgBox "マスターJSON全9種類を一括出力しました。" & vbCrLf & target & vbCrLf & _
           "04_OPPONENT_Master: " & opponentCount & "件" & vbCrLf & _
           "個人用の設定と対戦履歴が含まれます。公開しないでください。", vbInformation
    Exit Sub
Failed:
    message = Err.Description
    If created Then
        On Error Resume Next
        For Each typ In MasterTypes()
            path = fso.BuildPath(staging, MasterFileName(CStr(typ)))
            If fso.FileExists(path) Then fso.DeleteFile path, True
        Next typ
        path = fso.BuildPath(staging, MasterFileName("OPPONENT_Master"))
        If fso.FileExists(path) Then fso.DeleteFile path, True
        Err.Clear
        If fso.GetFolder(staging).Files.Count = 0 And fso.GetFolder(staging).SubFolders.Count = 0 Then
            fso.DeleteFolder staging, False
        Else
            message = message & vbCrLf & "一時フォルダーに未削除の項目があります: " & staging
        End If
        If Err.Number <> 0 Then message = message & vbCrLf & "一時フォルダーを削除できません: " & staging & " / " & Err.Description
        On Error GoTo 0
    End If
    MsgBox "マスターJSONを一括出力できませんでした。" & vbCrLf & message, vbExclamation
End Sub

Private Function ExportVehicles(ByVal sheet As Worksheet, ByVal old As Object, _
                                ByVal lookup As Object, ByVal common As Object) As Collection
    Dim result As New Collection, dividers As New Collection, seen As Object
    Dim item As Object, details As Object, pending As Object, makers As Object
    Dim r As Long, lastRow As Long, label As String, name As String, manufacturer As String, number As Variant
    Dim table As ListObject
    Set seen = Dict()
    Set makers = Dict()
    Set table = sheet.ListObjects("リスト_車種")
    If table.Range.Column <> 2 Or table.ListColumns.Count < 13 Then Fail "車種テーブルの列構成が不正です"
    lastRow = table.Range.Row + table.Range.Rows.Count - 1
    For r = table.HeaderRowRange.Row + 1 To lastRow
        label = CellText(sheet.Cells(r, 2))
        If Len(ManufacturerName(label)) > 0 Then
            If Not pending Is Nothing Then Fail "車種の区切りが連続しています: " & r
            manufacturer = ManufacturerName(label)
            UniqueAdd makers, manufacturer, "メーカー"
            Set pending = Dict()
            pending.Add "label", label
            pending.Add "source", Source(sheet, sheet.Cells(r, 2))
        ElseIf AllDashes(label) Or Left$(label, 3) = "---" Then
            Fail "メーカー名の見出しが不正です: " & sheet.Cells(r, 2).Address(False, False)
        ElseIf Len(label) > 0 Then
            If Len(manufacturer) = 0 Then Fail "車種のメーカー見出しがありません: " & r
            name = CellText(sheet.Cells(r, 4))
            number = OptionalNumber(sheet.Cells(r, 3))
            If Len(name) = 0 Or IsNull(number) Then Fail "車種の名称または番号がありません: " & r
            UniqueAdd seen, label, "車種"
            Set item = Take(old, label, "vehicle")
            item("label") = label
            item("legacyNo") = number
            item("modelName") = name
            item("manufacturer") = manufacturer
            item("courseAttribute") = CellText(sheet.Cells(r, 5))
            item("routeType") = CellText(sheet.Cells(r, 6))
            item("migrationNote") = OptionalText(CellText(sheet.Cells(r, 1)))
            item("source") = Source(sheet, sheet.Cells(r, 2), sheet.Cells(r, 6))
            If item.Exists("details") Then
                Set details = Obj(item, "details", "Dictionary")
            Else
                Set details = Dict()
            End If
            details("alternateModelLabel") = OptionalText(CellText(sheet.Cells(r, 7)))
            details("drive") = OptionalText(CellText(sheet.Cells(r, 8)))
            details("courseAttribute") = OptionalText(CellText(sheet.Cells(r, 9)))
            details("routeType") = OptionalText(CellText(sheet.Cells(r, 10)))
            details("tuningStyle") = OptionalText(CellText(sheet.Cells(r, 11)))
            details("power") = OptionalMetric(sheet.Cells(r, 12))
            details("cornering") = OptionalMetric(sheet.Cells(r, 13))
            details("stability") = OptionalMetric(sheet.Cells(r, 14))
            PutObject item, "details", details
            lookup.Add label, CStr(item("id"))
            result.Add item
            If Not pending Is Nothing Then
                pending.Add "beforeVehicleId", CStr(item("id"))
                dividers.Add pending
                Set pending = Nothing
            End If
        End If
    Next r
    If Not pending Is Nothing Then Fail "末尾の車種区切りに対応する車種がありません"
    AssertNoMissing old, "車種"
    PutObject common, "vehicleDividers", dividers
    Set ExportVehicles = result
End Function

Private Function ExportCourses(ByVal sheet As Worksheet, ByVal old As Object, ByVal lookup As Object) As Collection
    Dim result As New Collection, item As Object, seen As Object
    Dim c As Long, lastColumn As Long, label As String, key As String, number As Variant, table As ListObject
    Set seen = Dict()
    Set table = sheet.ListObjects("ラウンドコース設定")
    If table.Range.Column <> 1 Or table.Range.Row <> 9 Or table.ListColumns.Count < 5 Then Fail "ラウンドコース設定の列構成が不正です"
    lastColumn = table.Range.Column + table.Range.Columns.Count - 1
    For c = 5 To lastColumn
        number = OptionalNumber(sheet.Cells(4, c))
        label = CellText(sheet.Cells(3, c))
        If Not IsNull(number) Or Len(label) > 0 Then
            If IsNull(number) Or Len(label) = 0 Then Fail "コース名または番号がありません: " & c
            key = CStr(number)
            UniqueAdd seen, key, "コース番号"
            Set item = Take(old, key, "course")
            If item.Exists("label") Then
                If CStr(item("label")) <> label Then Fail "コースの改名を確認してください: " & sheet.Cells(3, c).Address(False, False)
            End If
            item("legacyNo") = number
            item("label") = label
            item("location") = CellText(sheet.Cells(5, c))
            item("direction") = CellText(sheet.Cells(6, c))
            item("courseAttribute") = OptionalText(CellText(sheet.Cells(7, c)))
            item("difficulty") = OptionalText(CellText(sheet.Cells(8, c)))
            item("selectable") = (CDbl(number) <> 99)
            item("source") = Source(sheet, sheet.Cells(3, c), sheet.Cells(8, c))
            item("migrationNote") = OptionalText(CellText(sheet.Cells(2, c)))
            lookup.Add CStr(c), item
            result.Add item
        End If
    Next c
    AssertNoMissing old, "コース"
    Set ExportCourses = result
End Function

Private Function ExportAreas(ByVal sheet As Worksheet, ByVal old As Object, ByVal lookup As Object) As Collection
    Dim result As New Collection, item As Object, aliases As Collection, seen As Object
    Dim r As Long, lastRow As Long, label As String, key As String, number As Variant, table As ListObject
    Set seen = Dict()
    Set table = sheet.ListObjects("リスト_都道府県")
    If table.Range.Column <> 2 Or table.ListColumns.Count < 3 Then Fail "エリアテーブルの列構成が不正です"
    lastRow = table.Range.Row + table.Range.Rows.Count - 1
    For r = table.HeaderRowRange.Row + 1 To lastRow
        label = CellText(sheet.Cells(r, 2))
        number = OptionalNumber(sheet.Cells(r, 3))
        If Len(label) > 0 And IsNull(number) And Len(Replace(label, ChrW(&H2212), vbNullString)) = 0 Then
            ' The area list uses repeated minus signs as visual separators.
        ElseIf Len(label) > 0 Or Not IsNull(number) Then
            If Len(label) = 0 Or IsNull(number) Then Fail "エリア名または番号がありません: " & r
            key = CStr(number)
            UniqueAdd seen, key, "エリア番号"
            If lookup.Exists(label) Then Fail "エリア名が重複しています: " & r
            Set item = Take(old, key, "area")
            If item.Exists("label") Then
                If CStr(item("label")) <> label Then Fail "エリアの改名を確認してください: " & r
            Else
                Set aliases = New Collection
                PutObject item, "aliases", aliases
            End If
            item("label") = label
            item("legacyCode") = number
            item("source") = Source(sheet, sheet.Cells(r, 2), sheet.Cells(r, 4))
            lookup.Add label, CStr(item("id"))
            result.Add item
        End If
    Next r
    AssertNoMissing old, "エリア"
    Set ExportAreas = result
End Function

Private Function ExportStores(ByVal sheet As Worksheet, ByVal old As Object, _
                              ByVal areaIds As Object, ByVal storeLabels As Object) As Collection
    Dim result As New Collection, item As Object, aliases As Collection, seen As Object
    Dim c As Long, r As Long, lastColumn As Long, area As String, label As String, key As String
    Set seen = Dict()
    lastColumn = sheet.UsedRange.Column + sheet.UsedRange.Columns.Count - 1
    For c = 2 To lastColumn
        area = CellText(sheet.Cells(2, c))
        If Len(area) > 0 Then
            If Not areaIds.Exists(area) Then Fail "店舗のエリアを確認してください: " & sheet.Cells(2, c).Address(False, False)
            For r = 3 To LastRow(sheet, c, 3)
                label = CellText(sheet.Cells(r, c))
                If Len(label) > 0 Then
                    key = CStr(areaIds(area)) & vbNullChar & label
                    UniqueAdd seen, key, "店舗"
                    Set item = Take(old, key, "store")
                    If Not item.Exists("aliases") Then
                        Set aliases = New Collection
                        PutObject item, "aliases", aliases
                        item("operatingStatus") = "unknown"
                    End If
                    item("areaId") = CStr(areaIds(area))
                    item("label") = label
                    item("source") = Source(sheet, sheet.Cells(r, c))
                    If storeLabels.Exists(label) Then
                        storeLabels(label) = ""
                    Else
                        storeLabels.Add label, CStr(item("id"))
                    End If
                    result.Add item
                End If
            Next r
        Else
            For r = 3 To LastRow(sheet, c, 3)
                If Len(CellText(sheet.Cells(r, c))) > 0 Then Fail "エリア見出しのない店舗列があります: " & sheet.Cells(2, c).Address(False, False)
            Next r
        End If
    Next c
    AssertNoMissing old, "店舗"
    Set ExportStores = result
End Function

Private Function ExportSeasons(ByVal sheet As Worksheet, ByVal old As Object, ByVal lookup As Object) As Collection
    Dim result As New Collection, item As Object, seen As Object, r As Long, lastRow As Long, label As String, table As ListObject
    Set seen = Dict()
    Set table = sheet.ListObjects("リスト_シーズン")
    lastRow = table.Range.Row + table.Range.Rows.Count - 1
    For r = table.HeaderRowRange.Row + 1 To lastRow
        label = CellText(sheet.Cells(r, table.Range.Column))
        If Len(label) > 0 Then
            UniqueAdd seen, label, "シーズン"
            Set item = Take(old, label, "season")
            item("label") = label
            lookup.Add label, CStr(item("id"))
            result.Add item
        End If
    Next r
    AssertNoMissing old, "シーズン"
    Set ExportSeasons = result
End Function

Private Function ExportRounds(ByVal sheet As Worksheet, ByVal old As Object, _
                              ByVal seasons As Object, ByVal courses As Object) As Collection
    Dim result As New Collection, selected As Collection, item As Object, course As Object
    Dim seen As Object, r As Long, c As Long, lastRow As Long, lastColumn As Long, label As String, name As String
    Dim table As ListObject
    Dim season As Variant, seasonId As String, roundLabel As String, value As String, matches As Long
    Set seen = Dict()
    Set table = sheet.ListObjects("ラウンドコース設定")
    lastRow = table.Range.Row + table.Range.Rows.Count - 1
    lastColumn = table.Range.Column + table.Range.Columns.Count - 1
    For r = table.HeaderRowRange.Row + 1 To lastRow
        label = CellText(sheet.Cells(r, 1))
        If Len(label) > 0 Then
            UniqueAdd seen, label, "ラウンド"
            matches = 0
            For Each season In seasons.Keys
                name = CStr(season) & "R"
                If Left$(label, Len(name)) = name And Len(label) > Len(name) Then
                    matches = matches + 1
                    seasonId = CStr(seasons(season))
                    roundLabel = Mid$(label, Len(name) + 1)
                End If
            Next season
            If matches <> 1 Then Fail "ラウンドのシーズンを特定できません: " & r
            Set item = Take(old, label, "round")
            item("seasonId") = seasonId
            item("roundLabel") = roundLabel
            item("sourceLabel") = label
            item("startDate") = IsoDate(sheet.Cells(r, 2))
            item("endDate") = IsoDate(sheet.Cells(r, 3))
            If CStr(item("startDate")) > CStr(item("endDate")) Then Fail "ラウンド期間が逆です: " & r
            item("source") = Source(sheet, sheet.Cells(r, 1), sheet.Cells(r, lastColumn))
            Set selected = New Collection
            For c = 5 To lastColumn
                value = CellText(sheet.Cells(r, c))
                If Len(value) > 0 Then
                    If Not courses.Exists(CStr(c)) Then Fail "ラウンドに未定義のコースがあります: " & r
                    Set course = courses(CStr(c))
                    If value <> CStr(course("label")) Then Fail "ラウンドのコース名が一致しません: " & r
                    selected.Add CStr(course("id"))
                End If
            Next c
            PutObject item, "courseIds", selected
            result.Add item
        End If
    Next r
    AssertNoMissing old, "ラウンド"
    Set ExportRounds = result
End Function

Private Function ExportTeams(ByVal sheet As Worksheet, ByVal old As Object) As Collection
    Dim result As New Collection, item As Object, seen As Object
    Dim r As Long, lastRow As Long, label As String, home As String, oldHome As String
    Dim oldStoreId As String, table As ListObject
    Set seen = Dict()
    Set table = sheet.ListObjects("作成Teamリスト")
    If table.Range.Column <> 30 Or table.ListColumns.Count < 3 Then Fail "チームテーブルの列構成が不正です"
    lastRow = table.Range.Row + table.Range.Rows.Count - 1
    For r = table.HeaderRowRange.Row + 1 To lastRow
        label = CellText(sheet.Cells(r, 30))
        If Len(label) > 0 Then
            UniqueAdd seen, label, "チーム"
            Set item = Take(old, label, "team")
            home = CellText(sheet.Cells(r, 32))
            oldHome = ""
            oldStoreId = ""
            If item.Exists("homeStoreLabel") Then oldHome = TextValue(item("homeStoreLabel"), "チームの店舗名")
            If item.Exists("homeStoreId") Then oldStoreId = TextValue(item("homeStoreId"), "チームの店舗ID")
            item("label") = label
            item("number") = DisplayText(sheet.Cells(r, 31))
            item("homeStoreLabel") = home
            item("homeStoreId") = Null
            If Len(home) > 0 And home = oldHome And Len(oldStoreId) > 0 Then item("homeStoreId") = oldStoreId
            item("source") = Source(sheet, sheet.Cells(r, 30), sheet.Cells(r, 32))
            result.Add item
        End If
    Next r
    AssertNoMissing old, "チーム"
    Set ExportTeams = result
End Function

Private Function VehicleSlots(ByVal sheet As Worksheet, ByVal column As Long, _
                              ByVal firstRow As Long, ByVal lastRow As Long, _
                              ByVal vehicles As Object, ByVal compact As Boolean) As Collection
    Dim result As New Collection, item As Object, r As Long, label As String, slot As Long
    For r = firstRow To lastRow
        label = CellText(sheet.Cells(r, column))
        If Len(label) > 0 And label <> "未登録" Then
            If Not vehicles.Exists(label) Then Fail "カードの車種が未登録です: " & sheet.Cells(r, column).Address(False, False)
            If compact Then slot = result.Count + 1 Else slot = r - firstRow + 1
            Set item = Dict()
            item.Add "slot", slot
            item.Add "vehicleId", CStr(vehicles(label))
            item.Add "label", label
            item.Add "source", Source(sheet, sheet.Cells(r, column))
            result.Add item
        End If
    Next r
    Set VehicleSlots = result
End Function

Private Function ExportCards(ByVal sheet As Worksheet, ByVal old As Object, _
                             ByVal vehicles As Object, ByVal teams As Object) As Collection
    Dim result As New Collection, item As Object, seen As Object, rankInfo As Object
    Dim c As Long, lastColumn As Long, lastRow As Long, label As String, team As String
    Dim rank As String, stars As String, table As ListObject
    Set seen = Dict()
    Set table = sheet.ListObjects("リスト_カード")
    If table.Range.Column <> 1 Or table.Range.Row <> 5 Or table.Range.Rows.Count < 13 Or table.ListColumns.Count < 3 Then Fail "カードテーブルの構成が不正です"
    If CellText(sheet.Cells(10, 1)) <> "ランク" Or CellText(sheet.Cells(11, 1)) <> "★" Or _
       CellText(sheet.Cells(13, 1)) <> "スロット1" Or CellText(sheet.Cells(15, 1)) <> "スロット3" Or _
       Left$(CellText(sheet.Cells(17, 1)), 2) <> "車庫" Then Fail "カード表のランク・車両の行構成が不正です"
    lastColumn = table.Range.Column + table.Range.Columns.Count - 1
    lastRow = table.Range.Row + table.Range.Rows.Count - 1
    For c = 3 To lastColumn
        label = CellText(sheet.Cells(6, c))
        If Len(label) > 0 Then
            UniqueAdd seen, label, "カード"
            Set item = Take(old, label, "card")
            If item.Exists("number") Then item.Remove "number"
            If Not item.Exists("onlineEnabled") Then
                item("onlineEnabled") = Null
                item("onlineEnabledBasis") = "not determined"
            End If
            team = CellText(sheet.Cells(9, c))
            If Len(team) > 0 And Not teams.Exists(team) Then Fail "カードのチームが未登録です: " & sheet.Cells(9, c).Address(False, False)
            item("label") = label
            item("teamId") = Null
            item("teamLabel") = OptionalText(team)
            If Len(team) > 0 Then item("teamId") = CStr(teams(team))
            rank = CellText(sheet.Cells(10, c))
            stars = CellText(sheet.Cells(11, c))
            If Len(rank) = 0 And Len(stars) = 0 Then
                If item.Exists("currentRank") Then item.Remove "currentRank"
                item.Add "currentRank", Null
            Else
                Set rankInfo = Dict()
                rankInfo.Add "rank", rank
                rankInfo.Add "stars", stars
                rankInfo.Add "phase", "master-extracted"
                rankInfo.Add "source", Source(sheet, sheet.Cells(10, c), sheet.Cells(11, c))
                PutObject item, "currentRank", rankInfo
            End If
            item("source") = Source(sheet, sheet.Cells(6, c), sheet.Cells(lastRow, c))
            PutObject item, "activeSlots", VehicleSlots(sheet, c, 13, 15, vehicles, False)
            PutObject item, "garage", VehicleSlots(sheet, c, 17, lastRow, vehicles, True)
            result.Add item
        End If
    Next c
    AssertNoMissing old, "カード"
    Set ExportCards = result
End Function

Private Function ExportRankLevels(ByVal sheet As Worksheet) As Collection
    Dim result As New Collection, item As Object, r As Long, lastRow As Long, value As Variant, rank As String, table As ListObject
    Set table = sheet.ListObjects("ランクID")
    If table.Range.Column <> 12 Or table.ListColumns.Count < 3 Then Fail "ランクIDテーブルの列構成が不正です"
    lastRow = table.Range.Row + table.Range.Rows.Count - 1
    For r = table.HeaderRowRange.Row + 1 To lastRow
        value = OptionalNumber(sheet.Cells(r, 14))
        rank = CellText(sheet.Cells(r, 12))
        If Not IsNull(value) Then
            If Len(rank) = 0 Then Fail "ランク比較のランク名がありません: " & r
            Set item = Dict()
            item.Add "rank", rank
            item.Add "stars", OptionalText(CellText(sheet.Cells(r, 13)))
            item.Add "legacyRankValue", value
            item.Add "source", Source(sheet, sheet.Cells(r, 12), sheet.Cells(r, 14))
            result.Add item
        ElseIf Len(rank) > 0 Then
            Fail "ランク比較の数値がありません: " & r
        End If
    Next r
    Set ExportRankLevels = result
End Function

Private Function ExportBehavior(ByVal sheet As Worksheet) As Collection
    Dim result As New Collection, item As Object, seen As Object
    Dim r As Long, lastRow As Long, code As String, label As String, table As ListObject
    Set seen = Dict()
    Set table = sheet.ListObjects("ブレフラ譲りなど")
    If table.Range.Column <> 9 Or table.ListColumns.Count < 2 Then Fail "ブレフラ譲りテーブルの列構成が不正です"
    lastRow = table.Range.Row + table.Range.Rows.Count - 1
    For r = table.HeaderRowRange.Row + 1 To lastRow
        code = CellText(sheet.Cells(r, 9))
        label = CellText(sheet.Cells(r, 10))
        If Len(code) > 0 Or Len(label) > 0 Then
            If Len(code) = 0 Or Len(label) = 0 Then Fail "行動コードまたは名称がありません: " & r
            UniqueAdd seen, code, "行動コード"
            Set item = Dict()
            item.Add "code", code
            item.Add "label", label
            item.Add "source", Source(sheet, sheet.Cells(r, 9), sheet.Cells(r, 10))
            result.Add item
        End If
    Next r
    Set ExportBehavior = result
End Function

Public Sub 個別マスター出力()
    Dim masterList As Variant, choice As Variant
    Dim prompt As String, i As Long, selected As Long
    masterList = Array("STORE_Master", "TEAM_Master", "CARD_Master", "OPPONENT_Master", _
                       "ROUND_Master", "CAR_Master", "RANK_Master", "AREA_Master", "CORD_Master")
    prompt = "生成するJSONを番号で選択してください:" & vbCrLf & vbCrLf
    For i = LBound(masterList) To UBound(masterList)
        prompt = prompt & Format$(i - LBound(masterList) + 1, "00") & ": " & CStr(masterList(i)) & vbCrLf
    Next i
    choice = Application.InputBox(prompt, "個別生成", Type:=1)
    If VarType(choice) = vbBoolean Then Exit Sub
    If choice <> Fix(CDbl(choice)) Or choice < 1 Or choice > UBound(masterList) - LBound(masterList) + 1 Then
        MsgBox "一覧にある番号を入力してください。", vbExclamation
        Exit Sub
    End If
    selected = LBound(masterList) + CLng(choice) - 1
    ExportOne CStr(masterList(selected))
End Sub
