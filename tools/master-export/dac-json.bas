Attribute VB_Name = "DacJson"
Option Explicit

Private inputText As String
Private position As Long

Private Sub InvalidJson(ByVal message As String)
    Err.Raise vbObjectError + 401, , "JSONの形式が不正です: " & message & " (位置 " & position & ")"
End Sub

Private Sub SkipSpace()
    Do While position <= Len(inputText)
        Select Case Mid$(inputText, position, 1)
            Case " ", vbTab, vbCr, vbLf: position = position + 1
            Case Else: Exit Sub
        End Select
    Loop
End Sub

Public Function DacParseJson(ByVal text As String) As Object
    inputText = text
    position = 1
    If Left$(inputText, 1) = ChrW$(&HFEFF) Then position = 2
    SkipSpace
    If Mid$(inputText, position, 1) <> "{" Then InvalidJson "ルートはオブジェクトにしてください"
    Set DacParseJson = ReadObject()
    SkipSpace
    If position <= Len(inputText) Then InvalidJson "末尾に余分な文字があります"
End Function

Private Function ReadObject() As Object
    Dim result As Object, key As String, value As Variant, ch As String
    Set result = CreateObject("Scripting.Dictionary")
    result.CompareMode = vbBinaryCompare
    position = position + 1
    SkipSpace
    If Mid$(inputText, position, 1) = "}" Then
        position = position + 1
        Set ReadObject = result
        Exit Function
    End If
    Do
        SkipSpace
        If Mid$(inputText, position, 1) <> """" Then InvalidJson "キーがありません"
        key = ReadString()
        If result.Exists(key) Then InvalidJson "キーが重複しています"
        SkipSpace
        If Mid$(inputText, position, 1) <> ":" Then InvalidJson "コロンがありません"
        position = position + 1
        SkipSpace
        ch = Mid$(inputText, position, 1)
        If ch = "{" Or ch = "[" Then
            Set value = ReadContainer()
            result.Add key, value
            Set value = Nothing
        Else
            value = ReadScalar()
            result.Add key, value
        End If
        SkipSpace
        ch = Mid$(inputText, position, 1)
        position = position + 1
        If ch = "}" Then Exit Do
        If ch <> "," Then InvalidJson "オブジェクトの区切りが不正です"
    Loop
    Set ReadObject = result
End Function

Private Function ReadArray() As Collection
    Dim result As New Collection, value As Variant, ch As String
    position = position + 1
    SkipSpace
    If Mid$(inputText, position, 1) = "]" Then
        position = position + 1
        Set ReadArray = result
        Exit Function
    End If
    Do
        SkipSpace
        ch = Mid$(inputText, position, 1)
        If ch = "{" Or ch = "[" Then
            Set value = ReadContainer()
            result.Add value
            Set value = Nothing
        Else
            value = ReadScalar()
            result.Add value
        End If
        SkipSpace
        ch = Mid$(inputText, position, 1)
        position = position + 1
        If ch = "]" Then Exit Do
        If ch <> "," Then InvalidJson "配列の区切りが不正です"
    Loop
    Set ReadArray = result
End Function

Private Function ReadContainer() As Object
    Select Case Mid$(inputText, position, 1)
        Case "{": Set ReadContainer = ReadObject()
        Case "[": Set ReadContainer = ReadArray()
        Case Else: InvalidJson "オブジェクトまたは配列がありません"
    End Select
End Function

Private Function ReadScalar() As Variant
    Dim ch As String
    ch = Mid$(inputText, position, 1)
    Select Case ch
        Case """": ReadScalar = ReadString()
        Case "t"
            If Mid$(inputText, position, 4) <> "true" Then InvalidJson "trueが不正です"
            position = position + 4
            ReadScalar = True
        Case "f"
            If Mid$(inputText, position, 5) <> "false" Then InvalidJson "falseが不正です"
            position = position + 5
            ReadScalar = False
        Case "n"
            If Mid$(inputText, position, 4) <> "null" Then InvalidJson "nullが不正です"
            position = position + 4
            ReadScalar = Null
        Case Else: ReadScalar = ReadNumber()
    End Select
