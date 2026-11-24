const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../record-poc/model.js");

test("win rates round to integers and count all historical matches without mutating records", () => {
  const records = [record({ win: "1" }), record({ win: "1" }), record({ win: "" })];
  const original = structuredClone(records);
  assert.equal(M.formatWinRate(records), "67%（2/3）");
  assert.equal(M.formatWinRate([record({ win: "0" }), record({ win: "" })]), "0%（0/2）");
  assert.equal(M.formatWinRate([record({ win: "1" })]), "100%（1/1）");
  assert.equal(M.formatWinRate([]), "");
  assert.deepEqual(records, original);
});

test("opponent win rates use all matching records and verified shop aliases", () => {
  const won = record({ opponent: "ＡＢＣ", homeShop: "旧店", win: "1" });
  const lost = record({ opponent: "ABC", homeShop: "新店", win: "" });
  const other = record({ opponent: "ABC", homeShop: "別店", win: "1" });
  const incomplete = record({ opponent: "ABC", homeShop: "", win: "1" });
  const records = [won, lost, other, incomplete];
  const rates = M.opponentWinRates(records, { "旧店": "新店" });
  assert.equal(rates.get(won), "50%（1/2）");
  assert.equal(rates.get(lost), M.formatWinRate(M.findHistory(records, lost.values, { "旧店": "新店" })));
  assert.equal(rates.get(other), "100%（1/1）");
  assert.equal(rates.has(incomplete), false);
  const visibleRates = M.opponentWinRates(records, { "旧店": "新店" }, [won, incomplete]);
  assert.deepEqual([...visibleRates], [[won, rates.get(won)]]);
});

test("Excel opponent snapshots add the baseline row once and keep app records separate", () => {
  const first = { ...record({ date: "2026-11-18", course: "A", win: "1" }), id: "excel-datano:1",
    excelHistory: { sourceRow: 10, matches: 4, wins: 3, courseMatches: 1, courseWins: 1, snapshotId: "snapshot" } };
  const last = { ...record({ date: "2026-11-17", course: "B", win: "0" }), id: "excel-datano:2",
    excelHistory: { sourceRow: 11, matches: 5, wins: 4, courseMatches: 0, courseWins: 0, snapshotId: "snapshot" } };
  const local = record({ course: "A", win: "1" });
  const result = M.excelHistoryStats([first, last, local], first.values, {});
  assert.deepEqual(result.total, { matches: 6, wins: 4, id: last.id });
  assert.deepEqual(result.course, { matches: 2, wins: 2, id: first.id });
  assert.deepEqual(result.local, { matches: 1, wins: 1, unknown: 0 });
  assert.equal(M.excelHistoryStats([first, { ...last, excelHistory: undefined }], first.values, {}).total, undefined);
  assert.match(M.excelHistoryStats([first, { ...last, excelHistory: { ...last.excelHistory, snapshotId: "other" } }], first.values, {}).reason, /混在/);
  assert.match(M.excelHistoryStats([first], { ...first.values, homeShop: "改名店" }, { "セガ○○": "改名店" }).reason, /店舗別名/);
  assert.equal(M.excelHistoryStats([first], { ...first.values, course: "unknown" }, {}).course, null);
});

test("Excel history snapshots reject malformed counts and duplicated source rows", () => {
  const formal = { ...record(), id: "excel-datano:1",
    excelHistory: { sourceRow: 10, matches: 2, wins: 1, courseMatches: 1, courseWins: 1 } };
  const master = records => ({ schema: 1, masterType: "OPPONENT_Master", records });
  const imported = M.replaceHistory([], master([formal]));
  assert.ok(imported.records[0].excelHistory.snapshotId);
  assert.equal(M.excelHistoryStats(imported.records, formal.values, {}).total.matches, 3);
  assert.equal(M.replaceHistory(imported.records, master([formal])).updated, 0);
  assert.throws(() => M.replaceHistory([], master([{ ...formal,
    excelHistory: { ...formal.excelHistory, wins: 3 } }])), /勝数・戦数/);
  assert.throws(() => M.replaceHistory([], master([{ ...formal,
    excelHistory: { ...formal.excelHistory, courseWins: null } }])), /勝数・戦数/);
  assert.throws(() => M.replaceHistory([], master([formal, { ...formal, id: "excel-datano:2" }])), /基準行.*重複/);
});

test("master preview detects records missing Excel opponent baselines", () => {
  const base = record();
  assert.equal(M.missingExcelBaselines([
    base,
    { ...base, excelHistory: { matches: null } },
    { ...base, excelHistory: { matches: 0 } }
  ]), 2);
  assert.equal(M.missingExcelBaselines([]), 0);
});

