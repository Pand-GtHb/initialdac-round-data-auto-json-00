const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../record-poc/catalog.js");
const M = require("../record-poc/model.js");

test("round course rows pair only directions included in the selected round", () => {
  const courses = ["碓氷：左", "碓氷：右", "秋名：下", "秋名：上", "単独"].map((label, index) => ({ id: index, label }));
  assert.deepEqual(C.roundCourseRows(courses, [0, 3, 1, 4]), [
    ["碓氷：左", "碓氷：右"], ["秋名：上", ""], ["単独", ""]
  ]);
});
function catalog() {
  return {
    common: {
      kind: "dac-settings-design-draft", schemaVersion: 1,
      vehicles: [{ id: "v1", label: "CAR-DH" }, { id: "v2", label: "CAR-HC" }],
      courses: [{ id: "c1", label: "COURSE1", selectable: true }, { id: "c2", label: "COURSE2", selectable: true }],
      areas: [{ id: "a1", label: "TWN" }],
      stores: [{ id: "s1", label: "SHOP1", areaId: "a1" }],
      seasons: [{ id: "season1", label: "S1" }, { id: "season2", label: "S2" }],
      rounds: [
        { id: "r1", seasonId: "season1", roundLabel: "1st", startDate: "2026-11-01", endDate: "2026-11-30", courseIds: ["c1"] },
        { id: "r2", seasonId: "season2", roundLabel: "2nd", startDate: "2026-12-01", endDate: "2026-12-31", courseIds: ["c2"] }
      ],
      roundLabels: ["1st", "2nd"], rankLabels: ["RUBY", "PRIDE"], starLabels: ["★", "★★"],
      rankLevels: [{ rank: "RUBY", stars: "★", legacyRankValue: 92 }],
      behaviorCodes: [{ code: "-1", label: "YIELD WIN" }]
    },
    personal: {
      kind: "dac-personal-settings-design-draft", schemaVersion: 1,
      teams: [{ id: "t1", label: "TEAM", homeStoreId: "s1", homeStoreLabel: "SHOP1" }],
      cards: [
        { id: "card1", label: "A", onlineEnabled: true, teamId: "t1",
          activeSlots: [{ slot: 1, vehicleId: "v1", label: "CAR-DH" }], garage: [],
          currentRank: { rank: "RUBY", stars: "★★" } },
        { id: "card2", label: "B", onlineEnabled: false, teamId: null, activeSlots: [], garage: [], currentRank: null }
      ]
    }
  };
}
function settings() { return C.merge(structuredClone(M.defaultSettings), catalog()); }
function cardEdit(s, id = "card1") {
  const card = s.catalog.personal.cards.find(item => item.id === id);
  return { ...C.profiles(s).find(item => item.id === id),
    garage: Array.from({ length: Math.max(0, ...card.garage.map(slot => slot.slot)) },
      (_, index) => card.garage.find(slot => slot.slot === index + 1)?.label || "") };
}
function masterFiles(source = catalog()) {
  const c = source.common, p = source.personal;
  const data = {
    AREA_Master: { areas: c.areas },
    CAR_Master: { vehicles: c.vehicles, vehicleDividers: c.vehicleDividers || [] },
    ROUND_Master: { courses: c.courses, seasons: c.seasons, rounds: c.rounds, roundLabels: c.roundLabels },
    STORE_Master: { stores: c.stores },
    TEAM_Master: { teams: p.teams },
    CARD_Master: { cards: p.cards },
    RANK_Master: { rankLabels: c.rankLabels, starLabels: c.starLabels, rankLevels: c.rankLevels },
    CORD_Master: { behaviorCodes: c.behaviorCodes }
  };
  return Object.entries(data).map(([masterType, value]) => ({
    kind: "dac-master", schemaVersion: 1, masterType, data: structuredClone(value)
  }));
}

test("card slot replacement uses vehicle IDs, preserves gaps and leaves garage and rank unchanged", () => {
  const s = settings();
  const original = s.catalog.personal.cards[0];
  original.garage = [{ slot: 1, vehicleId: "v1", label: "CAR-DH" }];
  const next = C.updateCardSlots(s, original.id, ["v2", "", "v1"]);
  const updated = next.catalog.personal.cards[0];
  assert.deepEqual(updated.activeSlots, [
    { slot: 1, vehicleId: "v2", label: "CAR-HC" }, { slot: 3, vehicleId: "v1", label: "CAR-DH" }
  ]);
  assert.deepEqual(updated.garage, original.garage);
  assert.deepEqual(updated.currentRank, original.currentRank);
  assert.deepEqual(original.activeSlots.map(slot => slot.vehicleId), ["v1"]);
  assert.deepEqual(next.catalog.personal.cards[1], s.catalog.personal.cards[1]);
  assert.throws(() => C.updateCardSlots(s, original.id, ["v1", "v1", ""]), /複数のスロット/);
  assert.throws(() => C.updateCardSlots(s, original.id, ["", "", "missing"]), /未登録の車種/);
});

test("eight masters import together and individual updates preserve unrelated settings", () => {
  const files = masterFiles(), initial = structuredClone(M.defaultSettings);
  const all = C.readMasters(files);
  const loaded = C.mergeMasters(initial, all, {});
  C.validate(loaded.catalog);
  assert.deepEqual(loaded.catalog.personal.cards, catalog().personal.cards);
  const before = structuredClone(loaded);
  const rank = structuredClone(files.find(file => file.masterType === "RANK_Master"));
  rank.data.rankLabels.push("NEW RANK");
  const updated = C.mergeMasters(loaded, C.readMasters([rank]), {});
  assert.ok(updated.catalog.common.rankLabels.includes("NEW RANK"));
  assert.deepEqual(updated.catalog.personal, before.catalog.personal);
  assert.deepEqual(updated.catalog.common.vehicles, before.catalog.common.vehicles);
  assert.deepEqual(loaded, before);
});