End Function

Private Function ReadString() As String
    Dim result As String, ch As String, digits As String, code As Long
    position = position + 1
    Do While position <= Len(inputText)
        ch = Mid$(inputText, position, 1)
        position = position + 1
        If ch = """" Then
            ReadString = result
            Exit Function
        ElseIf ch = "\" Then
            ch = Mid$(inputText, position, 1)
            position = position + 1
            Select Case ch
                Case """", "\", "/": result = result & ch
                Case "b": result = result & Chr$(8)
                Case "f": result = result & Chr$(12)
                Case "n": result = result & vbLf
                Case "r": result = result & vbCr
                Case "t": result = result & vbTab
                Case "u"
                    digits = Mid$(inputText, position, 4)
                    If Len(digits) <> 4 Or digits Like "*[!0-9A-Fa-f]*" Then InvalidJson "Unicodeが不正です"
                    code = CLng("&H" & digits)
                    If code > 32767 Then code = code - 65536
                    result = result & ChrW$(code)
                    position = position + 4
                Case Else: InvalidJson "エスケープが不正です"
            End Select
        Else
            If AscW(ch) >= 0 And AscW(ch) < 32 Then InvalidJson "制御文字が不正です"
            result = result & ch
        End If
    Loop
    InvalidJson "文字列が閉じられていません"
End Function

Private Function ReadNumber() As Double
    Dim start As Long, token As String, re As Object
    start = position
    Do While position <= Len(inputText)
        If InStr(1, "-+0123456789.eE", Mid$(inputText, position, 1), vbBinaryCompare) = 0 Then Exit Do
        position = position + 1
    Loop
    token = Mid$(inputText, start, position - start)
    Set re = CreateObject("VBScript.RegExp")
    re.Pattern = "^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$"
    If Not re.Test(token) Then InvalidJson "数値が不正です"
    ReadNumber = Val(token)
End Function

Private Function WriteString(ByVal value As String) As String
    Dim i As Long, code As Long, result As String
    result = """"
    For i = 1 To Len(value)
        code = AscW(Mid$(value, i, 1))
        If code < 0 Then code = code + 65536
        Select Case code
            Case 34: result = result & "\"""
            Case 92: result = result & "\\"
            Case 32 To 126: result = result & ChrW$(code)
            Case Else: result = result & "\u" & Right$("0000" & Hex$(code), 4)
        End Select
    Next i
    WriteString = result & """"
End Function

Public Function DacWriteJson(ByVal value As Variant) As String
    Dim result As String, key As Variant, item As Variant, first As Boolean
    If IsObject(value) Then
        first = True
        If TypeName(value) = "Collection" Then
            result = "["
            For Each item In value
                If Not first Then result = result & ","
                result = result & DacWriteJson(item)
                first = False
            Next item
            DacWriteJson = result & "]"
        ElseIf TypeName(value) = "Dictionary" Then
            result = "{"
            For Each key In value.Keys
                If Not first Then result = result & ","
                result = result & WriteString(CStr(key)) & ":" & DacWriteJson(value(key))
                first = False
            Next key
            DacWriteJson = result & "}"
        Else
            Err.Raise vbObjectError + 402, , "JSONに未対応のオブジェクトがあります"
        End If
    ElseIf IsNull(value) Then
        DacWriteJson = "null"
    Else
        Select Case VarType(value)
            Case vbString: DacWriteJson = WriteString(CStr(value))
            Case vbBoolean
                If value Then DacWriteJson = "true" Else DacWriteJson = "false"
            Case vbByte, vbInteger, vbLong, vbSingle, vbDouble, vbCurrency, vbDecimal
                DacWriteJson = Trim$(Str$(value))
            Case Else
                Err.Raise vbObjectError + 403, , "JSONに未対応の値があります"
        End Select
    End If
End Function
