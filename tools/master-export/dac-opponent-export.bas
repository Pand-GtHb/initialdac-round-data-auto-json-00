Attribute VB_Name = "DacOpponentExport"
Option Explicit

Private Const FIRST_DATA_ROW As Long = 10

Private Sub OpponentFail(ByVal message As String)
    Err.Raise vbObjectError + 701, "OPPONENT_Master", message
End Sub

Private Function OpponentDict() As Object
    Set OpponentDict = CreateObject("Scripting.Dictionary")
    OpponentDict.CompareMode = vbBinaryCompare
End Function

Private Function OpponentText(ByVal value As Variant, ByVal location As String) As String
    If IsError(value) Then OpponentFail "Excel error value: " & location
    If IsNull(value) Or IsEmpty(value) Then Exit Function
    If IsObject(value) Or IsArray(value) Then OpponentFail "Unsupported value: " & location
    OpponentText = CStr(value)
End Function

Private Function OpponentHistoryCount(ByVal value As Variant, ByVal location As String) As Variant
    Dim text As String, number As Double
    text = Trim$(OpponentText(value, location))
    If Len(text) = 0 Then
        OpponentHistoryCount = Null
        Exit Function
    End If
    If Not IsNumeric(value) Then OpponentFail "History count is not numeric: " & location
    number = CDbl(value)
    If number < 0 Or number <> Fix(number) Or number > 2147483647# Then _
        OpponentFail "History count is invalid: " & location
    OpponentHistoryCount = CLng(number)
End Function

Private Function OpponentHistoryCounts(ByVal totalValues As Variant, ByVal courseValues As Variant, _
                                       ByVal rowIndex As Long, ByVal excelRow As Long) As Object
    Dim result As Object, total As Variant, wins As Variant, courseTotal As Variant, courseWins As Variant
    total = OpponentHistoryCount(totalValues(rowIndex, 1), "AK" & excelRow)
    wins = OpponentHistoryCount(totalValues(rowIndex, 2), "AL" & excelRow)
    courseTotal = OpponentHistoryCount(courseValues(rowIndex, 1), "AR" & excelRow)
    courseWins = OpponentHistoryCount(courseValues(rowIndex, 2), "AS" & excelRow)
    If IsNull(total) <> IsNull(wins) Then OpponentFail "Incomplete opponent counts: AK/AL" & excelRow
    If IsNull(courseTotal) <> IsNull(courseWins) Then OpponentFail "Incomplete course counts: AR/AS" & excelRow
    If Not IsNull(total) Then
        If wins > total Then OpponentFail "Opponent wins exceed matches: AK/AL" & excelRow
    End If
    If Not IsNull(courseTotal) Then
        If courseWins > courseTotal Then OpponentFail "Course wins exceed matches: AR/AS" & excelRow
    End If
    Set result = OpponentDict()
    result.Add "sourceRow", excelRow
    result.Add "matches", total
    result.Add "wins", wins
    result.Add "courseMatches", courseTotal
    result.Add "courseWins", courseWins
    Set OpponentHistoryCounts = result
End Function

Private Function OpponentHasData(ByVal mainData As Variant, ByVal dateData As Variant, _
                                 ByVal roundData As Variant, ByVal cardData As Variant, _
                                 ByVal rowIndex As Long) As Boolean
    Dim column As Long
    For column = 1 To UBound(mainData, 2)
        If Len(OpponentText(mainData(rowIndex, column), "D:X")) > 0 Then
            OpponentHasData = True
            Exit Function
        End If
    Next column
    For column = 1 To UBound(dateData, 2)
        If Len(OpponentText(dateData(rowIndex, column), "AD:AF")) > 0 Then
            OpponentHasData = True
            Exit Function
        End If
    Next column
    For column = 1 To UBound(roundData, 2)
        If Len(OpponentText(roundData(rowIndex, column), "AW:AX")) > 0 Then
            OpponentHasData = True
            Exit Function
        End If
    Next column
    For column = 1 To UBound(cardData, 2)
        If Len(OpponentText(cardData(rowIndex, column), "BA:BC")) > 0 Then
            OpponentHasData = True
            Exit Function
        End If
    Next column
End Function