test("daily and timing update groups accept only their designated master files", () => {
  const files = masterFiles();
  const dailyFiles = [
    ...files.filter(file => ["STORE_Master", "TEAM_Master", "CARD_Master"].includes(file.masterType)),
    { schema: 1, masterType: "OPPONENT_Master", records: [] }
  ];
  const daily = C.readDailyUpdate(dailyFiles);
  assert.deepEqual(Object.keys(daily.masters).sort(), ["CARD_Master", "STORE_Master", "TEAM_Master"]);
  assert.deepEqual(daily.history.records, []);
  const timing = C.readTimingMasters(files.filter(file =>
    ["ROUND_Master", "CAR_Master", "RANK_Master", "AREA_Master", "CORD_Master"].includes(file.masterType)));
  assert.equal(Object.keys(timing).length, 5);
  assert.throws(() => C.readDailyUpdate(dailyFiles.slice(1)), /日次更新/);
  assert.throws(() => C.readDailyUpdate([...dailyFiles, dailyFiles[0]]), /日次更新/);
  assert.throws(() => C.readTimingMasters([files.find(file => file.masterType === "CARD_Master")]), /タイミング更新/);
});

test("master card updates always adopt JSON values without per-card decisions", () => {
  const s = settings(), file = masterFiles().find(item => item.masterType === "CARD_Master");
  file.data.cards[0].number = "123";
  file.data.cards[0].activeSlots = [{ slot: 1, vehicleId: "v2", label: "CAR-HC" }];
  file.data.cards[0].onlineEnabled = false;
  file.data.cards[0].currentRank = null;
  const masters = C.readMasters([file]), before = structuredClone(s);
  assert.deepEqual(C.masterCardDiffs(s, masters).map(item => item.id), ["card1"]);
  const adopted = C.mergeMasters(s, masters);
  assert.equal(Object.hasOwn(adopted.catalog.personal.cards[0], "number"), false);
  assert.equal(adopted.catalog.personal.cards[0].activeSlots[0].vehicleId, "v2");
  assert.equal(adopted.catalog.personal.cards[0].onlineEnabled, false);
  assert.equal(adopted.catalog.personal.cards[0].currentRank, null);
  assert.deepEqual(adopted.catalog.personal.cards[1], s.catalog.personal.cards[1]);
  assert.deepEqual(s, before);
});

test("checkbox selection identifies master contents, ignores unchecked types and supports history alone", () => {
  const files = masterFiles();
  const history = { schema: 1, masterType: "OPPONENT_Master", records: [] };
  const selected = C.readSelectedMasters([...files, history], ["STORE_Master", "OPPONENT_Master"]);
  assert.deepEqual(Object.keys(selected.masters), ["STORE_Master"]);
  assert.deepEqual(selected.history, history);
  assert.deepEqual(C.readSelectedMasters([history], ["OPPONENT_Master"]), { masters: {}, history });
  assert.equal(C.readSelectedMasters(files, ["CAR_Master"]).history, null);
  assert.throws(() => C.readSelectedMasters(files, []), /種類/);
  assert.throws(() => C.readSelectedMasters(files, ["OPPONENT_Master"]), /不足/);
  assert.throws(() => C.readSelectedMasters([...files, files[0]], ["AREA_Master"]), /重複/);
  assert.throws(() => C.readSelectedMasters([{ masterType: "unknown" }], ["AREA_Master"]), /未対応/);
  assert.throws(() => C.readSelectedMasters([{ ...history, schema: 2 }], ["OPPONENT_Master"]), /形式/);
});

test("added master files select their supported types once in file order", () => {
  const files = masterFiles();
  assert.deepEqual(C.masterTypesForFiles([files[0], files[2], files[0]]),
    [files[0].masterType, files[2].masterType]);
  assert.deepEqual(C.masterTypesForFiles([]), []);
  assert.throws(() => C.masterTypesForFiles([{ masterType: "unknown" }]), /未対応/);
});

test("initial master import can fill date context without replacing draft inputs or manual choices", () => {
  const before = { date: "2026-11-17", season: "", round: "", opponent: "PLAYER", note: "keep" };
  const merged = C.mergeMasters(structuredClone(M.defaultSettings), C.readSelectedMasters(masterFiles(),
    masterFiles().map(file => file.masterType)).masters, {});
  assert.deepEqual(C.suggestContext(merged, before), { ...before, season: "S1", round: "1st" });
  const manual = { ...before, season: "S2", round: "2nd" };
  assert.deepEqual(C.suggestContext(merged, manual), manual);
});

test("legacy online settings never filter card choices and master updates overwrite them", () => {
  const s = settings(), before = structuredClone(s);
  assert.deepEqual(C.choices(s, "card", {}), ["A", "B"]);
  const enabled = C.updateOnlineEnabled(s, "card2", true);
  assert.deepEqual(C.choices(enabled, "card", {}), ["A", "B"]);
  const expected = structuredClone(before);
  expected.catalog.personal.cards[1].onlineEnabled = true;
  assert.deepEqual(enabled, expected);
  assert.deepEqual(s, before);
  const file = masterFiles().find(item => item.masterType === "CARD_Master");
  assert.equal(C.mergeMasters(enabled, C.readMasters([file])).catalog.personal.cards[1].onlineEnabled, false);
  assert.equal(C.updateOnlineEnabled(enabled, "card2", null).catalog.personal.cards[1].onlineEnabled, null);
  assert.deepEqual(C.choices(C.updateOnlineEnabled(s, "card1", null), "card", {}), ["A", "B"]);
  assert.equal(Object.fromEntries(C.cardInfo(s, "card1"))["オンライン"], undefined);
  assert.throws(() => C.updateOnlineEnabled(s, "missing", true), /カード/);
  assert.throws(() => C.updateOnlineEnabled(s, "card1", "true"), /オンライン/);
});

