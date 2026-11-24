Attribute VB_Name = "DacOpponentButton"
Option Explicit

Private Sub EnsureButton(ByVal sheet As Worksheet, ByVal buttonName As String, _
                         ByVal caption As String, ByVal macroName As String, _
                         ByVal target As Range)
    Dim button As Object
    For Each button In sheet.Buttons
        If StrComp(button.Name, buttonName, vbBinaryCompare) = 0 Then
            button.Caption = caption
            button.OnAction = macroName
            Exit Sub
        End If
    Next button

    Set button = sheet.Buttons.Add(target.Left, target.Top, target.Width, target.Height)
    button.Name = buttonName
    button.Caption = caption
    button.OnAction = macroName
End Sub

Public Sub OPPONENT_Master_AddButton()
    Dim sheet As Worksheet, dailyMacroName As String, timingMacroName As String
    On Error GoTo Failed

    Set sheet = ThisWorkbook.Worksheets("Sheet1")
    dailyMacroName = "'" & ThisWorkbook.Name & "'!" & ChrW$(&H65E5) & ChrW$(&H6B21) & _
                     ChrW$(&H30DE) & ChrW$(&H30B9) & ChrW$(&H30BF) & ChrW$(&H30FC) & _
                     ChrW$(&H51FA) & ChrW$(&H529B)
    timingMacroName = "'" & ThisWorkbook.Name & "'!" & ChrW$(&H30BF) & ChrW$(&H30A4) & _
                      ChrW$(&H30DF) & ChrW$(&H30F3) & ChrW$(&H30B0) & ChrW$(&H30DE) & _
                      ChrW$(&H30B9) & ChrW$(&H30BF) & ChrW$(&H30FC) & ChrW$(&H51FA) & ChrW$(&H529B)
    EnsureButton sheet, "btnOPPONENTMaster", "OPPONENT_Master" & ChrW$(&H751F) & ChrW$(&H6210), _
                 "'" & ThisWorkbook.Name & "'!OPPONENT_Master_Export", sheet.Range("F4:H7")
    EnsureButton sheet, "btnDailyMasters", _
                 ChrW$(&H65E5) & ChrW$(&H6B21) & ChrW$(&H30DE) & ChrW$(&H30B9) & _
                 ChrW$(&H30BF) & ChrW$(&H30FC) & ChrW$(&H66F4) & ChrW$(&H65B0), _
                 dailyMacroName, sheet.Range("J4:L7")
    EnsureButton sheet, "btnTimingMasters", _
                 ChrW$(&H30BF) & ChrW$(&H30A4) & ChrW$(&H30DF) & ChrW$(&H30F3) & _
                 ChrW$(&H30B0) & ChrW$(&H30DE) & ChrW$(&H30B9) & ChrW$(&H30BF) & _
                 ChrW$(&H30FC) & ChrW$(&H66F4) & ChrW$(&H65B0), _
                 timingMacroName, sheet.Range("M4:O7")
    MsgBox "マスター更新ボタンを確認・設定しました。", vbInformation
    Exit Sub

Failed:
    MsgBox "マスター更新ボタンを設定できませんでした。" & vbCrLf & Err.Description, vbExclamation
End Sub