Private Function OpponentParseDate(ByVal value As Variant, ByVal location As String, _
                                   ByRef hasTime As Boolean) As Date
    Dim serial As Double, text As String, pattern As Object, parts As Object
    Dim yearNumber As Long, monthNumber As Long, dayNumber As Long, parsed As Date
    Dim hourNumber As Long, minuteNumber As Long, secondNumber As Long
    hasTime = False
    If IsError(value) Then OpponentFail "Date error: " & location
    If IsNull(value) Or IsEmpty(value) Then OpponentFail "Date is missing: " & location
    If Len(Trim$(CStr(value))) = 0 Then OpponentFail "Date is missing: " & location
    If IsNumeric(value) Then
        serial = CDbl(value)
        If serial < 61 Or serial >= 2958466 Then OpponentFail "Date is invalid: " & location
        parsed = DateAdd("d", Fix(serial), DateSerial(1899, 12, 30))
        hasTime = serial <> Fix(serial)
        If hasTime Then parsed = DateAdd("s", Int((serial - Fix(serial)) * 86400# + 0.5), parsed)
    Else
        text = Trim$(CStr(value))
        Set pattern = CreateObject("VBScript.RegExp")
        pattern.Pattern = "^(\d{4})[-/](\d{1,2})[-/](\d{1,2})([ T](\d{1,2}):(\d{2})(:(\d{2}))?)?$"
        If Not pattern.Test(text) Then
            OpponentFail "Use YYYY/MM/DD with optional HH:MM:SS: " & location
        End If
        Set parts = pattern.Execute(text)(0).SubMatches
        yearNumber = CLng(parts(0))
        monthNumber = CLng(parts(1))
        dayNumber = CLng(parts(2))
        If yearNumber < 1900 Or yearNumber > 9999 Or monthNumber < 1 Or _
           monthNumber > 12 Or dayNumber < 1 Or dayNumber > 31 Then
            OpponentFail "Date is invalid: " & location
        End If
        parsed = DateSerial(yearNumber, monthNumber, dayNumber)
        If Year(parsed) <> yearNumber Or Month(parsed) <> monthNumber Or Day(parsed) <> dayNumber Then
            OpponentFail "Date is invalid: " & location
        End If
        hasTime = Len(parts(3)) > 0
        If hasTime Then
            hourNumber = CLng(parts(4))
            minuteNumber = CLng(parts(5))
            If Len(parts(7)) > 0 Then secondNumber = CLng(parts(7))
            If hourNumber > 23 Or minuteNumber > 59 Or secondNumber > 59 Then
                OpponentFail "Time is invalid: " & location
            End If
            parsed = parsed + TimeSerial(hourNumber, minuteNumber, secondNumber)
        End If
    End If
    OpponentParseDate = parsed
End Function

Private Function OpponentIsoDate(ByVal value As Variant, ByVal location As String) As String
    Dim parsed As Date, hasTime As Boolean
    parsed = OpponentParseDate(value, location, hasTime)
    OpponentIsoDate = Format$(parsed, "yyyy-mm-dd")
End Function

Private Function OpponentConfirmedAt(ByVal inputValue As Variant, ByVal computedValue As Variant, _
                                      ByVal dateText As String, ByVal excelRow As Long) As String
    Dim parsed As Date, hasTime As Boolean
    If Len(Trim$(OpponentText(inputValue, "Y" & excelRow))) > 0 Then
        parsed = OpponentParseDate(inputValue, "Y" & excelRow, hasTime)
    End If
    If Not hasTime Then parsed = OpponentParseDate(computedValue, "AD" & excelRow, hasTime)
    If Not hasTime Then Exit Function
    If Format$(parsed, "yyyy-mm-dd") <> dateText Then
        OpponentFail "Input and computed dates disagree: Y/AD" & excelRow
    End If
    OpponentConfirmedAt = Format$(parsed, "yyyy-mm-dd") & "T" & Format$(parsed, "hh:nn:ss") & "+09:00"
End Function

Private Function OpponentSourceWorkbook() As Workbook
    Dim wb As Workbook, expectedName As String
    expectedName = "Data-" & ChrW$(&H30B7) & ChrW$(&H30FC) & ChrW$(&H30BA) & _
                   ChrW$(&H30F3) & "6.xlsx"
    For Each wb In Application.Workbooks
        If StrComp(wb.Name, expectedName, vbTextCompare) = 0 Then
            If wb Is ThisWorkbook Then OpponentFail "Open the source workbook separately from the macro workbook."
            If Not wb.Saved Then OpponentFail "Recalculate and save the source workbook before exporting."
            If Application.CalculationState <> xlDone Then OpponentFail "Excel calculation is still running."
            If wb.Date1904 Then OpponentFail "The 1904 date system is not supported."
            Set OpponentSourceWorkbook = wb
            Exit Function
        End If
    Next wb
    OpponentFail "Open " & expectedName & " in this Excel instance, then recalculate and save it."
End Function

Private Function OpponentSheet(ByVal wb As Workbook) As Worksheet
    Dim sheet As Worksheet, fullWidthD As String
    fullWidthD = ChrW$(&HFF24)
    For Each sheet In wb.Worksheets
        If StrComp(sheet.Name, "D", vbBinaryCompare) = 0 Or _
           StrComp(sheet.Name, fullWidthD, vbBinaryCompare) = 0 Then
            Set OpponentSheet = sheet
            Exit Function
        End If
    Next sheet
    OpponentFail "The source workbook does not contain a D worksheet."
End Function

Private Function OpponentLastRow(ByVal sheet As Worksheet, ByVal columnName As String) As Long
    OpponentLastRow = sheet.Cells(sheet.Rows.Count, sheet.Range(columnName & "1").Column).End(xlUp).Row
End Function

Private Sub OpponentCheckHeaders(ByVal sheet As Worksheet)
    Dim columns As Variant, headers As Variant, index As Long, location As String
    columns = Array("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", _
                    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", _
                    "AC", "AD", "AE", "AF", "AK", "AL", "AR", "AS", "AW", "AX", "BA", "BB", "BC")
    headers = Array("カード：入力", "ランク-自分：入力", "星-自分：入力", "ランク：相手", "星：相手", _
                    "対戦相手", "都道府県：所属店舗", "所属店", "ブレフラ・譲り", "CN追加メモ", "追加メモ", _
                    "チーム", "チーム所属", "選択権あり=1", "ランダム", "コース", "夜", "勝=1", "車種", _
                    "車種：相手", "都道府県：対戦店舗", "対戦店舗", "対戦相手：全角化", "仮No.", "日付：入力", _
                    "Data_No.", "日付", "CNメモ", "メモ", "対戦数：対相手", "勝数：対相手", _
                    "対戦数：コース", "勝数：コース", "シーズン", "ラウンド", "カード", "ランク：自分", "星：自分")
    For index = LBound(columns) To UBound(columns)
        location = CStr(columns(index)) & "9"
        If OpponentText(sheet.Range(location).Value2, location) <> CStr(headers(index)) Then
            OpponentFail "Unexpected column header: " & location & ". Check the source workbook layout."
        End If
    Next index
End Sub

Private Function OpponentRecord(ByVal dataNo As String, ByVal dateText As String, _
                                ByVal fields As Variant, ByVal status As String) As Object
    Dim record As Object, values As Object, index As Long
    Set values = OpponentDict()
    For index = LBound(fields) To UBound(fields) Step 2
        values.Add CStr(fields(index)), CStr(fields(index + 1))
    Next index
    Set record = OpponentDict()
    record.Add "id", "excel-datano:" & dataNo
    record.Add "status", status
    record.Add "values", values
    record.Add "createdAt", dateText & "T00:00:00+09:00"
    record.Add "updatedAt", dateText & "T00:00:00+09:00"
    Set OpponentRecord = record
End Function

Public Sub OPPONENT_Master_Export()
    Dim outputChoice As Variant, outputPath As String, outputCount As Long
    On Error GoTo Failed
    outputChoice = Application.GetSaveAsFilename( _
        "04_OPPONENT_Master.json", "JSON files (*.json), *.json", , "Save OPPONENT_Master")
    If VarType(outputChoice) = vbBoolean Then Exit Sub
    outputPath = CStr(outputChoice)
    If LCase$(Right$(outputPath, 5)) <> ".json" Then outputPath = outputPath & ".json"
    outputCount = OPPONENT_Master_ExportToPath(outputPath)
    MsgBox "OPPONENT_Master exported." & vbCrLf & outputPath & vbCrLf & _
           outputCount & " match records. Import with the app's past-history JSON option.", vbInformation
    Exit Sub
Failed:
    MsgBox "OPPONENT_Master export failed." & vbCrLf & Err.Description, vbExclamation
End Sub

Public Function OPPONENT_Master_ExportToPath(ByVal outputPath As String) As Long
    Dim wb As Workbook, sheet As Worksheet, fso As Object, file As Object
    Dim mainData As Variant, dateData As Variant, roundData As Variant
    Dim cardData As Variant, idData As Variant, inputDates As Variant, inputDate As Variant
    Dim totalHistoryData As Variant, courseHistoryData As Variant, historyCounts As Object
    Dim seen As Object, seenTemporary As Object
    Dim tempPath As String
    Dim lastRow As Long, totalRows As Long, rowIndex As Long, excelRow As Long
    Dim dataNo As String, card As String, opponent As String, homeShop As String, temporaryNo As String
    Dim dateText As String, confirmedAt As String, randomFlag As String, nightFlag As String, winFlag As String
    Dim status As String, record As Object, fields As Variant
    Dim outputCount As Long, errorMessage As String, tempCreated As Boolean
    Dim savedNumber As Long, savedSource As String
    On Error GoTo Failed

    If LCase$(Right$(outputPath, 5)) <> ".json" Then OpponentFail "The output filename must end in .json."
    Set wb = OpponentSourceWorkbook()
    Set sheet = OpponentSheet(wb)
    OpponentCheckHeaders sheet
    ' AC contains generated Data_No. formulas in blank rows, so exclude it from the export boundary.
    lastRow = OpponentLastRow(sheet, "AD")
    If OpponentLastRow(sheet, "BA") > lastRow Then lastRow = OpponentLastRow(sheet, "BA")
    If OpponentLastRow(sheet, "F") > lastRow Then lastRow = OpponentLastRow(sheet, "F")
    If lastRow < FIRST_DATA_ROW Then OpponentFail "No opponent history rows were found."

    Set fso = CreateObject("Scripting.FileSystemObject")
    If fso.FileExists(outputPath) Then OpponentFail "The destination already exists. Choose a new filename: " & outputPath
    tempPath = outputPath & ".partial"
    If fso.FileExists(tempPath) Then OpponentFail "A temporary output file already exists: " & tempPath

    totalRows = lastRow - FIRST_DATA_ROW + 1
    mainData = sheet.Range("D" & FIRST_DATA_ROW & ":X" & lastRow).Value2
    dateData = sheet.Range("AD" & FIRST_DATA_ROW & ":AF" & lastRow).Value2
    roundData = sheet.Range("AW" & FIRST_DATA_ROW & ":AX" & lastRow).Value2
    cardData = sheet.Range("BA" & FIRST_DATA_ROW & ":BC" & lastRow).Value2
    idData = sheet.Range("AC" & FIRST_DATA_ROW & ":AC" & lastRow).Value2
    inputDates = sheet.Range("Y" & FIRST_DATA_ROW & ":Y" & lastRow).Value2
    totalHistoryData = sheet.Range("AK" & FIRST_DATA_ROW & ":AL" & lastRow).Value2
    courseHistoryData = sheet.Range("AR" & FIRST_DATA_ROW & ":AS" & lastRow).Value2
    Set seen = OpponentDict()
    Set seenTemporary = OpponentDict()

    Set file = fso.CreateTextFile(tempPath, False, False)
    tempCreated = True
    file.Write "{""schema"":1,""masterType"":""OPPONENT_Master"",""source"":" & _
               DacWriteJson(wb.Name) & ",""records"":["

    For rowIndex = 1 To totalRows
        excelRow = FIRST_DATA_ROW + rowIndex - 1
        If totalRows = 1 Then
            dataNo = Trim$(OpponentText(sheet.Range("AC" & excelRow).Value2, "AC" & excelRow))
        Else
            dataNo = Trim$(OpponentText(idData(rowIndex, 1), "AC" & excelRow))
        End If
        If Len(dataNo) = 0 Or Not OpponentHasData(mainData, dateData, roundData, cardData, rowIndex) Then
            If OpponentHasData(mainData, dateData, roundData, cardData, rowIndex) Then
                OpponentFail "Data_No. is missing: AC" & excelRow
            End If
            GoTo NextRow
        End If
        If seen.Exists(dataNo) Then OpponentFail "Duplicate Data_No.: " & dataNo
        seen.Add dataNo, True

        card = OpponentText(cardData(rowIndex, 1), "BA" & excelRow)
        If Len(Trim$(card)) = 0 Then OpponentFail "Card is missing: BA" & excelRow
        dateText = OpponentIsoDate(dateData(rowIndex, 1), "AD" & excelRow)
        If totalRows = 1 Then
            inputDate = inputDates
        Else
            inputDate = inputDates(rowIndex, 1)
        End If
        confirmedAt = OpponentConfirmedAt(inputDate, dateData(rowIndex, 1), dateText, excelRow)
        opponent = OpponentText(mainData(rowIndex, 3), "F" & excelRow)
        If Len(Trim$(opponent)) = 0 Then
            opponent = ChrW$(&H76F8) & ChrW$(&H624B) & ChrW$(&H4E0D) & ChrW$(&H660E) & _
                       " (Data_No. " & dataNo & ")"
        End If
        homeShop = OpponentText(mainData(rowIndex, 5), "H" & excelRow)
        randomFlag = OpponentText(mainData(rowIndex, 12), "O" & excelRow)
        nightFlag = OpponentText(mainData(rowIndex, 14), "Q" & excelRow)
        winFlag = OpponentText(mainData(rowIndex, 15), "R" & excelRow)
        If randomFlag = "R" Then randomFlag = "1"
        If nightFlag = ChrW$(&H591C) Then nightFlag = "1"
        If Len(Trim$(winFlag)) = 0 Then winFlag = "0"
        status = "pending"

        fields = Array( _
            "card", card, "myRank", OpponentText(cardData(rowIndex, 2), "BB" & excelRow), _
            "myStars", OpponentText(cardData(rowIndex, 3), "BC" & excelRow), _
            "opponentRank", OpponentText(mainData(rowIndex, 1), "D" & excelRow), _
            "opponentStars", OpponentText(mainData(rowIndex, 2), "E" & excelRow), _
            "opponent", opponent, "homeArea", OpponentText(mainData(rowIndex, 4), "G" & excelRow), _
            "homeShop", homeShop, "behavior", OpponentText(mainData(rowIndex, 6), "I" & excelRow), _
            "copiedRate", "", "nameNote", OpponentText(dateData(rowIndex, 2), "AE" & excelRow), _
            "note", OpponentText(dateData(rowIndex, 3), "AF" & excelRow), _
            "team", OpponentText(mainData(rowIndex, 9), "L" & excelRow), _
            "teamShop", OpponentText(mainData(rowIndex, 10), "M" & excelRow), _
            "choice", OpponentText(mainData(rowIndex, 11), "N" & excelRow), _
            "random", randomFlag, "course", OpponentText(mainData(rowIndex, 13), "P" & excelRow), _
            "night", nightFlag, "win", winFlag, "car", OpponentText(mainData(rowIndex, 16), "S" & excelRow), _
            "opponentCar", OpponentText(mainData(rowIndex, 17), "T" & excelRow), _
            "battleArea", OpponentText(mainData(rowIndex, 18), "U" & excelRow), _
            "battleShop", OpponentText(mainData(rowIndex, 19), "V" & excelRow), _
            "normalizedName", OpponentText(mainData(rowIndex, 20), "W" & excelRow), "date", dateText, _
            "season", OpponentText(roundData(rowIndex, 1), "AW" & excelRow), _
            "round", OpponentText(roundData(rowIndex, 2), "AX" & excelRow))
        Set record = OpponentRecord(dataNo, dateText, fields, status)
        Set historyCounts = OpponentHistoryCounts(totalHistoryData, courseHistoryData, rowIndex, excelRow)
        record.Add "excelHistory", historyCounts
        If Len(confirmedAt) > 0 Then
            record.Add "opponentConfirmedAt", confirmedAt
            record("createdAt") = confirmedAt
            record("updatedAt") = confirmedAt
        End If
        temporaryNo = Trim$(OpponentText(mainData(rowIndex, 21), "X" & excelRow))
        If Len(temporaryNo) > 0 Then
            If seenTemporary.Exists(temporaryNo) Then OpponentFail "Duplicate provisional number: X" & excelRow
            seenTemporary.Add temporaryNo, True
            record.Add "temporaryNo", temporaryNo
        End If
        If outputCount > 0 Then file.Write ","
        file.Write DacWriteJson(record)
        outputCount = outputCount + 1
        If rowIndex Mod 250 = 0 Then
            Application.StatusBar = "OPPONENT_Master: " & outputCount & " records exported"
            DoEvents
        End If
NextRow:
    Next rowIndex

    If outputCount = 0 Then OpponentFail "No opponent history rows were found."
    file.Write "]}"
    file.Close
    Set file = Nothing
    If Not wb.Saved Or Application.CalculationState <> xlDone Then
        OpponentFail "The source workbook changed during export. Save and run again."
    End If
    fso.MoveFile tempPath, outputPath
    tempCreated = False
    Application.StatusBar = False
    OPPONENT_Master_ExportToPath = outputCount
    Exit Function

Failed:
    savedNumber = Err.Number
    savedSource = Err.Source
    errorMessage = Err.Description
    On Error Resume Next
    If Not file Is Nothing Then file.Close
    If tempCreated And Not fso Is Nothing Then
        If fso.FileExists(tempPath) Then fso.DeleteFile tempPath, True
    End If
    If Err.Number <> 0 Then errorMessage = errorMessage & vbCrLf & "Temporary file cleanup failed: " & Err.Description
    Application.StatusBar = False
    On Error GoTo 0
    Err.Raise savedNumber, savedSource, errorMessage
End Function