test("card team changes preserve other settings until the next card master replaces them", () => {
  const source = catalog();
  source.personal.teams.push({ id: "t2", label: "OTHER", number: "2", homeStoreId: "s1", homeStoreLabel: "SHOP1" });
  const s = C.merge(structuredClone(M.defaultSettings), source), before = structuredClone(s);
  const changed = C.updateCardTeam(s, "card1", "t2");
  const expected = structuredClone(before);
  expected.catalog.personal.cards[0].teamId = "t2";
  expected.catalog.personal.cards[0].teamLabel = "OTHER";
  assert.deepEqual(changed, expected);
  assert.deepEqual(s, before);
  assert.deepEqual(C.cardInfo(changed, "card1").filter(([name]) => name.startsWith("チーム")),
    [["チーム", "OTHER"], ["チーム番号", "2"], ["チーム所属店舗", "SHOP1"]]);
  const masters = C.readMasters([masterFiles(source).find(file => file.masterType === "CARD_Master")]);
  assert.deepEqual(C.masterCardDiffs(changed, masters).map(item => item.id), ["card1"]);
  assert.equal(C.mergeMasters(changed, masters).catalog.personal.cards[0].teamId, "t1");
  const unassigned = C.updateCardTeam(changed, "card1", null);
  assert.equal(unassigned.catalog.personal.cards[0].teamId, null);
  assert.equal(unassigned.catalog.personal.cards[0].teamLabel, null);
  assert.throws(() => C.updateCardTeam(s, "missing", "t1"), /カード/);
  assert.throws(() => C.updateCardTeam(s, "card1", "missing"), /チーム/);
  assert.throws(() => C.updateCardTeam(s, "card1", ""), /チーム/);
  assert.deepEqual(s, before);
});

test("rank and stars differences are reported and automatically replaced from the master", () => {
  const s = settings(), file = masterFiles().find(item => item.masterType === "CARD_Master");
  file.data.cards[0].currentRank = { rank: "PRIDE", stars: "1200", phase: "master-extracted" };
  const masters = C.readMasters([file]), before = structuredClone(s);
  assert.equal(C.masterCardDiffs(s, masters).length, 1);
  assert.deepEqual(C.mergeMasters(s, masters).catalog.personal.cards[0].currentRank,
    file.data.cards[0].currentRank);
  assert.deepEqual(s, before);
  file.data.cards[0].currentRank = { rank: "RUBY", stars: "★ ★" };
  assert.equal(C.masterCardDiffs(s, C.readMasters([file])).length, 0);
});

test("invalid batch master references reject the whole replacement", () => {
  const s = settings(), before = structuredClone(s), files = masterFiles();
  const card = files.find(item => item.masterType === "CARD_Master").data.cards[0];
  card.activeSlots = [{ slot: 1, vehicleId: "missing", label: "Missing" }];
  const rank = files.find(item => item.masterType === "RANK_Master");
  rank.data.rankLabels.push("NOT APPLIED");
  const masters = C.readMasters(files);
  assert.throws(() => C.mergeMasters(s, masters), /CAR_Master/);
  assert.deepEqual(s, before);
});

test("selected master snapshots remove missing definitions and stale choices without affecting other masters", () => {
  const s = settings(), before = structuredClone(s);
  const changed = catalog();
  changed.personal.cards = [changed.personal.cards[0]];
  changed.personal.cards[0].label = "RENAMED";
  const cardOnly = C.mergeMasters(s, C.readMasters(masterFiles(changed).filter(file => file.masterType === "CARD_Master")));
  assert.deepEqual(cardOnly.cards, ["RENAMED"]);
  assert.equal(cardOnly.catalog.personal.cards.length, 1);
  assert.deepEqual(cardOnly.catalog.common, before.catalog.common);
  changed.personal.cards = [];
  changed.personal.teams = [];
  changed.common.stores = [];
  changed.common.vehicles = [];
  changed.common.vehicleDividers = [];
  changed.common.rounds = [];
  changed.common.courses = [];
  changed.common.seasons = [];
  changed.common.roundLabels = [];
  changed.common.areas = [];
  const empty = C.mergeMasters(s, C.readMasters(masterFiles(changed)));
  for (const key of ["cards", "cars", "courses", "seasons", "rounds"]) assert.deepEqual(empty[key], []);
  assert.deepEqual(empty.shopsByArea, {});
  assert.deepEqual(empty.catalog.personal, changed.personal);
  assert.deepEqual(s, before);
  assert.throws(() => C.mergeMasters(s, C.readMasters(masterFiles(changed).filter(file => file.masterType === "CAR_Master"))), /CAR_Master/);
});

test("masters reject incomplete, duplicate, malformed and unresolved imports without changing settings", () => {
  const files = masterFiles(), initial = structuredClone(M.defaultSettings);
  assert.equal(Object.keys(C.readMasters(files.slice(0, 2))).length, 2);
  assert.throws(() => C.readMasters([]), /１～８種類/);
  assert.throws(() => C.readMasters([...files.slice(0, 7), files[0]]), /重複/);
  assert.throws(() => C.readMasters([{ ...files[0], schemaVersion: 2 }]), /形式/);
  assert.throws(() => C.readMasters([{ ...files[0], data: {} }]), /areas/);
  assert.throws(() => C.mergeMasters(initial, C.readMasters([files[0]]), {}), /初回は８種類/);
  assert.deepEqual(initial, M.defaultSettings);
  const emptyFiles = masterFiles();
  for (const file of emptyFiles) for (const key of Object.keys(file.data)) file.data[key] = [];
  const emptySettings = C.mergeMasters(initial, C.readMasters(emptyFiles), {});
  assert.throws(() => C.mergeMasters(emptySettings, C.readMasters([files.find(f => f.masterType === "STORE_Master")]), {}), /AREA_Master/);
  assert.throws(() => C.mergeMasters(emptySettings, C.readMasters([files.find(f => f.masterType === "CARD_Master")]), {}), /TEAM_Master/);
  const withTeam = C.mergeMasters(emptySettings, C.readMasters([files.find(f => f.masterType === "TEAM_Master")]), {});
  assert.equal(withTeam.catalog.personal.teams[0].homeStoreId, null);
  assert.equal(withTeam.catalog.personal.teams[0].homeStoreLabel, "SHOP1");
  assert.throws(() => C.mergeMasters(withTeam, C.readMasters([files.find(f => f.masterType === "CARD_Master")]), {}), /CAR_Master/);
});