test("win-rate color uses specified gradient thresholds and is absent for missing history", () => {
  assert.deepEqual(M.winRateColor(0, 0), null);
  assert.deepEqual(M.winRateColor(4, 10), { background: "rgb(255, 255, 0)", foreground: "#000000" });
  assert.equal(M.winRateColor(0, 10).background, "rgb(255, 255, 0)");
  assert.equal(M.winRateColor(5, 10).background, "rgb(153, 204, 128)");
  assert.equal(M.winRateColor(6, 10).background, "rgb(51, 153, 255)");
  assert.equal(M.winRateColor(15, 20).background, "rgb(134, 142, 255)");
  assert.equal(M.winRateColor(9, 10).background, "rgb(216, 131, 255)");
  assert.equal(M.winRateColor(10, 10).background, "rgb(216, 131, 255)");
  assert.equal(M.winRateColor(11, 10), null);
  for (let wins = 0; wins <= 100; wins++) {
    const color = M.winRateColor(wins, 100);
    const components = color.background.match(/\d+/g).map(value => {
      const channel = Number(value) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * components[0] + 0.7152 * components[1] + 0.0722 * components[2];
    const contrast = color.foreground === "#000000" ? (luminance + 0.05) / 0.05 : 1.05 / (luminance + 0.05);
    assert.ok(contrast >= 4.5, `${wins}%: ${contrast}`);
  }
});

function record(values = {}) {
  const draft = M.newDraft();
  Object.assign(draft.values, { opponent: "ABC", homeShop: "セガ○○", win: "1" }, values);
  return draft;
}

test("editing an app record preserves identity, ordering, timestamp and CSV output", () => {
  const first = { ...record({ date: "2026-11-19", opponent: "Old" }),
    temporaryNo: "20261119-A-001", createdAt: "original", updatedAt: "original",
    opponentConfirmedAt: "2026-11-19T13:14:15+09:00" };
  const other = record({ opponent: "Other" });
  const original = structuredClone([first, other]);
  const edited = M.editAppRecord([first, other], first.id,
    { opponent: "New", win: "0", date: "2026-11-20" }, "updated");
  assert.deepEqual([first, other], original);
  assert.equal(edited[0].id, first.id);
  assert.equal(edited[0].temporaryNo, first.temporaryNo);
  assert.equal(edited[0].createdAt, "original");
  assert.equal(edited[0].updatedAt, "updated");
  assert.equal(edited[0].opponentConfirmedAt, first.opponentConfirmedAt);
  assert.equal(edited[0].values.normalizedName, "Ｎｅｗ");
  assert.equal(edited[1], other);
  assert.equal(M.matchDateTime(edited[0]), "2026-11-20");
  const csv = M.toExcelCsv(edited);
  assert.match(csv, /New/);
  assert.match(csv, /20261119-A-001/);
  assert.doesNotMatch(csv, /13:14:15/);
});

test("editing rejects formal, missing or invalid records without altering existing data", () => {
  const local = record();
  const official = { ...record(), id: "excel-datano:1" };
  const records = [local, official];
  const original = structuredClone(records);
  assert.throws(() => M.editAppRecord(records, official.id, { win: "0" }, "now"), /正式記録/);
  assert.throws(() => M.editAppRecord(records, "missing", {}, "now"), /見つかりません/);
  assert.throws(() => M.editAppRecord(records, local.id, { opponent: " " }, "now"), /名前・日付/);
  assert.throws(() => M.editAppRecord(records, local.id, { date: "2026-02-30" }, "now"), /日付/);
  assert.deepEqual(records, original);
});

test("editing a date-only record does not invent a time or change untouched fields", () => {
  const original = record({ date: "2026-11-19", opponent: "ABC", normalizedName: "旧表記", copiedRate: "57%" });
  const edited = M.editAppRecord([original], original.id, { note: "訂正" }, "now")[0];
  assert.equal(edited.opponentConfirmedAt, undefined);
  assert.equal(edited.values.normalizedName, "旧表記");
  assert.equal(edited.values.copiedRate, "57%");
  assert.equal(M.matchDateTime(edited), "2026-11-19");
});

test("changing course resets course conditions but selecting the same course preserves them", () => {
  const values = { course: "A", choice: "1", night: "1", random: "1", note: "keep" };
  assert.equal(M.withCourse(values, "A"), values);
  assert.deepEqual(M.withCourse(values, "B"), { course: "B", choice: "", night: "", random: "", note: "keep" });
  assert.deepEqual(M.withCourse({ ...values, course: "" }, "A"),
    { course: "A", choice: "", night: "", random: "", note: "keep" });
  assert.equal(values.choice, "1");
});

test("record search includes both notes and preserves matches across fields", () => {
  const r = record({ opponent: "ＡＢＣ", homeShop: "Shop", team: "TEAM", nameNote: "ｶﾞｷﾞ", note: "Memo MEMO" });
  assert.deepEqual(M.recordSearchMatches(r, "abc shop"), { opponent: [[0, 3]], homeShop: [[0, 4]] });
  assert.deepEqual(M.recordSearchMatches(r, "ガ"), { nameNote: [[0, 1]] });
  assert.deepEqual(M.recordSearchMatches(r, "memo"), { note: [[0, 4], [5, 9]] });
  assert.equal(M.recordSearchMatches(r, "missing"), null);
  assert.deepEqual(M.recordSearchMatches(r, ""), {});
});

test("record search distinguishes the opponent's home area from the battle area", () => {
  const r = record({ homeArea: "東京都", homeShop: "東京店", battleArea: "大阪府" });
  assert.deepEqual(M.recordSearchMatches(r, "東京"), { homeShop: [[0, 2]], homeArea: [[0, 2]] });
  assert.deepEqual(M.recordSearchMatches(r, "都"), { homeArea: [[2, 3]] });
  assert.deepEqual(M.recordSearchMatches(r, "大阪"), { battleArea: [[0, 2]] });
});

test("history date filter includes formal and provisional matches before pagination", () => {
  const date = "2026-11-19";
  const values = { date, opponent: "ABC", card: "A" };
  const official = { ...record(values), id: "excel-datano:1" };
  const provisional = record(values);
  const others = Array.from({ length: 60 }, () => record({ ...values, date: "2026-11-20" }));
  const records = [official, provisional, ...others];
  const result = M.recordHistoryPage(records, "ABC", 1, "ABC", "A", date);
  assert.deepEqual(result.rows, [provisional, official]);
  assert.equal(result.total, 2);
  assert.equal(result.page, 0);
  assert.equal(M.recordHistoryPage(records, "missing", 0, "", "", date).total, 0);
});

test("history pagination preserves newest-first order and clamps the last page", () => {
  const records = Array.from({ length: 103 }, (_, index) => record({ opponent: `Match ${index}` }));
  const first = M.recordHistoryPage(records, "", 0);
  const last = M.recordHistoryPage(records, "", 12);
  assert.deepEqual(first.rows, records.slice(53).reverse());
  assert.deepEqual([first.total, first.firstShown, first.lastShown], [103, 1, 50]);
  assert.deepEqual(last.rows, records.slice(0, 3).reverse());
  assert.deepEqual([last.page, last.firstShown, last.lastShown], [2, 101, 103]);
  assert.equal(records[0].values.opponent, "Match 0");
});

test("history search uses all pages but highlights only visible matches", () => {
  const older = record({ opponent: "ＡＢＣ", homeShop: "Shop" });
  const records = [older, ...Array.from({ length: 101 }, () => record({ opponent: "Other" }))];
  const found = M.recordHistoryPage(records, "abc shop", 0);
  assert.deepEqual(found.rows, [older]);
  assert.deepEqual(found.matches.get(older), { opponent: [[0, 3]], homeShop: [[0, 4]] });
  const broad = M.recordHistoryPage(records, "other", 1);
  assert.equal(broad.total, 101);
  assert.equal(broad.matches.size, 50);
  const empty = M.recordHistoryPage(records, "missing", 3);
  assert.deepEqual([empty.total, empty.page, empty.rows.length, empty.firstShown, empty.lastShown], [0, 0, 0, 0, 0]);
});

test("opponent column filtering ignores other columns and combines with history search before paging", () => {
  const wanted = record({ opponent: "ＡＢＣ選手", homeShop: "東京" });
  const wrongName = record({ opponent: "別の相手", nameNote: "ABC", homeShop: "東京" });
  const wrongShop = record({ opponent: "ABC選手", homeShop: "大阪" });
  const records = [wanted, ...Array(51).fill(wrongName), wrongShop];
  assert.deepEqual(records.filter(M.opponentNameFilter("ＡＢＣ選手")), [wanted]);
  assert.deepEqual(records.filter(M.opponentNameFilter("")), records);
  const result = M.recordHistoryPage(records, "東京", 2, "ＡＢＣ選手");
  assert.deepEqual(result.rows, [wanted]);
  assert.equal(result.total, 1);
  assert.equal(result.page, 0);
});

test("opponent dropdown uses all search results and releases a stale selection", () => {
  const oldest = record({ opponent: "Older", note: "shared" });
  const recent = record({ opponent: "Recent", note: "shared" });
  const excluded = record({ opponent: "Excluded", note: "different" });
  const result = M.recordHistoryPage([oldest, ...Array(51).fill(recent), excluded], "shared", 1, "Excluded");
  assert.equal(result.page, 0);
  assert.equal(result.total, 52);
  assert.deepEqual([...new Set(result.searchRows.map(r => r.values.opponent))], ["Older", "Recent"]);
  assert.ok(!result.rows.includes(oldest));
});

test("card slot CSV contains only three vehicle cells in slot order", () => {
  const csv = M.toCardSlotsCsv({ label: "Not exported", id: "Not exported",
    activeSlots: [{ slot: 2, label: '車種,"限定"' }, { slot: 1, label: "通常車種" }] });
  assert.equal(csv, '\ufeff"通常車種"\r\n"車種,""限定"""\r\n"未登録"\r\n');
  assert.equal(M.toCardSlotsCsv({ activeSlots: [] }), '\ufeff"未登録"\r\n"未登録"\r\n"未登録"\r\n');
});

test("search highlighting maps normalized matches back to original characters", () => {
  assert.deepEqual(M.searchHighlightParts("前ｶﾞｷﾞ後", [[1, 3]]), [
    { text: "前", matched: false }, { text: "ｶﾞｷﾞ", matched: true }, { text: "後", matched: false }
  ]);
  assert.deepEqual(M.searchHighlightParts("ＡBC memo", [[0, 3], [4, 8]]), [
    { text: "ＡBC", matched: true }, { text: " ", matched: false }, { text: "memo", matched: true }
  ]);
  assert.deepEqual(M.searchHighlightParts("ﬁ", [[1, 2]]), [{ text: "ﬁ", matched: true }]);
});

test("course choice rate counts own selection rights across all courses for the same opponent", () => {
  const selected = record({ choice: "1", course: "A" });
  const otherCourse = record({ choice: "1", course: "B" });
  const notSelected = record({ choice: "0", course: "A" });
  const unknown = record({ choice: "", course: "A" });
  const otherShop = record({ choice: "1", homeShop: "別の店" });
  const otherPlayer = record({ choice: "1", opponent: "別の相手" });
  const current = record({ choice: "1" });
  const records = [selected, otherCourse, notSelected, unknown, otherShop, otherPlayer, current];
  const original = structuredClone(records);
  const history = M.findHistory(records, { opponent: "ＡＢＣ", homeShop: "GiGO○○" },
    { "セガ○○": "GiGO○○" }, current.id);
  assert.equal(M.formatCourseChoiceRate(history), "50%（2/4）");
  assert.equal(M.formatCourseChoiceRate([selected, otherCourse, notSelected]), "67%（2/3）");
  assert.equal(M.formatCourseChoiceRate([notSelected, unknown]), "0%（0/2）");
  assert.equal(M.formatCourseChoiceRate([selected]), "100%（1/1）");
  assert.equal(M.formatCourseChoiceRate([]), "");
  assert.deepEqual(records, original);
});

test("course result shows selection rate first and keeps missing-history and loss behavior", () => {
  const won = record({ date: "2026-11-15", choice: "0", win: "1" });
  const lost = record({ date: "2026-11-14", choice: "1", win: "" });
  assert.equal(M.formatCourseResult([won], won), "コース選択率0%（0/1） / 前回勝ち 2026-11-15");
  assert.equal(M.formatCourseResult([won, lost], lost), "コース選択率50%（1/2） / 前回負け 2026-11-14");
  assert.equal(M.formatCourseResult([won], undefined), "コース選択率0%（0/1） / 過去記録なし");
  assert.equal(M.formatCourseResult([], undefined), "過去記録なし");
});

test("Viewer paste maps precisely to E-H and rejects multiple players", () => {
  assert.deepEqual(M.parsePaste("★★\tABC\t東京都\tGiGO○○\r\n"), {
    opponentStars: "★★", opponent: "ABC", homeArea: "東京都", homeShop: "GiGO○○"
  });

  assert.throws(() => M.parsePaste("a\tb\tc\td\na\tb\tc\td"));
  assert.throws(() => M.parsePaste("a\tb\tc"));
  assert.equal(M.parsePaste("1\tABC\t\t").homeShop, "");
  for (const text of ["★★\tABC\t東京都\tGiGO○○\n\n",
    "\r\n \r\n★★\tABC\t東京都\tGiGO○○\r\n\r\n \r\n"]) {
    assert.deepEqual(M.parsePaste(text), M.parsePaste("★★\tABC\t東京都\tGiGO○○"));
  }
  assert.equal(M.parsePaste("\n1\tABC\t\t\n\n").homeShop, "");
  assert.throws(() => M.parsePaste("\n\n"));
  assert.throws(() => M.parsePaste("\na\tb\tc\td\n\na\tb\tc\td\n\n"));
});

test("paste defaults battle prefecture without overwriting battle shop or selected prefecture", () => {
    const values = M.newDraft().values;
    const text = "★★\tABC\t福井県\t所属店A";
    const applied = M.applyPaste(values, text);
    assert.equal(applied.battleArea, "福井県");
    assert.equal(applied.homeArea, "福井県");
    assert.equal(applied.homeShop, "所属店A");
    assert.equal(applied.battleShop, "");
    assert.equal(applied.normalizedName, "ＡＢＣ");
    assert.equal(values.battleArea, "");
    const selected = M.applyPaste({ ...values, battleArea: "東京都", battleShop: "対戦店B" }, text);
    assert.equal(selected.battleArea, "東京都");
    assert.equal(selected.battleShop, "対戦店B");
    assert.equal(M.applyPaste(values, "1\tABC\t\t").battleArea, "");
    assert.throws(() => M.applyPaste(values, "不正"));
});

test("history requires name and home shop, resolves aliases without mutating history", () => {
  const old = record({ team: "当時のチーム" });
  const other = record({ homeShop: "別の店" });
  const aliases = { "セガ○○": "GiGO○○" };
  const values = { opponent: "ＡＢＣ", homeShop: "GiGO○○" };
  assert.deepEqual(M.findHistory([old, other], values, aliases), [old]);
  assert.deepEqual(M.findHistory([old], { ...values, homeShop: "" }, aliases), []);
  assert.deepEqual(M.findHistory([old], values, aliases, old.id), []);
  assert.equal(old.values.homeShop, "セガ○○");
  assert.equal(old.values.team, "当時のチーム");
});

test("settings reject malformed lists and cyclic shop aliases", () => {
  assert.throws(() => M.validateSettings({ ...M.defaultSettings, cars: "invalid" }));
  assert.throws(() => M.validateSettings({ ...M.defaultSettings, shopAliases: { a: "b", b: "a" } }));
  M.validateSettings({ ...M.defaultSettings, shopAliases: { a: "b", b: "c" } });
});

test("same ID updates rather than appends, records require name and date regardless of legacy status", () => {
  const r = record();
  const updated = structuredClone(r);
  updated.values.team = "今回の修正";
  assert.deepEqual(M.upsert([r], updated), [updated]);
  assert.equal(r.values.team, "");
  const pending = record({ homeShop: "", win: "" });
  M.validateRecord(pending);
  pending.status = "confirmed";
  M.validateRecord(pending);
  assert.throws(() => M.validateRecord({ ...pending, values: { ...pending.values, opponent: "" } }));
});

test("backup preserves all fields and rejects duplicate IDs and invalid schema", () => {
  const r = record();
  const backup = { schema: 1, records: [r], draft: M.newDraft(), settings: structuredClone(M.defaultSettings) };
  assert.equal(M.validateBackup(JSON.parse(JSON.stringify(backup))).records.length, 1);
  assert.throws(() => M.validateBackup({ ...backup, records: [r, r] }));
  assert.throws(() => M.validateBackup({ ...backup, schema: 2 }));
  assert.throws(() => M.validateBackup({ ...backup, draft: {} }));
  M.validateBackup({ ...backup, settingsDraft: { aliases: "{入力途中" } });
  assert.throws(() => M.validateBackup({ ...backup, settingsDraft: { cars: [] } }));
});

test("CSV has BOM, CRLF, escaped cells, all A-AA fields, and formula protection", () => {
  const r = record({ opponent: '=HYPERLINK("x")', note: 'a,"b"\nc' });
  const csv = M.toCsv([r]);
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes('"a,""b""\nc"'));
  assert.equal(M.fields.length, 27);
  assert.ok(csv.endsWith("\r\n"));
});

test("Excel CSV matches the revised 25 columns including provisional number without changing records", () => {
  const r = record({
    card: "CARD", myRank: "R1", myStars: "STAR1", opponentRank: "R2", opponentStars: "STAR2",
    opponent: "ABC", homeArea: "HOME_AREA", homeShop: "HOME_SHOP", behavior: "BEHAVIOR",
    copiedRate: "MUST_NOT_EXPORT_RATE", nameNote: "CN_NOTE", note: "NOTE", team: "TEAM",
    teamShop: "TEAM_SHOP", choice: "1", random: "1", course: "COURSE", night: "1", win: "1",
    car: "CAR", opponentCar: "OPPONENT_CAR", battleArea: "BATTLE_AREA", battleShop: "BATTLE_SHOP",
    normalizedName: "STALE_NAME", date: "2026-11-17", season: "MUST_NOT_EXPORT_SEASON", round: "MUST_NOT_EXPORT_ROUND"
  });
  r.temporaryNo = "20261117-CARD-001";
  const original = structuredClone(r);
  const csv = M.toExcelCsv([r]);
  const expectedHeader = [
    "カード：入力", "ランク-自分：入力", "星-自分：入力", "ランク：相手", "星：相手",
    "対戦相手", "都道府県：所属店舗", "所属店", "ブレフラ・譲り", "CN追加メモ",
    "追加メモ", "チーム", "チーム所属", "選択権あり=1", "ランダム", "コース", "夜",
    "勝=1", "車種", "車種：相手", "都道府県：対戦店舗", "対戦店舗", "対戦相手：全角化", "仮No.", "日付：入力"
  ];
  const expectedRow = [
    "CARD", "R1", "STAR1", "R2", "STAR2", "ABC", "HOME_AREA", "HOME_SHOP", "BEHAVIOR",
    "CN_NOTE", "NOTE", "TEAM", "TEAM_SHOP", "1", "R", "COURSE", "夜", "1", "CAR",
    "OPPONENT_CAR", "BATTLE_AREA", "BATTLE_SHOP", "ＡＢＣ", "20261117-CARD-001", "2026/11/17"
  ];
  assert.equal(csv, "\ufeff" + [expectedHeader, expectedRow].map(row => row.map(value => `"${value}"`).join(",")).join("\r\n") + "\r\n");
  assert.equal(expectedRow.length, 25);
  assert.deepEqual(r, original);
});

test("Excel CSV preserves legacy flags, escapes spreadsheet formulas and rejects invalid output", () => {
  const r = record({ opponent: '=NAME("x")', nameNote: 'a,"b"\nc', date: "2026/11/17",
    choice: "0", random: "R", night: "夜", win: "0" });
  const csv = M.toExcelCsv([r]);
  assert.ok(csv.includes(`"'=NAME(""x"")"`));
  assert.ok(csv.includes('"a,""b""\nc"'));
  assert.ok(csv.includes(',"","","","R","","夜","","'));
  assert.ok(csv.endsWith(',"","2026/11/17"\r\n'));
  const numericCode = M.toExcelCsv([record({ behavior: "-77", note: "-77" })]);
  assert.ok(numericCode.includes(',"-77","","\'-77",'));
  assert.ok(M.toExcelCsv([record({ behavior: "-1+2" })]).includes(`"'-1+2"`));
  for (const [key, value] of [["random", "invalid"], ["date", "2026-02-30"]]) {
    assert.throws(() => M.toExcelCsv([record({ [key]: value })]), /不正|実在/);
  }
  const numbered = { ...record(), temporaryNo: "20261117-CARD-001" };
  assert.throws(() => M.toExcelCsv([numbered, structuredClone(numbered)]), /重複/);
});

test("opponent confirmation freezes time for the same identity and refreshes it for a different opponent", () => {
  const original = record({ date: "2026-11-17", homeShop: "旧店" });
  const aliases = { "旧店": "新店" };
  const first = M.captureOpponentTime(original, original.values, aliases, new Date(2026, 10, 17, 21, 32, 6));
  assert.match(first.opponentConfirmedAt, /^2026-11-17T21:32:06[+-]\d{2}:\d{2}$/);
  assert.equal(original.opponentConfirmedAt, undefined);
  const same = M.captureOpponentTime(first, { ...first.values, opponent: "ＡＢＣ", homeShop: "新店", note: "今回" },
    aliases, new Date(2026, 10, 17, 21, 40));
  assert.equal(same.opponentConfirmedAt, first.opponentConfirmedAt);
  assert.equal(M.hasCurrentOpponentTime({ ...same, values: { ...same.values, opponent: "OTHER" } }, aliases), false);
  const different = M.captureOpponentTime(same, { ...same.values, opponent: "OTHER" },
    aliases, new Date(2026, 10, 17, 21, 45, 10));
  assert.match(different.opponentConfirmedAt, /T21:45:10/);
  assert.equal(M.hasCurrentOpponentTime(different, aliases), true);
});

test("opponent input start survives edits and backup without changing legacy timestamp behavior", () => {
  const original = M.newDraft();
  const first = M.startOpponentTime(original, { ...original.values, opponent: "A" }, {}, new Date(2026, 10, 17, 21, 32, 6));
  const edited = M.startOpponentTime(first, { ...first.values, opponent: "ABC", homeShop: "店" }, {},
    new Date(2026, 10, 17, 21, 45, 10));
  assert.equal(edited.opponentConfirmedAt, first.opponentConfirmedAt);
  assert.equal(M.hasCurrentOpponentTime(edited), true);
  assert.equal(M.matchDateTime({ ...edited, values: { ...edited.values, date: "2026-11-17" } }), "2026-11-17 21:32:06");
  assert.equal(M.startOpponentTime(original, original.values, {}).opponentConfirmedAt, undefined);
  const backup = { schema: 1, records: [], draft: edited, settings: M.defaultSettings };
  assert.deepEqual(M.validateBackup(JSON.parse(JSON.stringify(backup))), backup);
});

test("draft warning ignores continuing context but includes an entered loss and pasted text", () => {
  const draft = M.newDraft();
  Object.assign(draft.values, { card: "A", myRank: "PRIDE", opponentRank: "PRIDE" });
  assert.equal(M.hasMatchDraft(draft), false);
  assert.equal(M.hasMatchDraft(draft, "paste"), true);
  draft.values.win = "0";
  assert.equal(M.hasMatchDraft(draft), true);
});

test("card filtering is applied before history pagination and combines with opponent and search", () => {
  const wanted = record({ opponent: "ABC", homeShop: "東京", card: "A" });
  const others = Array.from({ length: 60 }, () => record({ opponent: "ABC", homeShop: "東京", card: "B" }));
  const result = M.recordHistoryPage([wanted, ...others], "東京", 0, "ABC", "A");
  assert.deepEqual(result.rows, [wanted]);
  assert.equal(result.total, 1);
});

test("round summaries combine saved official and app records by card and date and expose unknown outcomes", () => {
  const make = values => record({ season: "S", round: "R", card: "A", date: "2026-11-17", ...values });
  const rows = [make({ win: "1" }), { ...make({ win: "0" }), id: "excel-datano:1" },
    make({ win: "" }), make({ card: "B", date: "2026-11-18" }), make({ round: "other" })];
  assert.deepEqual(M.summarizeMatches(rows, "S", "R"), [
    { card: "A", date: "2026-11-17", wins: 1, total: 3, unknown: 1 },
    { card: "B", date: "2026-11-18", wins: 1, total: 1, unknown: 0 }
  ]);
});

test("pivot summaries group seasons, rounds and dates and follow master card order", () => {
  const make = values => record({ season: "S", round: "R", card: "B", date: "2026-11-17", ...values });
  const rows = [make({ win: "1" }), make({ card: "A", win: "0" }),
    make({ card: "外", date: "2026-11-18", win: "" }), make({ round: "R2", win: "1" }),
    make({ season: "S2", win: "1" })];
  const seasons = M.summarizePivot(rows, ["B", "A"]);
  assert.deepEqual(seasons.map(s => [s.name, s.wins, s.total, s.unknown]), [["S", 2, 4, 1], ["S2", 1, 1, 0]]);
  const round = seasons[0].rounds[0];
  assert.deepEqual(round.cards.map(c => [c.name, c.wins, c.total, c.unknown]),
    [["B", 1, 1, 0], ["A", 0, 1, 0], ["外", 0, 1, 1]]);
  assert.deepEqual(round.days.map(d => [d.name, d.total, d.cards.map(c => c.name)]),
    [["2026-11-17", 2, ["B", "A"]], ["2026-11-18", 1, ["外"]]]);
});

test("card filter candidates follow master order with unregistered names last", () => {
  const names = ["外10", "A", "B", "外2"];
  assert.deepEqual(M.sortCardNames(names, ["B", "A", "未使用"]), ["B", "A", "外2", "外10"]);
  assert.deepEqual(names, ["外10", "A", "B", "外2"]);
  assert.deepEqual(M.sortCardNames(["B", "A"], []), ["A", "B"]);
});

test("pivot summaries order the open round between first and second", () => {
  const rows = ["12th", "2nd", "オープン", "1st", "3rd"].map(round =>
    record({ season: "S", round }));
  assert.deepEqual(M.summarizePivot(rows, [])[0].rounds.map(round => round.name),
    ["1st", "オープン", "2nd", "3rd", "12th"]);
});

test("settings accept a saved theme and reject invalid theme values", () => {
  const settings = { ...structuredClone(M.defaultSettings), theme: "dark" };
  assert.doesNotThrow(() => M.validateSettings(settings));
  assert.throws(() => M.validateSettings({ ...settings, theme: "invalid" }), /画面配色/);
  assert.doesNotThrow(() => M.validateSettings(structuredClone(M.defaultSettings)));
});

test("Excel datetime preserves local seconds and midnight without inventing historical or backdated times", () => {
  const current = { ...record({ date: "2026-11-17" }), opponentConfirmedAt: "2026-11-17T21:32:06+09:00" };
  assert.equal(M.matchDateTime(current), "2026-11-17 21:32:06");
  assert.ok(M.toExcelCsv([current]).endsWith('"2026/11/17 21:32:06"\r\n'));
  const midnight = { ...current, opponentConfirmedAt: "2026-11-17T00:00:00+09:00" };
  assert.ok(M.toExcelCsv([midnight]).endsWith('"2026/11/17 00:00:00"\r\n'));
  const historical = record({ date: "2026-11-16" });
  assert.equal(M.matchDateTime(historical), "2026-11-16");
  assert.equal(M.matchDateTime({ ...historical, opponentConfirmedAt: current.opponentConfirmedAt }), "2026-11-16");
  assert.equal(M.matchDateTime({ ...current, values: { ...current.values, date: "2026-11-18" } }), "2026-11-18");
});

test("backups and import CSV preserve confirmation time while accepting older date-only CSV", () => {
  const current = { ...record({ date: "2026-11-17" }), opponentConfirmedAt: "2026-11-17T21:32:06+09:00" };
  const draft = M.captureOpponentTime(M.newDraft(), current.values, {}, new Date(2026, 10, 17, 21, 32, 6));
  const backup = { schema: 1, records: [current], draft, settings: structuredClone(M.defaultSettings) };
  assert.deepEqual(M.validateBackup(JSON.parse(JSON.stringify(backup))), backup);
  const csv = M.toImportCsv([current]);
  assert.equal(M.mergeImportCsv([], csv).records[0].opponentConfirmedAt, current.opponentConfirmedAt);
  const legacy = csv.split("\r\n").filter(Boolean).map(row => row.split(",").slice(0, -2).join(",")).join("\r\n");
  assert.equal(M.mergeImportCsv([], legacy).records[0].opponentConfirmedAt, undefined);
  assert.equal(M.mergeImportCsv(M.mergeImportCsv([], csv).records, csv).skipped, 1);
});

test("malformed confirmation timestamps reject backups and CSV atomically", () => {
  const current = record({ date: "2026-11-17" });
  for (const at of ["2026-02-30T12:00:00+09:00", "2026-11-17T24:00:00+09:00",
    "2026-11-17T12:60:00+09:00", "2026-11-17T12:00:00+14:30", "not-a-date", 123]) {
    assert.throws(() => M.validateRecord({ ...current, opponentConfirmedAt: at }), /時刻|日付/);
  }
  assert.throws(() => M.validateRecord({ ...current, opponentConfirmedIdentity: ["ABC", "SHOP"] }), /相手情報/);
  const valid = M.toImportCsv([{ ...current, opponentConfirmedAt: "2026-11-17T21:32:06+09:00" }]);
  assert.throws(() => M.mergeImportCsv([], valid.replace("T21:32:06", "T25:32:06")), /時刻/);
});

test("master replacement adopts corrected times and distinct known times do not legacy-merge", () => {
  const first = { ...record({ date: "2026-11-17" }), id: "excel-datano:1",
    opponentConfirmedAt: "2026-11-17T21:32:06+09:00" };
  const corrected = { ...first, opponentConfirmedAt: "2026-11-17T21:40:00+09:00" };
  const replaced = M.replaceHistory([first], { schema: 1, masterType: "OPPONENT_Master", records: [corrected] });
  assert.equal(replaced.updated, 1);
  assert.equal(replaced.records[0].opponentConfirmedAt, corrected.opponentConfirmedAt);
  const imported = M.mergeImportCsv([first], M.toImportCsv([{ ...corrected, id: "legacy-other" }]));
  assert.equal(imported.added, 1);
  assert.equal(imported.records.length, 2);
});

test("import-format CSV round-trips, normalizes dates, preserves multiline cells, and skips repeated IDs", () => {
  const first = { ...record({ date: "2026-11-01", opponent: "相手,甲", note: 'メモ "A"\n2行目', nameNote: "=formula", team: "'=literal" }),
    id: "excel:37158", status: "confirmed" };
  const second = { ...record({ date: "2026-11-02", win: "", homeShop: "所属店B", random: "R", night: "夜" }),
    id: "excel:37159", status: "pending" };
  const csv = M.toImportCsv([first, second]);
  assert.ok(csv.startsWith('\ufeff"format_version","record_id","status",'));
  const imported = M.mergeImportCsv([], csv);
  assert.equal(imported.added, 2);
  assert.equal(imported.records[0].id, first.id);
  assert.equal(imported.records[0].values.opponent, "相手,甲");
  assert.equal(imported.records[0].values.note, 'メモ "A"\n2行目');
  assert.equal(imported.records[0].values.nameNote, "=formula");
  assert.equal(imported.records[0].values.team, "'=literal");
  assert.equal(imported.records[0].values.normalizedName, M.normalizeName("相手,甲"));
  assert.equal(imported.records[1].values.date, "2026-11-02");
  assert.equal(imported.records[1].values.random, "1");
  assert.equal(imported.records[1].values.night, "1");
  assert.equal(M.mergeImportCsv(imported.records, csv).added, 0);
  assert.equal(M.mergeImportCsv(imported.records, csv).skipped, 2);
  const formulaId = { ...record({ date: "2026-11-03" }), id: "=source", status: "pending" };
  assert.equal(M.mergeImportCsv([], M.toImportCsv([formulaId])).records[0].id, "=source");
  const slashDate = csv.replace("2026-11-01", "2026/11/1");
  assert.equal(M.mergeImportCsv([], slashDate).records[0].values.date, "2026-11-01");
});

test("import-format CSV rejects malformed headers, versions, dates and row widths without partial imports", () => {
  const valid = M.toImportCsv([{ ...record({ date: "2026-11-01" }), id: "excel:1", status: "pending" }]);
  assert.throws(() => M.mergeImportCsv([], ""), /ヘッダー/);
  assert.throws(() => M.mergeImportCsv([], valid.replace("format_version", "unknown")), /ヘッダー/);
  assert.throws(() => M.mergeImportCsv([], valid.replace('"1","excel:1"', '"2","excel:1"')), /バージョン/);
  assert.throws(() => M.mergeImportCsv([], valid.replace("2026-11-01", "2026-02-30")), /実在する日付/);
  assert.throws(() => M.mergeImportCsv([], valid + '"1","excel:2"\r\n'), /列数/);
  assert.throws(() => M.mergeImportCsv([], valid.replace('"1","excel:1"', '"1","excel:1"junk')), /閉じ引用符/);
  const invalidFlags = M.toImportCsv([{ ...record({ date: "2026-11-01", choice: "2" }), id: "excel:flag", status: "pending" }]);
  assert.throws(() => M.mergeImportCsv([], invalidFlags), /choiceは1、0/);
  const two = M.toImportCsv([
    { ...record({ date: "2026-11-01" }), id: "excel:1", status: "pending" },
    { ...record({ date: "2026-11-02" }), id: "excel:2", status: "pending" }
  ]).replace("excel:2", "excel:1");
  assert.throws(() => M.mergeImportCsv([], two), /CSV内で重複/);
});

test("import-format CSV supplements one legacy match without duplicating or overwriting existing values", () => {
  const old = { ...record({ date: "2026-11-01", opponent: "ＡＢＣ", homeShop: "", course: "秋名(雨)：上",
    car: "自車", opponentCar: "相手車", team: "", win: "" }), id: "legacy-row", status: "pending" };
  const incoming = { ...record({ date: "2026-11-01", opponent: "ABC", homeShop: "所属店",
    course: "秋名(雨)：上", car: "自車", opponentCar: "相手車", team: "新チーム", win: "1" }),
  id: "excel-datano:7", status: "confirmed" };
  const csv = M.toImportCsv([incoming]);
  const original = structuredClone(old);
  const merged = M.mergeImportCsv([old], csv);
  assert.equal(merged.added, 0);
  assert.equal(merged.updated, 1);
  assert.equal(merged.records[0].id, old.id);
  assert.equal(merged.records[0].values.homeShop, "所属店");
  assert.equal(merged.records[0].values.team, "新チーム");
  assert.equal(merged.records[0].status, "confirmed");
  assert.equal(old.values.homeShop, original.values.homeShop);
  assert.equal(M.mergeImportCsv(merged.records, csv).skipped, 1);
});

test("temporary numbers increment per match date and card and survive restored counters", () => {
  const values = { ...M.newDraft().values, date: "2026-11-16", card: "SHA" };
  const first = M.nextTemporaryNo([], undefined, values);
  assert.equal(first.temporaryNo, "20261116-SHA-001");
  assert.equal(M.nextTemporaryNo([], first.counters, values).temporaryNo, "20261116-SHA-002");
  assert.equal(M.nextTemporaryNo([], first.counters, { ...values, card: "MTJ" }).temporaryNo, "20261116-MTJ-001");
  assert.equal(M.nextTemporaryNo([], first.counters, { ...values, date: "2026-11-17" }).temporaryNo, "20261117-SHA-001");
  const saved = { ...record(), temporaryNo: "20261116-SHA-005" };
  const counters = M.mergeTemporaryCounters([saved], first.counters, { "20261116-SHA-": 7 });
  assert.equal(M.nextTemporaryNo([], counters, values).temporaryNo, "20261116-SHA-008");
  assert.equal(M.nextTemporaryNo([], {}, { ...values, card: "TEAM-CARD" }).temporaryNo, "20261116-TEAM-CARD-001");
  assert.throws(() => M.nextTemporaryNo([], {}, { ...values, card: "" }), /カード/);
  assert.throws(() => M.nextTemporaryNo([], {}, { ...values, date: "2026-02-30" }), /日付/);
  assert.throws(() => M.nextTemporaryNo([], { "20261116-SHA-": 999 }, values), /999/);
});

test("CSV preserves temporary numbers, accepts old headers and rejects conflicting identifiers", () => {
  const old = { ...record({ date: "2026-11-16", opponent: "ABC", normalizedName: M.normalizeName("ABC") }), id: "legacy-uuid",
    temporaryNo: "20261116-SHA-001" };
  const csv = M.toImportCsv([old]);
  assert.match(csv, /"temporary_no"/);
  assert.match(csv, /"20261116-SHA-001"/);
  assert.equal(M.mergeImportCsv([], csv).records[0].temporaryNo, old.temporaryNo);
  assert.equal(M.mergeImportCsv([old], csv).skipped, 1);
  const oldHeader = csv.replace(',"temporary_no"', "").replace(',"20261116-SHA-001"', "");
  assert.equal(M.mergeImportCsv([], oldHeader).records[0].temporaryNo, undefined);
  const collision = { ...old, id: "different-id" };
  assert.throws(() => M.mergeImportCsv([old], M.toImportCsv([collision])), /別のrecord_id/);
  assert.throws(() => M.mergeImportCsv([old], M.toImportCsv([{ ...old, temporaryNo: "20261116-SHA-002" }])), /一致しません/);
  assert.throws(() => M.upsert([old], { ...collision }), /仮No.*重複/);
});

test("official Excel IDs remain distinct and provisional-to-official ambiguity is rejected", () => {
  const values = { date: "2026-11-16", opponent: "ABC" };
  const first = { ...record(values), id: "excel-datano:77" };
  const second = { ...record(values), id: "excel-datano:78" };
  assert.equal(M.mergeImportCsv([first], M.toImportCsv([second])).added, 1);
  const provisional = { ...record(values), id: "app-id", temporaryNo: "20261116-SHA-001" };
  assert.throws(() => M.mergeImportCsv([provisional], M.toImportCsv([first])), /照合方法は未確定/);
});

test("backups and JSON history reject duplicate or malformed provisional numbers", () => {
  const first = { ...record(), id: "first", temporaryNo: "20261116-SHA-001" };
  const second = { ...record(), id: "second", temporaryNo: "20261116-SHA-001" };
  const backup = { schema: 1, records: [first], draft: M.newDraft(), settings: M.defaultSettings };
  M.validateBackup(backup);
  M.validateBackup({ ...backup, temporaryNoCounters: { "20261116-SHA-": 2 } });
  assert.throws(() => M.validateBackup({ ...backup, temporaryNoCounters: { "20261116-SHA-": 1000 } }), /採番情報/);
  assert.throws(() => M.validateBackup({ ...backup, records: [first, second] }), /重複/);
  assert.throws(() => M.mergeHistory([first], { schema: 1, records: [second] }), /重複/);
  assert.throws(() => M.upsert([], { ...first, temporaryNo: "20261116-SHA-000" }), /形式/);
});

test("import-format CSV rejects ambiguous legacy matches atomically", () => {
  const base = { ...record({ date: "2026-11-01", opponent: "ABC", homeShop: "", course: "秋名",
    car: "自車", opponentCar: "相手車" }), status: "pending" };
  const first = { ...base, id: "legacy-1" };
  const second = { ...base, id: "legacy-2" };
  const incoming = { ...record({ date: "2026-11-01", opponent: "ABC", homeShop: "所属店", course: "秋名",
    car: "自車", opponentCar: "相手車" }), id: "excel-datano:7", status: "pending" };
  const before = structuredClone([first, second]);
  assert.throws(() => M.mergeImportCsv([first, second], M.toImportCsv([incoming])), /自動照合できません/);
  assert.deepEqual([first, second], before);
});

test("one-character player search distinguishes shops, resolves aliases, and uses latest identity", () => {
  const old = record({ opponent: "ABC", homeArea: "東京都", team: "旧チーム", date: "2026-01-01" });
  const latest = record({ opponent: "ＡＢＣ", homeShop: "GiGO○○", team: "新チーム", date: "2026-02-01" });
  const other = record({ homeShop: "別の店" });
  const records = [old, latest, other];
  const aliases = { "セガ○○": "GiGO○○" };
  assert.equal(M.playerSuggestions(records, "", aliases).length, 0);
  const results = M.playerSuggestions(records, "a", aliases);
  assert.equal(results.length, 2);
  assert.ok(results.includes(latest.values));
  assert.ok(results.includes(other.values));
  assert.equal(M.playerSuggestions([old], "A", aliases, old.id).length, 0);
  assert.equal(old.values.team, "旧チーム");
});

test("team search combines past records and settings, deduplicates normalized names", () => {
  const r = record({ team: "Ｔｅａｍ甲" });
  assert.deepEqual(M.teamSuggestions([r], ["Team甲", "Team乙", "別"], "t"), ["Ｔｅａｍ甲", "Team乙"]);
  assert.deepEqual(M.teamSuggestions([r], [], ""), []);
  assert.deepEqual(M.teamSuggestions([r], [], "甲", r.id), []);
});

test("player selection copies latest affiliations and battle shop, allows edits, and preserves past records", () => {
  const first = record({ team: "以前のチーム", teamShop: "以前のチーム店舗" });
  const last = record({ team: "前回チーム", teamShop: "前回チーム店舗", homeArea: "福井県",
    battleArea: "大阪府", battleShop: "前回対戦店", course: "前回コース", car: "前回自車", opponentCar: "前回相手車" });
  const candidate = M.playerSuggestions([first, last], "A", {})[0];
  assert.equal(candidate, last.values);
  const draft = record({ team: "別の相手のチーム", battleArea: "東京都", battleShop: "今回対戦店", course: "今回コース" });
  const applied = M.applyPlayerCandidate(draft.values, candidate);
  for (const key of ["opponent", "homeArea", "homeShop", "team", "teamShop", "battleArea", "battleShop"]) assert.equal(applied[key], candidate[key]);
  for (const key of ["course", "car", "opponentCar"]) assert.equal(applied[key], candidate[key]);
  assert.equal(applied.win, "");
  applied.battleShop = "今回の修正店舗";
  assert.equal(last.values.battleShop, "前回対戦店");
  assert.equal(draft.values.battleShop, "今回対戦店");
  const noBattle = M.applyPlayerCandidate(draft.values, { ...candidate, battleArea: "", battleShop: "" });
  assert.equal(noBattle.battleArea, "東京都");
  assert.equal(noBattle.battleShop, "今回対戦店");
  const areaOnly = M.applyPlayerCandidate(draft.values, { ...candidate, battleShop: "" });
  assert.equal(areaOnly.battleArea, "大阪府");
  assert.equal(areaOnly.battleShop, "");
  applied.team = "今回の修正";
  assert.equal(last.values.team, "前回チーム");
  assert.equal(draft.values.team, "別の相手のチーム");
  const empty = M.applyPlayerCandidate(applied, { ...candidate, team: "", teamShop: "" });
  assert.equal(empty.team, "");
  assert.equal(empty.teamShop, "");
});

test("paste uses exact player identity for previous values and never copies a previous result into this match", () => {
  const old = record({ opponent: "ABC", team: "チーム", teamShop: "チーム店", course: "コース",
    car: "自車", opponentCar: "相手車", opponentStars: "★", battleArea: "大阪府", battleShop: "対戦店",
    nameNote: "HISTORICAL_CN", note: "HISTORICAL_NOTE" });
  const values = M.newDraft().values;
  const result = M.applyPasteWithHistory(values, "★★★★\tＡＢＣ\t東京都\tGiGO○○", [old],
    { "セガ○○": "GiGO○○" });
  assert.equal(result.matched, true);
  for (const key of ["team", "teamShop", "course", "car", "opponentCar", "battleArea", "battleShop"]) {
    assert.equal(result.values[key], old.values[key]);
  }
  assert.equal(result.values.opponentStars, "★★★★");
  assert.equal(result.values.homeShop, "GiGO○○");
  assert.equal(result.values.homeArea, "東京都");
  assert.equal(result.values.win, "");
  assert.equal(result.values.nameNote, "");
  assert.equal(result.values.note, "");
  assert.equal(old.values.win, "1");
  for (const text of ["★\tAB\t東京都\tセガ○○", "★\tABC\t東京都\t別店", "★\tABC\t東京都\t"]) {
    assert.equal(M.applyPasteWithHistory(values, text, [old], {}).matched, false);
  }
  assert.equal(M.applyPasteWithHistory(values, "★\tABC\t東京都\tセガ○○", [old], {}, old.id).matched, false);
});

test("prefecture shop settings validate and old backups remain compatible", () => {
  assert.equal(M.prefectures.length, 47);
  M.validateSettings({ ...M.defaultSettings, shopsByArea: { "東京都": ["店舗A"], HKG: ["店舗B"] } });
  for (const shopsByArea of [null, [], { "東京都": "店舗A" }, { "東京都": [1] }, { "": [] }]) {
    assert.throws(() => M.validateSettings({ ...M.defaultSettings, shopsByArea }));
  }
  const legacy = structuredClone(M.defaultSettings);
  delete legacy.shopsByArea;
  M.validateBackup({ schema: 1, records: [], draft: M.newDraft(), settings: legacy });
});

test("history import appends without overwriting existing records or duplicating a second import", () => {
  const existing = record({ team: "保持" });
  const incoming = record();
  const data = { schema: 1, records: [incoming, { ...existing, values: { ...existing.values, team: "上書き禁止" } }] };
  const result = M.mergeHistory([existing], data);
  assert.equal(result.length, 2);
  assert.equal(result[0].values.team, "保持");
  assert.deepEqual(M.mergeHistory(result, data), result);
  assert.equal(existing.values.team, "保持");
  assert.throws(() => M.mergeHistory(result, { schema: 1, records: [incoming, {}] }));
});

test("master history replaces formal records and finalizes only exact provisional number matches", () => {
  const corrected = { ...record({ note: "wrong" }), id: "excel-datano:37224" };
  const removed = { ...record(), id: "excel-datano:37225" };
  const local = { ...record({ note: "keep local" }), temporaryNo: "20261117-CARD-001" };
  const adopted = { ...record({ note: "before Excel" }), temporaryNo: "20261117-CARD-002" };
  const legacy = record({ note: "legacy local without a provisional number" });
  const existing = [corrected, removed, local, adopted, legacy], before = structuredClone(existing);
  const data = { schema: 1, masterType: "OPPONENT_Master", records: [
    { ...corrected, values: { ...corrected.values, note: "fixed by Excel" } },
    { ...record({ opponent: "CORRECTED NAME", date: "2026-11-18" }),
      id: "excel-datano:37226", temporaryNo: adopted.temporaryNo }
  ] };
  const original = structuredClone(data);
  const result = M.replaceHistory(existing, data);
  assert.deepEqual(result, { records: [...data.records, local, legacy],
    added: 1, updated: 1, removed: 1, finalized: 1, retained: 2 });
  assert.deepEqual(existing, before);
  assert.deepEqual(data, original);
  assert.deepEqual(M.replaceHistory(result.records, data), {
    records: result.records, added: 0, updated: 0, removed: 0, finalized: 0, retained: 2
  });
  const empty = M.replaceHistory(existing, { ...data, records: [] });
  assert.deepEqual(empty.records, [local, adopted, legacy]);
  assert.equal(empty.removed, 2);
});

test("master history rejects duplicate and nonformal identifiers atomically", () => {
  const local = { ...record(), temporaryNo: "20261117-CARD-001" }, before = structuredClone(local);
  const formal = { ...record(), id: "excel-datano:1", temporaryNo: local.temporaryNo };
  for (const [incoming, error] of [
    [[formal, structuredClone(formal)], /Data_No.*重複/],
    [[formal, { ...formal, id: "excel-datano:2" }], /仮No.*重複/],
    [[local], /正式/],
    [[{ ...formal, values: { ...formal.values, date: "" } }], /日付/]
  ]) {
    assert.throws(() => M.replaceHistory([local], { schema: 1, masterType: "OPPONENT_Master", records: incoming }), error);
    assert.deepEqual(local, before);
  }
  assert.throws(() => M.replaceHistory([local], { schema: 1, records: [] }), /形式/);
});

test("master accepts Data_No. without a provisional number and never guesses a local duplicate", () => {
  const local = record({ opponent: "KOK" });
  const official = { ...record({ opponent: "KOK" }), id: "excel-datano:42" };
  const master = { schema: 1, masterType: "OPPONENT_Master", records: [official] };
  const result = M.replaceHistory([local], master);
  assert.deepEqual(result.records, [official, local]);
  assert.equal(result.added, 1);
  assert.equal(result.finalized, 0);
  assert.equal(M.replaceHistory(result.records, master).added, 0);
});

test("autofill covers agreed fields while retaining current session fields and entered notes", () => {
  const previous = record();
  const current = record();
  for (const [key] of M.fields) {
    previous.values[key] = `past-${key}`;
    current.values[key] = `current-${key}`;
  }
  const retained = ["date", "card", "myRank", "myStars", "season", "round", "nameNote", "note"];
  const filled = M.applyPlayerCandidate(current.values, previous.values);
  for (const [key] of M.fields) {
    if (retained.includes(key)) assert.equal(filled[key], current.values[key]);
    else if (key === "win") assert.equal(filled[key], "");
    else if (key === "normalizedName") assert.equal(filled[key], M.normalizeName(previous.values.opponent));
    else assert.equal(filled[key], previous.values[key]);
  }
  assert.equal(current.values.note, "current-note");
  assert.equal(previous.values.win, "past-win");
});

test("opponent selection keeps current notes for Excel CSV instead of copying historical notes", () => {
  const previous = record({ nameNote: "HISTORICAL_CN", note: "HISTORICAL_NOTE" });
  const current = record({ nameNote: "ENTERED_CN", note: "ENTERED_NOTE" });
  const selected = { ...current, values: M.applyPlayerCandidate(current.values, previous.values) };
  const csv = M.toExcelCsv([selected]);
  assert.ok(csv.includes('"ENTERED_CN","ENTERED_NOTE"'));
  assert.ok(!csv.includes("HISTORICAL_CN"));
  assert.ok(!csv.includes("HISTORICAL_NOTE"));
  const empty = M.applyPlayerCandidate(record().values, previous.values);
  assert.equal(empty.nameNote, "");
  assert.equal(empty.note, "");
  assert.equal(previous.values.note, "HISTORICAL_NOTE");
});

test("course history uses same opponent and course, latest result including unknown, and excludes edited record", () => {
  const win = record({ course: "土坂(雪)：往路", win: "1", date: "2026-01-01" });
  const loss = record({ course: "土坂(雪)：往路", win: "0", date: "2026-01-02" });
  const different = record({ course: "秋名：下", win: "1", date: "2026-01-03" });
  const records = [win, loss, different, record({ homeShop: "別の店", course: loss.values.course })];
  assert.equal(M.previousCourseMatch(records, win.values, {}), loss);
  assert.equal(M.previousCourseMatch(records, different.values, {}), different);
  assert.equal(M.previousCourseMatch(records, win.values, {}, loss.id), win);
  assert.equal(M.previousCourseMatch(records, { ...win.values, course: "記録なし" }, {}), undefined);
  const unknown = record({ course: win.values.course, win: "", date: "2026-01-04" });
  assert.equal(M.previousCourseMatch([...records, unknown], win.values, {}), unknown);
});

test("previous result treats an absent win flag as a loss only when a record exists", () => {
  assert.equal(M.previousOutcome(undefined), undefined);
  assert.equal(M.previousOutcome(record({ win: "1" })), "1");
  for (const win of ["", "0", "other"]) {
    const r = record({ win });
    assert.equal(M.previousOutcome(r), "0");
    assert.equal(r.values.win, win);
  }
});

test("unknown player clears all opponent fields and result while preserving current session values", () => {
  const previous = record();
  for (const [key] of M.fields) previous.values[key] = `old-${key}`;
  const applied = M.applyUnknownPlayer(previous.values, " 新規相手 ");
  const retained = ["date", "card", "myRank", "myStars", "season", "round"];
  for (const [key] of M.fields) {
    if (key === "opponent" || key === "normalizedName") assert.equal(applied[key], "新規相手");
    else if (key === "opponentRank") assert.equal(applied[key], previous.values.myRank);
    else assert.equal(applied[key], retained.includes(key) ? previous.values[key] : "");
  }
  assert.equal(previous.values.team, "old-team");
});

test("unmatched Viewer paste never carries previous opponent details into a new player", () => {
  const previous = record({ team: "旧チーム", course: "旧コース", car: "旧車",
    battleArea: "大阪府", battleShop: "旧店", note: "旧メモ" });
  const result = M.applyPasteWithHistory(previous.values, "★★\t新規相手\t東京都\t新規所属店", [], {});
  assert.equal(result.matched, false);
  assert.equal(result.values.opponent, "新規相手");
  assert.equal(result.values.battleArea, "東京都");
  assert.equal(result.values.opponentStars, "★★");
  assert.equal(result.values.opponentRank, previous.values.myRank);
  for (const key of ["team", "course", "car", "battleShop", "note", "win"]) assert.equal(result.values[key], "");
  assert.equal(previous.values.course, "旧コース");
});

test("opponent rank defaults to own rank without overwriting manual or historical rank", () => {
  const values = { ...M.newDraft().values, myRank: "RUBY" };
  const first = M.syncDefaultOpponentRank(values, "");
  assert.equal(first.opponentRank, "RUBY");
  assert.equal(M.syncDefaultOpponentRank({ ...first, myRank: "PRIDE" }, "RUBY").opponentRank, "PRIDE");
  assert.equal(M.syncDefaultOpponentRank({ ...first, myRank: "PRIDE", opponentRank: "BLUE" }, "RUBY").opponentRank, "BLUE");
  assert.equal(M.syncDefaultOpponentRank({ ...first, myRank: "PRIDE", opponent: "PLAYER" }, "RUBY").opponentRank, "RUBY");
  const candidate = record({ opponentRank: "BLUE" }).values;
  assert.equal(M.applyPlayerCandidate(first, candidate).opponentRank, "BLUE");
  assert.equal(M.applyPlayerCandidate(first, { ...candidate, opponentRank: "" }).opponentRank, "RUBY");
});

test("season settings accept lists and remain compatible with older backups", () => {
  M.validateSettings({ ...M.defaultSettings, seasons: ["シーズン6"] });
  assert.throws(() => M.validateSettings({ ...M.defaultSettings, seasons: "シーズン6" }));
  const legacy = structuredClone(M.defaultSettings);
  delete legacy.seasons;
  M.validateBackup({ schema: 1, records: [], draft: M.newDraft(), settings: legacy });
});
