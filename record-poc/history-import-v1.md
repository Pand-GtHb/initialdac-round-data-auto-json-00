# 対戦記録CSV v1

## 用途

このCSVは、個々の対戦記録をこのアプリへ追加するための形式です。Excelの集計後CSVにある前回対戦、対戦数、勝率、検索キー等の派生列は読み込まず、対戦記録からアプリ内で集計します。

UTF-8（BOM可）、カンマ区切り、RFC 4180形式です。ヘッダーは必須で、v1の列は次の順です。

`format_version,record_id,status,card,myRank,myStars,opponentRank,opponentStars,opponent,homeArea,homeShop,behavior,copiedRate,nameNote,note,team,teamShop,choice,random,course,night,win,car,opponentCar,battleArea,battleShop,normalizedName,date,season,round`

出力には末尾に `temporary_no`（仮No.、旧記録では空欄）と `opponent_confirmed_at`（相手情報の確定日時）を追加します。旧形式のこれらの列がないCSVも読み込めます。列名は大文字・小文字を含めて固定です。列の並べ替えは可能ですが、それ以外の列の追加・削除・重複はできません。

| 列 | 内容 |
|---|---|
| `format_version` | 全行で `1` |
| `record_id` | 記録を識別する不変ID。Excel由来は `excel-datano:番号`。空欄不可 |
| `temporary_no` | アプリで新規保存した対戦の仮No.。旧CSVでは省略可能 |
| `opponent_confirmed_at` | 秒までのISO日時（例：`2026-11-17T22:51:02+09:00`、`Z`も可）。時刻不明は空欄、旧CSVでは省略可能 |
| `status` | 旧形式との互換値 `pending` または `confirmed`。画面では区別しない |
| `card` ～ `round` | アプリ内の記録フィールド。項目名は `model.js` の記録フィールドキーと一致 |

フラグ列 `choice`, `random`, `night`, `win` は `"1"`、`"0"` または空欄です。`win` の `"1"` は勝ち、`"0"` は負けです。2026-11-17更新のExcelでは `R列` の空欄は負けを表すため、取込時に `"0"` へ正規化します。
Excel由来の旧値 `random="R"`、`night="夜"` は取込時に `"1"` へ正規化します。

CSVをExcelでも開けるよう、`=`, `+`, `-`, `@` で始まる値は出力時にアポストロフィを付けます。取込時にこの出力エスケープを解除します。元値がアポストロフィ＋数式文字の場合はアポストロフィを2つにして出力し、元値を復元します。

`date` は `YYYY-MM-DD` または `YYYY/MM/DD` 形式です。Excelのシリアル日付には対応しません。改行・引用符・カンマを含むセルはCSVの規則どおり引用してください。

## Excel集計後CSVからの変換

`tools/convert_aggregated_csv.ps1` は、提示された集計後CSVの列位置と使用する列名を検査してv1へ変換します。Excelに重複列名があるため、列名だけに依存しません。`Data_No.` を `record_id`（`excel-datano:`接頭辞付き）に利用し、空欄はエラーにします。日付・シーズン・ラウンドは入力列を優先し、空欄の場合は元CSVの計算済み列で補います。元CSVのカード欄は、カード名が入力された行から次のカード名が現れるまで、空欄に直前のカード名を補います。カード名がまだ一度も現れていない行は空欄のままです。v1 CSVでは各記録の `card` 欄にカード名を明示してください。勝敗欄が空欄の行は、今回の元データの意味に合わせ負け `"0"` として出力します。

Dシートから直接JSONへ書き出す場合は `tools/export_record_poc.ps1` を使用します。10行目以降の指定列を読み、`O=R`・`Q=夜` を `"1"`、`R` の空欄を負け `"0"` に正規化します。AC列を正式Data_No.、X列を仮No.として出力します。出力はOPPONENT_Masterなので、抽出範囲でアプリの正式記録が置き換わる点に注意してください。`F`（対戦相手）が空欄の行はData_No.付きの一意な仮名を設定します。仮名は実在の相手との履歴照合には使われません。

例：`powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\convert_aggregated_csv.ps1 -InputPath "C:\path\集計後.csv" -OutputPath "C:\path\対戦記録-v1.csv"`

CSV v1では、過去のアプリ記録とIDが異なる場合、日付・相手名と、両方に入力済みの所属店舗・コース・車種が一致する記録を照合します。一意に特定できるときだけ既存記録の空欄を補完し、既存値は上書きしません。候補が複数で判別できないCSVは全体を拒否します。異なるExcelのData_No.同士は別の対戦です。仮No.付き記録と異なるIDの記録が一致する可能性があるCSVは停止します。仮登録から正式登録への移行には、X列の仮No.を含むOPPONENT_Master JSONを使用してください。

変換されるのは元CSVの個々の対戦内容だけです。前回対戦・勝率等の集計結果は変換しません。必要な過去対戦行が入力CSVに含まれていない場合、その過去戦績を完全には再構成できません。

## アプリへの取込・出力

「設定・バックアップ」タブの「対戦記録CSV v1を追加」で複数行を追加できます。同一CSV内のID重複、形式・日付・必須項目の不正はファイル全体を拒否します。同じIDは既存値を保持しつつ空欄のみ補い、再取込で変更がなければスキップします。現在の下書きと設定は変更しません。

「集計後CSV v1を出力（入力用）」から同じ形式を出力できます。仮No.とrecord_idは別の列です。正式Data_No.はExcelで付与します。CSVはDシートの列配置とは異なります。JSONバックアップは設定、下書き、仮No.の採番履歴も含む復元用であり、CSVとは用途が異なります。