test("star display groups four stars with an ASCII space without changing stored values or PRIDE", () => {
  for (let count = 1; count <= 8; count++) {
    const raw = "★".repeat(count);
    const expected = count > 4 ? `${"★".repeat(4)} ${"★".repeat(count - 4)}` : raw;
    assert.equal(C.formatStars(raw), expected);
    assert.equal(C.formatStars(expected), expected);
    assert.equal(C.normalizeStars(expected), raw);
    assert.equal(C.label({}, "myStars", raw), expected);
    assert.equal(C.label({}, "opponentStars", raw), expected);
  }
  for (const value of ["", "不明", "1234", "123.5", "PRIDE 123", "ルビー"]) {
    assert.equal(C.formatStars(value), value);
    assert.equal(C.normalizeStars(value), value);
  }
  const s = settings(), raw = "★".repeat(7);
  s.catalog.common.starLabels.push(raw);
  s.catalog.personal.cards[0].currentRank.stars = raw;
  assert.match(Object.fromEntries(C.cardInfo(s, "card1"))["現在ランク"], /★★★★ ★★★/);
  const profiles = C.profiles(s);
  profiles[0].stars = "★★★★ ★★★";
  assert.equal(C.updateProfiles(s, profiles, "now").catalog.personal.cards[0].currentRank.stars, raw);
  assert.equal(s.catalog.personal.cards[0].currentRank.stars, raw);
});

test("one-character team search normalizes width and preserves distinct team-store pairs", () => {
  const record = (id, team, teamShop, date) => ({ id, values: { team, teamShop, date } });
  const records = [
    record("1", "ＡＢＣ", "OLD SHOP", "2026-11-01"),
    record("2", "ＡＢＣ", "NEW SHOP", "2026-11-03"),
    record("3", "Other", "ABC SHOP", "2026-11-02"),
    record("4", "ＡＢＣ", "NEW SHOP", "2026-11-04")
  ];
  assert.deepEqual(C.teamSuggestions(records, "a"), [
    { team: "ＡＢＣ", teamShop: "NEW SHOP" }, { team: "ＡＢＣ", teamShop: "OLD SHOP" }
  ]);
  assert.deepEqual(C.teamSuggestions(records, "ａ", "4"), C.teamSuggestions(records, "a"));
  assert.deepEqual(C.teamSuggestions(records, ""), []);
  assert.deepEqual(C.teamSuggestions(records, " "), []);
  assert.deepEqual(C.teamSuggestions(records, "not-found"), []);
});

test("vehicle dividers keep source order and are never actual vehicle choices or references", () => {
  const s = settings();
  s.catalog.common.vehicleDividers = [{ beforeVehicleId: "v2", label: "---------------------", source: "車種!B5" }];
  C.validate(s.catalog);
  const options = C.vehicleOptions(s);
  assert.deepEqual(options, [
    { label: "CAR-DH", value: "CAR-DH", divider: false },
    { label: "---------------------", value: "", divider: true },
    { label: "CAR-HC", value: "CAR-HC", divider: false }
  ]);
  assert.deepEqual(C.vehicleOptions(s, ["CAR-DH"]), [options[0]]);
  assert.deepEqual(C.vehicleOptions(s, ["CAR-DH", "---------------------", "CAR-HC"]), options);
  const next = C.registerList(s, "cars", ["CAR-DH", "---------------------", "CAR-HC", "---------------------", "NEW CAR"]);
  assert.equal(next.catalog.common.vehicles.length, 3);
  assert.equal(C.vehicleOptions(next, next.cars).filter(item => item.divider).length, 2);
  const merged = C.merge(next, catalog());
  assert.equal(merged.cars.filter(value => value === "---------------------").length, 2);
  assert.deepEqual(merged.catalog.common.vehicleDividers, s.catalog.common.vehicleDividers);
  assert.throws(() => C.registerCard(s, { ...cardEdit(s), vehicles: ["---------------------"] }, "now"));
  assert.throws(() => C.registerCard(s, { ...cardEdit(s), garage: ["---------------------"] }, "now"));
  for (const dividers of [
    null, [{ beforeVehicleId: "missing", label: "---------------------" }],
    [{ beforeVehicleId: "v2", label: "CAR" }],
    [...s.catalog.common.vehicleDividers, ...s.catalog.common.vehicleDividers]
  ]) {
    const bad = structuredClone(s);
    bad.catalog.common.vehicleDividers = dividers;
    assert.throws(() => C.validate(bad.catalog), /区切り線/);
  }
});

test("manufacturer headings display as disabled dividers and never become vehicles", () => {
  const s = settings();
  s.catalog.common.vehicleDividers = [
    { beforeVehicleId: "v1", label: "--- TOYOTA ---" },
    { beforeVehicleId: "v2", label: "--- NISSAN ---" }
  ];
  C.validate(s.catalog);
  const expected = [
    { label: "--- TOYOTA ---", value: "", divider: true },
    { label: "CAR-DH", value: "CAR-DH", divider: false },
    { label: "--- NISSAN ---", value: "", divider: true },
    { label: "CAR-HC", value: "CAR-HC", divider: false }
  ];
  assert.deepEqual(C.vehicleOptions(s), expected);
  assert.deepEqual(C.vehicleOptions(s, ["---------------------", "CAR-DH", "---------------------", "CAR-HC"]), expected);
  const next = C.registerList(s, "cars", ["--- TOYOTA ---", "CAR-DH", "--- NISSAN ---", "CAR-HC"]);
  assert.equal(next.catalog.common.vehicles.length, 2);
  assert.throws(() => C.registerCard(s, { ...cardEdit(s), vehicles: ["--- TOYOTA ---"] }, "now"));
  const bad = structuredClone(s);
  bad.catalog.common.vehicleDividers[0].label = "--- ---";
  assert.throws(() => C.validate(bad.catalog), /区切り線/);
});

test("opponent vehicle groups use explicit headings, manufacturer metadata and verified legacy IDs", () => {
  const s = settings();
  s.catalog.common.vehicles = [
    { id: "vehicle-cb7efa38e0f1124e", label: "OLD TOYOTA" },
    { id: "vehicle-9fbb9ebf50b4bf8b", label: "OLD HONDA" },
    { id: "new", label: "NEW CAR", manufacturer: "MAZDA" },
    { id: "unknown", label: "UNKNOWN" }
  ];
  s.catalog.common.vehicleDividers = [
    { beforeVehicleId: "vehicle-9fbb9ebf50b4bf8b", label: "---------------------" }
  ];
  s.cars = ["OLD TOYOTA", "OLD HONDA", "NEW CAR", "UNKNOWN"];
  assert.deepEqual(C.vehicleGroups(s), [
    { manufacturer: "TOYOTA", values: ["OLD TOYOTA"] },
    { manufacturer: "HONDA", values: ["OLD HONDA"] },
    { manufacturer: "MAZDA", values: ["NEW CAR"] },
    { manufacturer: null, values: ["UNKNOWN"] }
  ]);
  s.cars = ["--- CUSTOM ---", "OLD TOYOTA", "UNKNOWN", "---------------------", "OLD HONDA"];
  assert.deepEqual(C.vehicleGroups(s), [
    { manufacturer: "CUSTOM", values: ["OLD TOYOTA", "UNKNOWN"] },
    { manufacturer: "HONDA", values: ["OLD HONDA"] }
  ]);
  assert.deepEqual(C.vehicleGroups({ cars: ["CAR", "---------------------", "OTHER"] }),
    [{ manufacturer: null, values: ["CAR", "OTHER"] }]);
});

test("card registration adds and renames cards without changing IDs, other cards or historical values", () => {
  const s = settings(), before = structuredClone(s);
  const data = { ...cardEdit(s), id: null, label: "NEW", number: "0000 1111", vehicles: ["", "CAR-HC"],
    garage: ["CAR-DH", "", "CAR-HC"] };
  const added = C.registerCard(s, data, "now");
  assert.equal(added.settings.catalog.personal.cards.length, 3);
  const card = added.settings.catalog.personal.cards.find(item => item.id === added.id);
  assert.equal(card.label, "NEW");
  assert.equal(Object.hasOwn(card, "number"), false);
  assert.deepEqual(card.activeSlots, [{ slot: 2, vehicleId: "v2", label: "CAR-HC" }]);
  assert.deepEqual(card.garage.map(slot => slot.slot), [1, 2]);
  assert.ok(C.choices(added.settings, "card", {}).includes("NEW"));
  const edited = C.registerCard(added.settings, { ...cardEdit(added.settings, added.id), label: "RENAMED", number: "0001" }, "later");
  assert.equal(edited.id, added.id);
  assert.equal(edited.settings.catalog.personal.cards.find(item => item.id === added.id).label, "RENAMED");
  assert.deepEqual(edited.settings.catalog.personal.cards.slice(0, 2), before.catalog.personal.cards);
  assert.deepEqual(s, before);
  const record = M.newDraft();
  record.values.card = "NEW";
  const snapshot = structuredClone(record);
  C.registerCard(edited.settings, { ...cardEdit(edited.settings, added.id), label: "THIRD" }, "again");
  assert.deepEqual(record, snapshot);
  for (const patch of [{ label: "" }, { label: "A" }, { id: "missing" },
    { garage: ["unknown"] }, { vehicles: ["CAR-DH", "CAR-DH"] }, { teamId: "unknown" }, { rank: "unknown" }]) {
    assert.throws(() => C.registerCard(added.settings, { ...cardEdit(added.settings, added.id), ...patch }, "now"));
  }
});

test("team registration adds and edits name-number-store pairs with stable card references", () => {
  const s = settings();
  const added = C.registerTeam(s, { id: null, label: "NEW TEAM", number: "00-1111-2222", homeStoreLabel: "NEW SHOP" });
  assert.equal(added.settings.catalog.personal.teams.length, 2);
  const card = C.registerCard(added.settings, { ...cardEdit(added.settings), teamId: added.id }, "now");
  const updated = C.registerTeam(card.settings, { id: added.id, label: "RENAMED TEAM", number: "00-1111-2223", homeStoreLabel: "SHOP1" });
  assert.equal(updated.id, added.id);
  assert.equal(updated.settings.catalog.personal.teams[1].homeStoreId, "s1");
  assert.equal(updated.settings.catalog.personal.cards[0].teamId, added.id);
  assert.equal(updated.settings.catalog.personal.cards[0].teamLabel, "RENAMED TEAM");
  assert.equal(Object.fromEntries(C.cardInfo(updated.settings, "card1"))["チーム番号"], "00-1111-2223");
  assert.deepEqual(updated.settings.teams, s.teams);
  assert.deepEqual(updated.settings.teamShops, s.teamShops);
  assert.equal(s.catalog.personal.teams.length, 1);
  for (const patch of [{ label: "" }, { label: "TEAM", homeStoreLabel: "SHOP1" }, { id: "missing" }, { number: 12 }]) {
    assert.throws(() => C.registerTeam(updated.settings, { id: added.id, label: "OK", number: "", homeStoreLabel: "", ...patch }));
  }
});

test("individual list registration updates only that list and makes new cars usable by slots and garage", () => {
  const s = settings();
  const next = C.registerList(s, "cars", [...s.cars, "NEW CAR"]);
  const vehicle = next.catalog.common.vehicles.find(item => item.label === "NEW CAR");
  assert.ok(vehicle.id);
  const updated = C.registerCard(next, { ...cardEdit(next), vehicles: ["NEW CAR"], garage: ["NEW CAR"] }, "now");
  assert.equal(updated.settings.catalog.personal.cards[0].activeSlots[0].vehicleId, vehicle.id);
  assert.equal(updated.settings.catalog.personal.cards[0].garage[0].vehicleId, vehicle.id);
  assert.deepEqual(next.courses, s.courses);
  assert.deepEqual(next.catalog.common.rounds, s.catalog.common.rounds);
  assert.equal(C.registerList(next, "cars", next.cars).catalog.common.vehicles.length, next.catalog.common.vehicles.length);
  const courses = C.registerList(next, "courses", [...s.courses, "NEW COURSE"]);
  assert.equal(courses.catalog.common.courses.find(item => item.label === "NEW COURSE").selectable, true);
  assert.deepEqual(C.choices(courses, "course", { season: "S1", round: "1st" }), ["COURSE1"]);
  assert.ok(C.registerList(s, "seasons", ["S1", "S2", "S3"]).catalog.common.seasons.some(item => item.label === "S3"));
  assert.deepEqual(C.registerList(s, "rounds", ["3rd"]).catalog.common.roundLabels, ["3rd"]);
  const legacy = structuredClone(M.defaultSettings);
  assert.deepEqual(C.registerList(legacy, "courses", ["CUSTOM"]).courses, ["CUSTOM"]);
  for (const [key, values] of [["teams", ["T"]], ["cars", ["X", " X "]], ["courses", [123]], ["seasons", [" "]]]) {
    assert.throws(() => C.registerList(s, key, values));
  }
});

test("master updates retain locally registered and renamed card and team details and vehicle references", () => {
  let s = C.registerList(settings(), "cars", ["CAR-DH", "CAR-HC", "LOCAL"]);
  const originalGarage = [{ slot: 1, vehicleId: "v1", label: "CAR-DH", source: "original" }];
  s.catalog.personal.cards[0].garage = originalGarage;
  const team = C.registerTeam(s, { id: "t1", label: "LOCAL TEAM", number: "00-1111", homeStoreLabel: "LOCAL SHOP" });
  const edited = C.registerCard(team.settings, { ...cardEdit(team.settings), label: "LOCAL CARD", number: "0010", vehicles: ["LOCAL"] }, "now");
  s = C.registerCard(edited.settings, { ...cardEdit(edited.settings), id: null, label: "EXTRA" }, "now").settings;
  const next = C.merge(s, catalog());
  assert.equal(next.catalog.personal.cards[0].label, "LOCAL CARD");
  assert.equal(Object.hasOwn(next.catalog.personal.cards[0], "number"), false);
  assert.deepEqual(next.catalog.personal.cards[0].garage, originalGarage);
  assert.equal(next.catalog.personal.cards.length, 3);
  assert.equal(next.catalog.personal.teams[0].label, "LOCAL TEAM");
  C.validate(next.catalog);
});

test("card and team editing drafts survive a backup without applying to registered settings", () => {
  const s = settings(), draft = M.newDraft();
  const ownCard = JSON.stringify({ ...cardEdit(s), label: "PENDING" });
  const ownTeam = JSON.stringify({ id: "t1", label: "PENDING TEAM", number: "", homeStoreLabel: "" });
  const backup = M.validateBackup(JSON.parse(JSON.stringify({
    schema: 1, records: [], draft, settings: s, paste: "", settingsDraft: { ownCard, ownTeam, courses: "PENDING COURSE" }
  })));
  assert.equal(JSON.parse(backup.settingsDraft.ownCard).label, "PENDING");
  assert.equal(JSON.parse(backup.settingsDraft.ownTeam).label, "PENDING TEAM");
  assert.equal(backup.settings.catalog.personal.cards[0].label, "A");
  assert.equal(backup.settings.catalog.personal.teams[0].label, "TEAM");
  assert.deepEqual(backup.draft, draft);
});

test("garage compaction removes Excel gaps but preserves vehicles, metadata and active slot numbers", () => {
  const s = settings();
  s.catalog.personal.cards[0].garage = [
    { slot: 70, vehicleId: "v2", label: "CAR-HC", source: "row85" },
    { slot: 5, vehicleId: "v1", label: "CAR-DH", source: "row20" }
  ];
  s.catalog.personal.cards[0].activeSlots[0].slot = 3;
  const before = structuredClone(s);
  const next = C.compactGarages(s);
  assert.deepEqual(next.catalog.personal.cards[0].garage, [
    { slot: 1, vehicleId: "v1", label: "CAR-DH", source: "row20" },
    { slot: 2, vehicleId: "v2", label: "CAR-HC", source: "row85" }
  ]);
  assert.equal(next.catalog.personal.cards[0].activeSlots[0].slot, 3);
  assert.deepEqual(s, before);
  assert.equal(C.compactGarages(next), next);
  const imported = C.merge(structuredClone(M.defaultSettings), s.catalog);
  assert.deepEqual(imported.catalog.personal.cards[0].garage, next.catalog.personal.cards[0].garage);
  const registered = C.registerCard(next, { ...cardEdit(next), garage: ["", "CAR-HC", "", "CAR-DH", ""] }, "now");
  assert.deepEqual(registered.settings.catalog.personal.cards[0].garage.map(item => [item.slot, item.label]),
    [[1, "CAR-HC"], [2, "CAR-DH"]]);
});

test("catalog import validates schema, references, IDs and limits", () => {
  assert.equal(C.readBundle({ kind: "dac-settings-bundle", schemaVersion: 1, ...catalog() }).personal.cards.length, 2);
  assert.throws(() => C.readBundle(catalog()));
  for (const mutate of [
    c => { c.common.stores[0].areaId = "missing"; },
    c => { c.common.rounds[0].courseIds = ["missing"]; },
    c => { c.common.rounds[0].endDate = "2026-02-30"; },
    c => { c.personal.cards[0].activeSlots = Array(4).fill({ slot: 1, vehicleId: "v1", label: "CAR-DH" }); },
    c => { c.personal.cards[0].activeSlots[0].vehicleId = "missing"; },
    c => { c.common.behaviorCodes.push({ code: "-1", label: "duplicate" }); },
    c => { c.common.vehicles.push({ id: "v1", label: "duplicate" }); },
    c => { c.personal.cards[0].currentRank = { rank: 1, stars: "" }; }
  ]) {
    const data = catalog();
    mutate(data);
    assert.throws(() => C.validate(data));
  }
});

test("catalog merge preserves local lists and aliases, adding foreign shops", () => {
  const initial = structuredClone(M.defaultSettings);
  initial.cars = ["LOCAL-CAR"];
  initial.shopsByArea = { TWN: ["LOCAL-SHOP"] };
  initial.shopAliases = { OLD: "SHOP1" };
  const merged = C.merge(initial, catalog());
  assert.deepEqual(merged.cars, ["LOCAL-CAR", "CAR-DH", "CAR-HC"]);
  assert.deepEqual(merged.shopsByArea.TWN, ["LOCAL-SHOP", "SHOP1"]);
  assert.deepEqual(merged.shopAliases, initial.shopAliases);
  assert.equal(initial.catalog, undefined);
  M.validateSettings(merged);
});

test("dependent choices use card slots and season-specific round courses", () => {
  const s = settings(), values = { card: "A", season: "S1", round: "1st" };
  assert.deepEqual(C.choices(s, "card", values), ["A", "B"]);
  assert.deepEqual(C.choices(s, "car", values), ["CAR-DH"]);
  assert.deepEqual(C.choices(s, "opponentCar", values), ["CAR-DH", "CAR-HC"]);
  assert.deepEqual(C.choices(s, "round", values), ["1st"]);
  assert.deepEqual(C.choices(s, "course", values), ["COURSE1"]);
  assert.deepEqual(C.choices(s, "course", { ...values, season: "S2" }), []);
  assert.deepEqual(C.choices(s, "round", { ...values, season: "S2" }), ["2nd"]);
  assert.equal(C.choices(M.defaultSettings, "card", values), null);
});

test("card selection fills current rank without altering history or unrelated fields", () => {
  const s = settings(), original = structuredClone(s);
  const values = { card: "A", myRank: "OLD", myStars: "OLD", car: "CAR-HC", opponent: "PLAYER", win: "1" };
  const updated = C.applyCard(s, values);
  assert.equal(updated.myRank, "RUBY");
  assert.equal(updated.myStars, "★★");
  assert.equal(updated.car, "");
  assert.equal(updated.opponent, "PLAYER");
  assert.equal(updated.win, "1");
  assert.equal(C.applyCard(s, { ...values, car: "CAR-DH" }).car, "CAR-DH");
  assert.equal(C.applyCard(s, { ...values, card: "B" }).myRank, "");
  assert.deepEqual(s, original);
});

test("date context suggests only a unique round and never overwrites existing choices", () => {
  const s = settings();
  const v = { date: "2026-11-09", season: "", round: "" };
  assert.deepEqual(C.suggestContext(s, v), { ...v, season: "S1", round: "1st" });
  assert.deepEqual(C.suggestContext(s, { ...v, season: "S1" }), { ...v, season: "S1", round: "1st" });
  assert.deepEqual(C.suggestContext(s, { ...v, round: "1st" }), { ...v, season: "S1", round: "1st" });
  assert.deepEqual(C.suggestContext(s, { ...v, season: "S2", round: "2nd" }), { ...v, season: "S2", round: "2nd" });
  assert.deepEqual(C.suggestContext(s, { ...v, season: "S2" }), { ...v, season: "S2" });
  assert.deepEqual(C.suggestContext(s, { ...v, date: "2026-02-30" }), { ...v, date: "2026-02-30" });
  s.catalog.common.rounds[1].startDate = "2026-11-01";
  assert.deepEqual(C.suggestContext(s, v), v);
});

test("behavior displays definitions and retains undefined codes", () => {
  const s = settings();
  assert.deepEqual(C.choices(s, "behavior", {}), ["-1"]);
  assert.equal(C.label(s, "behavior", "-1"), "YIELD WIN（-1）");
  assert.equal(C.label(s, "behavior", "0"), "未定義コード：0");
});

test("profile editing preserves garage and team, validates vehicles and saves explicit rank", () => {
  const s = settings(), old = structuredClone(s);
  const profiles = C.profiles(s);
  profiles[0].rank = "PRIDE";
  profiles[0].stars = "12345";
  profiles[0].vehicles = ["CAR-HC"];
  const next = C.updateProfiles(s, profiles, "2026-11-09T00:00:00Z");
  assert.equal(next.catalog.personal.cards[0].currentRank.stars, "12345");
  assert.equal(next.catalog.personal.cards[0].activeSlots[0].vehicleId, "v2");
  assert.equal(next.catalog.personal.cards[0].teamId, "t1");
  assert.deepEqual(s, old);
  profiles[0].vehicles = ["MISSING"];
  assert.throws(() => C.updateProfiles(s, profiles, ""));
  profiles[0].vehicles = ["CAR-DH", "CAR-DH"];
  assert.throws(() => C.updateProfiles(s, profiles, ""));
});

test("master reimport preserves newer card rank, online flags and active slots", () => {
  const s = settings();
  const profiles = C.profiles(s);
  profiles[0].rank = "PRIDE";
  profiles[0].stars = "500";
  profiles[0].vehicles = ["CAR-HC"];
  profiles[1].onlineEnabled = true;
  const updated = C.updateProfiles(s, profiles, "2026-11-09");
  const result = C.merge(updated, catalog());
  assert.deepEqual(result.catalog.personal.cards, updated.catalog.personal.cards);
});

test("catalog backs up with local settings and invalid catalogs are rejected", () => {
  const draft = M.newDraft();
  const state = { schema: 1, settings: settings(), records: [], draft, settingsDraft: { cardProfiles: "[]" } };
  assert.deepEqual(M.validateBackup(JSON.parse(JSON.stringify(state))).settings.catalog, state.settings.catalog);
  state.settings.catalog.common.vehicles[0].id = "";
  assert.throws(() => M.validateBackup(state));
});

test("personal team pairs never populate opponent lists and migration preserves history inputs", () => {
  const s = settings();
  assert.deepEqual(s.teams, []);
  assert.deepEqual(s.teamShops, []);
  s.teams = ["TEAM", "OPPONENT"];
  s.teamShops = ["SHOP1", "OTHER SHOP"];
  const cleaned = C.cleanOpponentLists(s);
  assert.deepEqual(cleaned.teams, ["OPPONENT"]);
  assert.deepEqual(cleaned.teamShops, ["OTHER SHOP"]);
  assert.deepEqual(cleaned.catalog.personal.teams, s.catalog.personal.teams);
  assert.equal(C.cleanOpponentLists(cleaned), cleaned);
});

test("opponent team history keeps paired shops, latest first, excluding edited match", () => {
  const record = (id, date, team, teamShop) => ({ id, values: { date, team, teamShop } });
  const records = [
    record("1", "2026-11-01", "TEAM", "OLD SHOP"),
    record("2", "2026-11-02", "TEAM", "NEW SHOP"),
    record("3", "2026-11-03", "TEAM", "NEW SHOP"),
    record("4", "2026-11-04", "", "UNRELATED"),
    record("5", "2026-11-05", "TEAM", "DRAFT SHOP")
  ];
  assert.deepEqual(C.opponentTeams(records, "5"), [
    { team: "TEAM", teamShop: "NEW SHOP" }, { team: "TEAM", teamShop: "OLD SHOP" }
  ]);
});

test("card teamId selects a whole personal team-store pair without changing opponent fields", () => {
  const s = settings(), profiles = C.profiles(s);
  assert.equal(profiles[0].teamId, "t1");
  profiles[1].teamId = "t1";
  const next = C.updateProfiles(s, profiles, "2026-11-09");
  assert.equal(next.catalog.personal.cards[1].teamId, "t1");
  assert.equal(next.catalog.personal.cards[1].teamLabel, "TEAM");
  const values = { card: "B", team: "OPPONENT", teamShop: "OPPONENT SHOP", car: "" };
  assert.equal(C.applyCard(next, values).teamShop, "OPPONENT SHOP");
  profiles[1].teamId = "missing";
  assert.throws(() => C.updateProfiles(s, profiles, ""));
});

test("card detail view joins team number and store while supporting older settings", () => {
  const s = settings();
  assert.equal(C.cardInfo(s, "card1").find(([key]) => key === "チーム番号")[1], "未登録");
  s.catalog.personal.teams[0].number = "12-3456-7890";
  C.validate(s.catalog);
  const info = Object.fromEntries(C.cardInfo(s, "card1"));
  assert.equal(info["チーム"], "TEAM");
  assert.equal(info["チーム番号"], "12-3456-7890");
  assert.equal(info["チーム所属店舗"], "SHOP1");
  assert.match(info["登録車両"], /CAR-DH/);
  assert.equal(Object.fromEntries(C.cardInfo(s, "card2"))["チーム番号"], "未登録");
  assert.deepEqual(C.cardInfo(s, "missing"), []);
  s.catalog.personal.teams[0].number = 123;
  assert.throws(() => C.validate(s.catalog));
});

test("legacy card numbers are excluded from imports, differences, profile edits and backups", () => {
  const s = settings();
  const secret = "LEGACY-CARD-NUMBER";
  s.catalog.personal.cards[0].number = secret;
  s.catalog.personal.teams[0].number = "TEAM-NUMBER";
  const before = structuredClone(s);
  const info = Object.fromEntries(C.cardInfo(s, "card1"));
  assert.equal(info["カード番号"], undefined);
  assert.equal(info["カード名"], undefined);
  assert.equal(info["チーム番号"], "TEAM-NUMBER");
  const files = masterFiles(s.catalog);
  const masters = C.readMasters(files);
  assert.ok(!JSON.stringify(masters).includes(secret));
  assert.deepEqual(C.masterCardDiffs(settings(), masters), []);
  const selected = C.readSelectedMasters(files, ["CARD_Master"]);
  assert.ok(!JSON.stringify(selected).includes(secret));
  const bundle = { kind: "dac-settings-bundle", schemaVersion: 1, ...s.catalog };
  assert.ok(!JSON.stringify(C.readBundle(bundle)).includes(secret));
  const merged = C.merge(settings(), s.catalog);
  assert.ok(!JSON.stringify(merged).includes(secret));
  const kept = C.mergeMasters(s, { RANK_Master: masters.RANK_Master }, {});
  assert.ok(!JSON.stringify(kept).includes(secret));
  const profiles = C.profiles(s);
  profiles[0].onlineEnabled = false;
  profiles[0].teamId = null;
  const next = C.updateProfiles(s, profiles, "now");
  assert.deepEqual(C.choices(next, "card", {}), ["A", "B"]);
  assert.equal(next.catalog.personal.cards[0].teamId, null);
  assert.ok(!JSON.stringify(next).includes(secret));
  const input = {
    schema: 1, revision: 3, records: [], draft: M.newDraft(), settings: s, paste: "",
    settingsDraft: { ownCard: JSON.stringify({ id: "card1", label: "PENDING", number: secret }),
      ownTeam: JSON.stringify({ number: "PENDING-TEAM-NUMBER" }) }
  };
  const backup = M.validateBackup(input);
  assert.ok(!JSON.stringify(backup).includes(secret));
  assert.equal(backup.settings.catalog.personal.teams[0].number, "TEAM-NUMBER");
  assert.equal(JSON.parse(backup.settingsDraft.ownTeam).number, "PENDING-TEAM-NUMBER");
  assert.equal(JSON.parse(backup.settingsDraft.ownCard).label, "PENDING");
  assert.equal(backup.revision, 3);
  assert.deepEqual(backup.draft, input.draft);
  assert.deepEqual(s, before);
  assert.equal(M.withoutCardNumbers(backup), backup);
  assert.equal(C.withoutCardNumbers(settings().catalog).personal.cards[0].id, "card1");
  assert.throws(() => M.withoutCardNumbers({ ...input, settingsDraft: { ownCard: "{" } }), /旧カード編集下書き/);
});

test("vehicle profile edits keep empty slot positions and reject duplicates and invalid slots", () => {
  const s = settings();
  const profiles = C.profiles(s);
  profiles[0].vehicles = ["", "", "CAR-HC"];
  const next = C.updateProfiles(s, profiles, "now");
  assert.deepEqual(next.catalog.personal.cards[0].activeSlots, [{ slot: 3, vehicleId: "v2", label: "CAR-HC" }]);
  assert.deepEqual(C.profiles(next)[0].vehicles, ["", "", "CAR-HC"]);
  const unchanged = C.updateProfiles(next, C.profiles(next), "later");
  assert.deepEqual(unchanged.catalog.personal.cards[0].activeSlots, next.catalog.personal.cards[0].activeSlots);
  assert.deepEqual(unchanged.catalog.personal.cards[1], s.catalog.personal.cards[1]);
  assert.deepEqual(unchanged.catalog.personal.cards[0].garage, s.catalog.personal.cards[0].garage);
  profiles[0].vehicles = ["CAR-HC", "", "CAR-HC"];
  assert.throws(() => C.updateProfiles(s, profiles, "now"));
  profiles[0].vehicles = ["", "", ""];
  assert.deepEqual(C.updateProfiles(s, profiles, "now").catalog.personal.cards[0].activeSlots, []);
  s.catalog.personal.cards[0].activeSlots[0].slot = 4;
  assert.throws(() => C.validate(s.catalog));
});
