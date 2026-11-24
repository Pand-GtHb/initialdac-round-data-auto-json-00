(function (root) {
  "use strict";
  function invalid(message) { throw new Error(`設定マスターが不正です：${message}`); }
  function text(value) { return typeof value === "string"; }
  function normalizeStars(value) {
    return /^[★ ]+$/.test(value) ? value.replace(/ /g, "") : value;
  }
  function formatStars(value) {
    const stars = normalizeStars(value);
    return /^★+$/.test(stars) ? stars.replace(/(★{4})(?=★)/g, "$1 ") : value;
  }
  function isVehicleDivider(value) { return /^-{5,}$/.test(value) || /^---\s+\S(?:.*\S)?\s+---$/.test(value); }
  function displayVehicleDivider(value) { return /^-{5,}$/.test(value) ? "---------------------" : value; }
  // Verified against the original Excel vehicle sheet and the existing catalog IDs.
  const legacyManufacturers = Object.entries({
    TOYOTA: "cb7efa38e0f1124e 1b434916b839ecd5 5f86f76e36327eb5 f03d9dea1f56c8f5 0de1d23dc3e0f5b4 919ba202395b09f6 4f9206d2f453ea6a 1e7f35e4ade2ff5a 9b4a28d8cf993948 3ef15370740e6622 07b99b5b9dd63f3e 8d1fe3ad76b52bc7 f25f7a785841b2f6 dc81164e7b3a7a6e a7d9c916c701c628 72991f71a75ac6e3 e0860b99ead97b61 d03b25b506004620 612066419a425a85 12f072a8936910d2 8ee3ba72335a84a7 036ad3e8477dfea6 a0515d00fde9a568 74f6a1528f24534a f0510bf11aad8652 8016c54fd67e8e90 5c308f8d8877bd43 f5af55a49746e950 99a18bbf3e6bf74b 3bdd1fc25a54a417 cb40b25f0f2481fa 289d8bb91d15729e",
    NISSAN: "fbcca166b72c1969 a94d61fbff9f1095 b3a5cfa8bc1f8f5b 81e65744d4160216 7c5ec4dc2c5a12b3 38d236520d06dc91 4318d0069179c5c2 654fd5d0aa7e81af d4965155502d9159 f9e0752211c39a30 0b517f7a0e710fbd b799f158cbf6e206 22d140e55d2389e7 16293e6c9f51f184 3693165e30239a1d 5126734cfb93391e 200f1f0502d4b0e5 6fc6da1a95ceb74d 4b3a67e1701d1e7e 99eacd68c28f5481 77efda476bef9904 1085d1e5218ebe81 26c0771ba3c43b14 a74948d902dba148 d5461b44c029b0d2 c51726fe59a0829f 12dbd43f57bbdb00 10bd9d43b1d69dfb 9c29a90495e82e92 fe4893266d785275",
    HONDA: "9fbb9ebf50b4bf8b f98db75f25048d03 90f3cdd0b3929f3d d5b8392472173700 8e8314a1306def01 2845e32483926418 ecc478c6f5fcf4c6 a0b99bdcebc32ff7 a377eaccac5cbc9b 4811355bca412ce3 4bf5409696ddea51 89add68d6f4116c3 767eb1cb1672a2c6 e66e163e0bc28182",
    MAZDA: "f9b2926ecc0df906 d0a19dc947f16ae1 796f9a86f5e516b2 5affc6c9e51ce749 1ef7bda06c3e4d77 60801ae97f18c6e8 e310b2e0695b5633 ba6b17e08bfd2d4e 5add0ea050110a19 bd74ae56aff4a4df 8672b0c3d1e14323 a479ad508885a116 7b765b53dd6f5f32 3d9d334e316bc1af 4255404ba704cab9",
    SUBARU: "32480acef83fbcb1 a1cf543d5c1dbf33 522d7e1c364a067f 11b3c543975527e1 53134fc35a163fc4 0ba3590035caad8f f0100ca921934503 ee3326b0d063daa5 3c2dcbc8c47d422d b765bf738c018d7e b281c10b566663fe 03b9544cb5769809 82dc9b94e8e1c085",
    MITSUBISHI: "1551cd2dc5e0dba7 e5f056788380574a eaa312dfec4de6cc ca9df0348cde8a44 07398118bc886fac 5c2a5a4f2007a265 c19cc389a867620b 33f4873556e56954 0ebd571592f0197c 0930054c33a12b48 7ac8978a14bc5764 3ee8d54d28452c69 397f90d4108c8428 778fda74626f51a0 7b94a29714d1b398 fc4ea453884193d3",
    SUZUKI: "c8414760238f14a5 bd95b02724e382f7 212af7033d3f8918 25a4587b876e5e19 96d1dcff51bb0614",
    "頭文字D": "abb91024ed35ec73 28375540e02f19d1",
    PORSCHE: "3cb9a349f608f4e8 2b1fbf3e96bad0af edfbf05ab925e0bc 360cbb1b9d71d626 b802090e9a6e6df8 28e34237998e6026",
    ALFAROMEO: "55f109089826f9c9 0f987cbbd1cf6a7e",
    DAIHATSU: "99316b34e7d793c2"
  }).flatMap(([name, ids]) => ids.split(" ").map(id => [`vehicle-${id}`, name]));
  const legacyManufacturerById = new Map(legacyManufacturers);
  function items(value, label) {
    if (!Array.isArray(value)) invalid(label);
    const ids = new Set();
    for (const item of value) {
      if (!item || !text(item.id) || !item.id || ids.has(item.id)) invalid(`${label}のID`);
      ids.add(item.id);
    }
    return ids;
  }
  function validDate(value) {
    if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function validate(catalog) {
    if (!catalog || !catalog.common || !catalog.personal ||
        catalog.common.schemaVersion !== 1 || catalog.personal.schemaVersion !== 1 ||
        catalog.common.kind !== "dac-settings-design-draft" ||
        catalog.personal.kind !== "dac-personal-settings-design-draft") invalid("形式またはバージョン");
    const c = catalog.common, p = catalog.personal;
    const vehicles = items(c.vehicles, "車種"), courses = items(c.courses, "コース");
    if (c.vehicleDividers !== undefined && (!Array.isArray(c.vehicleDividers) ||
        c.vehicleDividers.some(item => !item || !vehicles.has(item.beforeVehicleId) ||
          !text(item.label) || !isVehicleDivider(item.label)) ||
        new Set(c.vehicleDividers.map(item => item.beforeVehicleId)).size !== c.vehicleDividers.length)) invalid("車種の区切り線");
    const areas = items(c.areas, "エリア"), stores = items(c.stores, "店舗");
    const seasons = items(c.seasons, "シーズン");
    items(c.rounds, "ラウンド");
    items(p.cards, "カード");
    const teams = items(p.teams, "チーム");
    for (const list of [c.vehicles, c.courses, c.areas, c.stores, c.seasons, p.cards, p.teams]) {
      if (list.some(item => !text(item.label) || !item.label.trim())) invalid("表示名");
    }
    for (const list of [c.rankLabels, c.starLabels, c.roundLabels]) {
      if (!Array.isArray(list) || list.some(value => !text(value) || !value.trim())) invalid("候補リスト");
    }
    if (c.courses.some(course => typeof course.selectable !== "boolean")) invalid("コースの選択可否");
    if (c.stores.some(store => !areas.has(store.areaId))) invalid("店舗のエリア参照");
    for (const round of c.rounds) {
      if (!seasons.has(round.seasonId) || !text(round.roundLabel) ||
          !validDate(round.startDate) || !validDate(round.endDate) || round.startDate > round.endDate ||
          !Array.isArray(round.courseIds) || round.courseIds.some(id => !courses.has(id))) invalid("ラウンド設定");
    }
    const roundKeys = c.rounds.map(round => `${round.seasonId}\0${round.roundLabel}`);
    if (new Set(roundKeys).size !== roundKeys.length) invalid("シーズン・ラウンドの重複");
    if (!Array.isArray(c.behaviorCodes) || c.behaviorCodes.some(item => !item ||
        !text(item.code) || !item.code.trim() || !text(item.label) || !item.label.trim()) ||
        new Set(c.behaviorCodes.map(item => item.code)).size !== c.behaviorCodes.length) invalid("ブレフラ等コード");
    if (!Array.isArray(c.rankLevels) || c.rankLevels.some(item => !item || !text(item.rank) ||
        !(item.stars === null || text(item.stars)) || !Number.isFinite(item.legacyRankValue))) invalid("ランク比較値");
    for (const card of p.cards) {
      if (![true, false, null].includes(card.onlineEnabled) ||
          !(card.teamId === null || teams.has(card.teamId)) ||
          !Array.isArray(card.activeSlots) || card.activeSlots.length > 3 ||
          !Array.isArray(card.garage)) invalid("カード設定");
      for (const list of [card.activeSlots, card.garage]) {
        if (list.some(slot => !slot || !vehicles.has(slot.vehicleId) || !text(slot.label) ||
            !Number.isInteger(slot.slot) || slot.slot < 1 || (list === card.activeSlots && slot.slot > 3)) ||
            new Set(list.map(slot => slot.slot)).size !== list.length) invalid("カードの車両参照");
      }
      if (card.currentRank !== null && (!card.currentRank || !text(card.currentRank.rank) ||
          !text(card.currentRank.stars))) invalid("カードの現在ランク");
    }
    if (new Set(p.cards.map(card => card.label)).size !== p.cards.length) invalid("カード名の重複");
    for (const team of p.teams) {
      if (!(team.homeStoreId === null || stores.has(team.homeStoreId)) || !text(team.homeStoreLabel)) invalid("チーム店舗参照");
      if (team.number !== undefined && team.number !== null && !text(team.number)) invalid("チーム番号");
    }
    return catalog;
  }
  function readBundle(data) {
    if (!data || data.kind !== "dac-settings-bundle" || data.schemaVersion !== 1) invalid("設定リストJSONではありません");
    return validate(withoutCardNumbers({ common: data.common, personal: data.personal }));
  }
  function withoutCardNumbers(catalog) {
    if (!Array.isArray(catalog?.personal?.cards) ||
        !catalog.personal.cards.some(card => card && Object.hasOwn(card, "number"))) return catalog;
    const next = structuredClone(catalog);
    for (const card of next.personal.cards) {
      if (card && typeof card === "object") delete card.number;
    }
    return next;
  }
  const masterFields = {
    AREA_Master: ["areas"], CAR_Master: ["vehicles", "vehicleDividers"],
    ROUND_Master: ["courses", "seasons", "rounds", "roundLabels"],
    STORE_Master: ["stores"], TEAM_Master: ["teams"], CARD_Master: ["cards"],
    RANK_Master: ["rankLabels", "starLabels", "rankLevels"], CORD_Master: ["behaviorCodes"]
  };
  const dailyMasterTypes = ["STORE_Master", "TEAM_Master", "CARD_Master"];
  const timingMasterTypes = ["ROUND_Master", "CAR_Master", "RANK_Master", "AREA_Master", "CORD_Master"];
  const supportedMasterTypes = [...Object.keys(masterFields), "OPPONENT_Master"];
  function masterTypesForFiles(files) {
    if (!Array.isArray(files) || files.some(file => !supportedMasterTypes.includes(file?.masterType))) {
      invalid("未対応のマスター種類です");
    }
    return [...new Set(files.map(file => file.masterType))];
  }
  function readSelectedMasters(files, selectedTypes) {
    if (!Array.isArray(files) || !Array.isArray(selectedTypes) || !selectedTypes.length ||
        new Set(selectedTypes).size !== selectedTypes.length ||
        selectedTypes.some(type => !supportedMasterTypes.includes(type))) invalid("取り込む種類を選択してください");
    if (files.some(file => !supportedMasterTypes.includes(file?.masterType))) invalid("未対応のマスター種類です");
    const chosen = selectedTypes.map(type => {
      const matches = files.filter(file => file.masterType === type);
      if (!matches.length) invalid(`${type}のファイルが不足しています`);
      if (matches.length > 1) invalid(`${type}が重複しています。不要なファイルを外してください`);
      return matches[0];
    });
    const history = chosen.find(file => file.masterType === "OPPONENT_Master") || null;
    if (history && (history.schema !== 1 || !Array.isArray(history.records))) invalid("対戦履歴JSONの形式");
    const settingsFiles = chosen.filter(file => file.masterType !== "OPPONENT_Master");
    return { masters: settingsFiles.length ? readMasters(settingsFiles) : {}, history: history && structuredClone(history) };
  }
  function readMasters(files) {
    if (!Array.isArray(files) || files.length < 1 || files.length > 8) invalid("マスターは１～８種類を選択してください");
    const masters = {};
    for (const file of files) {
      if (!file || file.kind !== "dac-master" || file.schemaVersion !== 1 ||
          !Object.hasOwn(masterFields, file.masterType) || !file.data ||
          typeof file.data !== "object" || Array.isArray(file.data)) invalid("マスターJSONの形式または種類");
      if (Object.hasOwn(masters, file.masterType)) invalid(`${file.masterType}が重複しています`);
      for (const key of masterFields[file.masterType]) {
        if (!Array.isArray(file.data[key])) invalid(`${file.masterType}の${key}`);
      }
      masters[file.masterType] = structuredClone(file.data);
      if (file.masterType === "CARD_Master") {
        masters[file.masterType] = withoutCardNumbers({ personal: masters[file.masterType] }).personal;
      }
    }
    if (files.length === 8 && Object.keys(masters).length !== Object.keys(masterFields).length) invalid("８種類のマスターが必要です");
    return masters;
  }
  function readDailyUpdate(files) {
    if (!Array.isArray(files) || files.length !== 4) invalid("日次更新にはSTORE、TEAM、CARD、OPPONENTのJSONが各１件必要です");
    const historyFiles = files.filter(file => file?.masterType === "OPPONENT_Master");
    const masterFiles = files.filter(file => Object.hasOwn(masterFields, file?.masterType));
    if (historyFiles.length !== 1 || historyFiles[0].schema !== 1 || !Array.isArray(historyFiles[0].records) ||
        masterFiles.length !== dailyMasterTypes.length ||
        dailyMasterTypes.some(type => masterFiles.filter(file => file.masterType === type).length !== 1)) {
      invalid("日次更新のJSON構成または種類");
    }
    return { masters: readMasters(masterFiles), history: structuredClone(historyFiles[0]) };
  }
  function readTimingMasters(files) {
    const masters = readMasters(files);
    if (Object.keys(masters).some(type => !timingMasterTypes.includes(type))) {
      invalid("タイミング更新にはROUND、CAR、RANK、AREA、CORDのみ選択できます");
    }
    return masters;
  }
  function cardValues(card) {
    if (!Array.isArray(card.activeSlots) || !Array.isArray(card.garage) ||
        [...card.activeSlots, ...card.garage].some(slot => !slot || typeof slot !== "object")) invalid("カードの車両");
    if (card.currentRank !== null && (!card.currentRank || !text(card.currentRank.rank) ||
        !text(card.currentRank.stars))) invalid("カードの現在ランク");
    const slots = list => list.map(slot => ({ slot: slot.slot, vehicleId: slot.vehicleId, label: slot.label }));
    return { label: card.label, teamId: card.teamId, teamLabel: card.teamLabel || "",
      rank: card.currentRank?.rank || "", stars: normalizeStars(card.currentRank?.stars || ""),
      activeSlots: slots(card.activeSlots), garage: slots(card.garage) };
  }
  function masterCardDiffs(settings, masters) {
    const old = settings.catalog?.personal.cards || [];
    if (!masters.CARD_Master) return [];
    items(masters.CARD_Master.cards, "カード");
    return masters.CARD_Master.cards.flatMap(card => {
      const current = old.find(item => item.id === card.id);
      if (!current) return [];
      const app = cardValues(current), excel = cardValues(card);
      return JSON.stringify(app) === JSON.stringify(excel) ? [] : [{ id: card.id, app, excel }];
    });
  }
  function mergeMasters(settings, masters) {
    if (!settings.catalog && Object.keys(masters).length !== 8) {
      invalid("初回は８種類すべて、または従来の設定リストを取り込んでください");
    }
    const empty = {
      common: { kind: "dac-settings-design-draft", schemaVersion: 1, vehicles: [], vehicleDividers: [],
        courses: [], seasons: [], rounds: [], roundLabels: [], areas: [], stores: [],
        rankLabels: [], starLabels: [], rankLevels: [], behaviorCodes: [] },
      personal: { kind: "dac-personal-settings-design-draft", schemaVersion: 1, cards: [], teams: [] }
    };
    const next = structuredClone(settings.catalog || empty);
    for (const [type, data] of Object.entries(masters)) {
      for (const key of masterFields[type]) {
        const target = ["cards", "teams"].includes(key) ? next.personal : next.common;
        target[key] = structuredClone(data[key]);
      }
    }
    const areaIds = new Set(next.common.areas.map(item => item.id));
    const vehicleIds = new Set(next.common.vehicles.map(item => item.id));
    const teamIds = new Set(next.personal.teams.map(item => item.id));
    if (next.common.stores.some(item => !areaIds.has(item.areaId))) invalid("参照先が不足しています：AREA_Master");
    if (next.personal.cards.some(card => card.teamId !== null && !teamIds.has(card.teamId))) invalid("参照先が不足しています：TEAM_Master");
    if (next.personal.cards.some(card => [card.activeSlots, card.garage].some(list =>
      Array.isArray(list) && list.some(slot => !vehicleIds.has(slot.vehicleId))))) invalid("参照先が不足しています：CAR_Master");
    const storeIds = new Set(next.common.stores.map(item => item.id));
    for (const team of next.personal.teams) {
      if (!team || !(team.homeStoreId === null || text(team.homeStoreId))) invalid("チーム店舗参照");
      if (team.homeStoreId !== null && !storeIds.has(team.homeStoreId)) team.homeStoreId = null;
    }
    validate(next);
    const result = structuredClone(settings);
    result.cards = next.personal.cards.map(card => card.label);
    result.courses = next.common.courses.filter(course => course.selectable).map(course => course.label);
    result.cars = next.common.vehicles.map(vehicle => vehicle.label);
    result.seasons = next.common.seasons.map(season => season.label);
    result.rounds = [...next.common.roundLabels];
    result.shopsByArea = Object.fromEntries(next.common.areas.map(area => [area.label,
      next.common.stores.filter(store => store.areaId === area.id).map(store => store.label)]));
    result.catalog = withoutCardNumbers(next);
    return compactGarages(result);
  }
  function merge(settings, catalog) {
    validate(catalog);
    const result = structuredClone(settings);
    const next = structuredClone(catalog);
    if (settings.catalog) {
      for (const key of ["vehicles", "courses", "seasons"]) {
        for (const item of settings.catalog.common[key]) {
          if (!next.common[key].some(candidate => candidate.id === item.id)) next.common[key].push(structuredClone(item));
        }
        if (!next.common.vehicleDividers && settings.catalog.common.vehicleDividers) {
          next.common.vehicleDividers = structuredClone(settings.catalog.common.vehicleDividers);
        }
      }
      for (const card of next.personal.cards) {
        const existing = settings.catalog.personal.cards.find(item => item.id === card.id);
        if (existing) {
          if (existing.locallyEdited) {
            for (const key of ["label", "garage", "locallyEdited"]) card[key] = structuredClone(existing[key]);
          }
          card.onlineEnabled = existing.onlineEnabled;
          card.currentRank = structuredClone(existing.currentRank);
          card.activeSlots = structuredClone(existing.activeSlots);
          card.teamId = existing.teamId;
          if (existing.teamLabel !== undefined) card.teamLabel = existing.teamLabel;
        }
      }
      for (const card of settings.catalog.personal.cards) {
        if (!next.personal.cards.some(item => item.id === card.id)) next.personal.cards.push(structuredClone(card));
      }
      for (const team of settings.catalog.personal.teams) {
        const index = next.personal.teams.findIndex(item => item.id === team.id);
        if (index < 0) next.personal.teams.push(structuredClone(team));
        else if (team.locallyEdited) next.personal.teams[index] = structuredClone(team);
      }
    }
    const union = (key, values) => { result[key] = [...new Set([...(result[key] || []), ...values])]; };
    const c = next.common;
    union("cards", next.personal.cards.map(card => card.label));
    union("courses", c.courses.filter(course => course.selectable).map(course => course.label));
    result.cars = [...(result.cars || []), ...c.vehicles.map(vehicle => vehicle.label)
      .filter(label => !(result.cars || []).includes(label))];
    union("seasons", c.seasons.map(season => season.label));
    union("rounds", c.roundLabels);
    result.shopsByArea = structuredClone(result.shopsByArea || {});
    for (const area of c.areas) {
      result.shopsByArea[area.label] = [...new Set([...(result.shopsByArea[area.label] || []),
        ...c.stores.filter(store => store.areaId === area.id).map(store => store.label)])];
    }
    result.catalog = validate(withoutCardNumbers(next));
    return compactGarages(result);
  }
  function selectedCard(settings, values) {
    return settings.catalog?.personal.cards.find(card => card.label === values.card);
  }
  function selectedRound(settings, values) {
    const c = settings.catalog?.common;
    const season = c?.seasons.find(item => item.label === values.season);
    return c?.rounds.find(round => round.seasonId === season?.id && round.roundLabel === values.round);
  }
  function choices(settings, key, values) {
    if (!settings.catalog) return null;
    const { common: c, personal: p } = settings.catalog;
    if (key === "card") return p.cards.map(card => card.label);
    if (key === "myRank" || key === "opponentRank") return c.rankLabels;
    if (key === "myStars") return c.starLabels;
    if (key === "round") {
      const season = c.seasons.find(item => item.label === values.season);
      return c.rounds.filter(round => round.seasonId === season?.id).map(round => round.roundLabel);
    }
    if (key === "course") {
      const ids = selectedRound(settings, values)?.courseIds || [];
      return c.courses.filter(course => course.selectable && ids.includes(course.id)).map(course => course.label);
    }
    if (key === "car") return selectedCard(settings, values)?.activeSlots.map(slot => slot.label) || [];
    if (key === "opponentCar") return settings.cars;
    if (key === "behavior") return c.behaviorCodes.map(item => item.code);
    return null;
  }
  function label(settings, key, value) {
    if (key === "myStars" || key === "opponentStars") return formatStars(value);
    if (key !== "behavior" || !settings.catalog || !value) return value;
    const item = settings.catalog.common.behaviorCodes.find(item => item.code === value);
    return item ? `${item.label}（${value}）` : `未定義コード：${value}`;
  }
  function roundCourseRows(courses, ids) {
    const labels = new Map(courses.map(course => [course.id, course.label]));
    const groups = new Map();
    for (const id of ids) {
      const label = labels.get(id);
      if (!label) continue;
      const separator = label.search(/[：:]/);
      const name = separator < 0 ? label : label.slice(0, separator).trim();
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(label);
    }
    return [...groups.values()].flatMap(labels => {
      const rows = [];
      for (let i = 0; i < labels.length; i += 2) rows.push([labels[i], labels[i + 1] || ""]);
      return rows;
    });
  }
  function applyCard(settings, values) {
    const card = selectedCard(settings, values);
    if (!settings.catalog) return values;
    return { ...values, myRank: card?.currentRank?.rank || "", myStars: card?.currentRank?.stars || "",
      car: card?.activeSlots.some(slot => slot.label === values.car) ? values.car : "" };
  }
  function suggestContext(settings, values) {
    if (!settings.catalog || (values.season && values.round) || !validDate(values.date)) return values;
    const matches = settings.catalog.common.rounds.filter(round => round.startDate <= values.date && round.endDate >= values.date &&
      (!values.round || values.round === round.roundLabel) &&
      (!values.season || settings.catalog.common.seasons.find(item => item.id === round.seasonId)?.label === values.season));
    if (matches.length !== 1) return values;
    const round = matches[0];
    const season = settings.catalog.common.seasons.find(item => item.id === round.seasonId);
    return { ...values, season: season.label, round: round.roundLabel };
  }
  function warnings(settings, values) {
    if (!settings.catalog) return [];
    const result = [];
    for (const [key, name] of [["card", "カード"], ["round", "ラウンド"], ["car", "自車種"], ["course", "コース"]]) {
      if (values[key] && !choices(settings, key, values).includes(values[key])) result.push(`${name}「${values[key]}」は現在の設定候補外です。値は保持しています。`);
    }
    if (values.card && !selectedCard(settings, values)?.currentRank) result.push("このカードの現在ランクは未登録です。");
    if (values.date && values.season && values.round) {
      const round = selectedRound(settings, values);
      if (round && (values.date < round.startDate || values.date > round.endDate)) result.push("日付が選択ラウンドの開催期間外です。");
    }
    return result;
  }
  function profiles(settings) {
    return settings.catalog?.personal.cards.map(card => ({
      id: card.id, label: card.label, onlineEnabled: card.onlineEnabled,
      rank: card.currentRank?.rank || "", stars: card.currentRank?.stars || "", teamId: card.teamId,
      vehicles: Array.from({ length: Math.max(0, ...card.activeSlots.map(slot => slot.slot)) },
        (_, index) => card.activeSlots.find(slot => slot.slot === index + 1)?.label || "")
    })) || [];
  }
  function updateOnlineEnabled(settings, id, value) {
    if (![true, false, null].includes(value)) invalid("オンライン対象");
    const next = structuredClone(settings);
    const card = next.catalog?.personal.cards.find(item => item.id === id);
    if (!card) invalid("カードが見つかりません");
    card.onlineEnabled = value;
    validate(next.catalog);
    return next;
  }
  function updateCardTeam(settings, cardId, teamId) {
    const next = structuredClone(settings);
    const card = next.catalog?.personal.cards.find(item => item.id === cardId);
    if (!card) invalid("カードが見つかりません");
    const team = next.catalog.personal.teams.find(item => item.id === teamId);
    if (teamId !== null && !team) invalid("カードの所属チーム参照");
    card.teamId = team?.id || null;
    card.teamLabel = team?.label || null;
    validate(next.catalog);
    return next;
  }
  function updateCardSlots(settings, cardId, vehicleIds) {
    const catalog = settings.catalog;
    const card = catalog?.personal.cards.find(item => item.id === cardId);
    if (!card) invalid("カードが見つかりません");
    if (!Array.isArray(vehicleIds) || vehicleIds.length !== 3 || ![...vehicleIds].every(text)) invalid("スロット指定");
    const assigned = vehicleIds.filter(Boolean);
    if (new Set(assigned).size !== assigned.length) invalid("同じ車種を複数のスロットに登録できません");
    const activeSlots = vehicleIds.flatMap((id, index) => {
      if (!id) return [];
      const vehicle = catalog.common.vehicles.find(item => item.id === id);
      if (!vehicle) invalid("未登録の車種です");
      const slot = index + 1;
      return [card.activeSlots.find(item => item.slot === slot && item.vehicleId === id)
        || { slot, vehicleId: id, label: vehicle.label }];
    });
    const next = { ...catalog, personal: { ...catalog.personal,
      cards: catalog.personal.cards.map(item => item === card ? { ...card, activeSlots } : item) } };
    return { ...settings, catalog: validate(withoutCardNumbers(next)) };
  }
  function cardInfo(settings, cardId) {
    const card = settings.catalog?.personal.cards.find(item => item.id === cardId);
    if (!card) return [];
    const team = settings.catalog.personal.teams.find(item => item.id === card.teamId);
    return [
      ["チーム", team?.label || card.teamLabel || "未登録"],
      ["チーム番号", team?.number || "未登録"],
      ["チーム所属店舗", team?.homeStoreLabel || "未登録"],
      ["現在ランク", [card.currentRank?.rank, formatStars(card.currentRank?.stars || "")].filter(Boolean).join(" ") || "未登録"],
      ["登録車両", card.activeSlots.map(slot => `スロット${slot.slot}：${slot.label}`).join("\n") || "未登録"],
      ["車庫", card.garage.map(slot => `車庫${slot.slot}：${slot.label}`).join("\n") || "未登録"]
    ];
  }
  function updateProfiles(settings, data, updatedAt) {
    if (!settings.catalog || !Array.isArray(data) || data.length !== settings.catalog.personal.cards.length) invalid("全カードの設定を指定してください");
    items(data, "カード編集");
    const next = structuredClone(settings);
    for (const profile of data) {
      const stars = text(profile.stars) ? normalizeStars(profile.stars) : profile.stars;
      const card = next.catalog.personal.cards.find(item => item.id === profile.id);
      if (!card || card.label !== profile.label || ![true, false, null].includes(profile.onlineEnabled) ||
          !text(profile.rank) || !text(profile.stars) || !Array.isArray(profile.vehicles) ||
          profile.vehicles.length > 3 || new Set(profile.vehicles.filter(Boolean)).size !== profile.vehicles.filter(Boolean).length) invalid("カード編集");
      if (profile.rank && !next.catalog.common.rankLabels.includes(profile.rank)) invalid("カードのランク名");
      if (stars && !next.catalog.common.starLabels.some(value => normalizeStars(value) === stars) &&
          !/^\d+(\.\d+)?$/.test(stars)) invalid("カードの星・PRIDE");
      card.activeSlots = profile.vehicles.flatMap((name, index) => {
        if (name === "") return [];
        const vehicle = next.catalog.common.vehicles.find(item => item.label === name);
        if (!vehicle) invalid(`未登録車種：${name}`);
        const existing = card.activeSlots.find(slot => slot.slot === index + 1 && slot.vehicleId === vehicle.id && slot.label === vehicle.label);
        return [existing || { slot: index + 1, vehicleId: vehicle.id, label: vehicle.label }];
      });
      card.onlineEnabled = profile.onlineEnabled;
      if (profile.teamId !== undefined) {
        const team = next.catalog.personal.teams.find(item => item.id === profile.teamId);
        if (profile.teamId !== null && !team) invalid("カードの所属チーム参照");
        if (card.teamId !== profile.teamId) {
          card.teamId = team?.id || null;
          card.teamLabel = team?.label || null;
        }
      }
      if (card.currentRank?.rank !== profile.rank || card.currentRank?.stars !== stars) {
        card.currentRank = profile.rank || stars
          ? { rank: profile.rank, stars, updatedAt, phase: "manually-confirmed-current" } : null;
      }
    }
    next.catalog = validate(withoutCardNumbers(next.catalog));
    return next;
  }
  function opponentTeams(records, excludeId) {
    const pairs = new Map();
    for (const record of [...records].reverse().sort((a, b) =>
      b.values.date.localeCompare(a.values.date) || (b.updatedAt || "").localeCompare(a.updatedAt || ""))) {
      if (record.id === excludeId || !record.values.team.trim()) continue;
      const key = JSON.stringify([record.values.team, record.values.teamShop]);
      if (!pairs.has(key)) pairs.set(key, { team: record.values.team, teamShop: record.values.teamShop });
    }
    return [...pairs.values()];
  }
  function teamSuggestions(records, query, excludeId) {
    const normalized = query.normalize("NFKC").trim().toLowerCase();
    return normalized ? opponentTeams(records, excludeId).filter(pair =>
      pair.team.normalize("NFKC").toLowerCase().includes(normalized)) : [];
  }
  function vehicleOptions(settings, labels = settings.catalog?.common.vehicles.map(vehicle => vehicle.label) || settings.cars) {
    const dividers = new Map((settings.catalog?.common.vehicleDividers || []).map(divider =>
      [settings.catalog.common.vehicles.find(vehicle => vehicle.id === divider.beforeVehicleId).label, divider.label]));
    const result = [];
    for (const value of labels) {
      if (isVehicleDivider(value)) result.push({ label: displayVehicleDivider(value), value: "", divider: true });
      else {
        if (dividers.has(value)) {
          const label = displayVehicleDivider(dividers.get(value));
          if (!result.at(-1)?.divider) result.push({ label, value: "", divider: true });
          else if (label !== "---------------------") result[result.length - 1].label = label;
        }
        result.push({ label: value, value, divider: false });
      }
    }
    return result;
  }
  function vehicleGroups(settings) {
    const vehicles = new Map((settings.catalog?.common.vehicles || []).map(vehicle => [vehicle.label, vehicle]));
    const groups = new Map();
    let heading = null;
    for (const option of vehicleOptions(settings, settings.cars || [])) {
      if (option.divider) {
        const match = /^---\s+(\S(?:.*\S)?)\s+---$/.exec(option.label);
        heading = match ? match[1] : null;
        continue;
      }
      const vehicle = vehicles.get(option.value);
      const manufacturer = heading || vehicle?.manufacturer || legacyManufacturerById.get(vehicle?.id) || null;
      if (!groups.has(manufacturer)) groups.set(manufacturer, []);
      if (!groups.get(manufacturer).includes(option.value)) groups.get(manufacturer).push(option.value);
    }
    return [...groups].map(([manufacturer, values]) => ({ manufacturer, values }));
  }
  function registerCard(settings, data, updatedAt) {
    if (!settings.catalog || !data || !text(data.label) || !data.label.trim() ||
        !Array.isArray(data.garage)) invalid("カード名・車庫");
    const next = structuredClone(settings);
    let card = next.catalog.personal.cards.find(item => item.id === data.id);
    if (data.id !== null && !card) invalid("編集するカードがありません");
    if (!card) {
      card = { id: `card-${root.crypto.randomUUID()}`, label: data.label.trim(),
        onlineEnabled: null, teamId: null, activeSlots: [], garage: [], currentRank: null };
      next.catalog.personal.cards.push(card);
    }
    if (next.catalog.personal.cards.some(item => item.id !== card.id && item.label === data.label.trim())) invalid("カード名の重複");
    card.label = data.label.trim();
    card.locallyEdited = true;
    card.garage = data.garage.filter(name => name !== "").map((name, index) => {
      const vehicle = next.catalog.common.vehicles.find(item => item.label === name);
      if (!vehicle) invalid(`車庫の未登録車種：${name}`);
      const existing = card.garage.find(slot => slot.slot === index + 1 && slot.vehicleId === vehicle.id);
      return existing || { slot: index + 1, vehicleId: vehicle.id, label: vehicle.label };
    });
    const profilesData = profiles(next);
    Object.assign(profilesData.find(item => item.id === card.id), {
      onlineEnabled: data.onlineEnabled, teamId: data.teamId,
      rank: data.rank, stars: data.stars, vehicles: data.vehicles
    });
    return { settings: updateProfiles(next, profilesData, updatedAt), id: card.id };
  }
  function registerTeam(settings, data) {
    if (!settings.catalog || !data || !text(data.label) || !data.label.trim() ||
        !text(data.number) || !text(data.homeStoreLabel)) invalid("自分用チームの名前・番号・店舗");
    const next = structuredClone(settings);
    let team = next.catalog.personal.teams.find(item => item.id === data.id);
    if (data.id !== null && !team) invalid("編集するチームがありません");
    if (next.catalog.personal.teams.some(item => item.id !== data.id &&
        item.label === data.label.trim() && item.homeStoreLabel === data.homeStoreLabel.trim())) invalid("自分用チーム・店舗の重複");
    if (!team) {
      team = { id: `team-${root.crypto.randomUUID()}` };
      next.catalog.personal.teams.push(team);
    }
    const stores = next.catalog.common.stores.filter(store => store.label === data.homeStoreLabel.trim());
    Object.assign(team, { label: data.label.trim(), number: data.number.trim(),
      homeStoreLabel: data.homeStoreLabel.trim(), homeStoreId: stores.length === 1 ? stores[0].id : null, locallyEdited: true });
    for (const card of next.catalog.personal.cards) {
      if (card.teamId === team.id) card.teamLabel = team.label;
    }
    validate(next.catalog);
    return { settings: next, id: team.id };
  }
  function registerList(settings, key, values) {
    const names = Array.isArray(values) ? values.filter(value => key !== "cars" || !text(value) || !isVehicleDivider(value.trim())) : [];
    if (!["seasons", "rounds", "cars", "courses"].includes(key) || !Array.isArray(values) ||
        values.some(value => !text(value) || !value.trim()) || new Set(names.map(value => text(value) ? value.trim() : value)).size !== names.length) invalid("登録リストの値・重複");
    const next = structuredClone(settings);
    next[key] = values.map(value => value.trim());
    if (next.catalog) {
      const common = next.catalog.common;
      if (key === "rounds") common.roundLabels = [...next.rounds];
      else {
        const target = key === "cars" ? "vehicles" : key;
        for (const label of next[key]) {
          if (key === "cars" && isVehicleDivider(label)) continue;
          if (!common[target].some(item => item.label === label)) {
            common[target].push({ id: `${target}-${root.crypto.randomUUID()}`, label,
              ...(key === "courses" ? { selectable: true } : {}) });
          }
        }
      }
      validate(next.catalog);
    }
    return next;
  }
  function cleanOpponentLists(settings) {
    if (!settings.catalog || settings.catalog.opponentListsSeparated) return settings;
    const next = structuredClone(settings);
    const teams = settings.catalog.personal.teams;
    next.teams = (next.teams || []).filter(name => !teams.some(team => team.label === name));
    next.teamShops = (next.teamShops || []).filter(name => !teams.some(team => team.homeStoreLabel === name));
    next.catalog.opponentListsSeparated = true;
    return next;
  }
  function compactGarages(settings) {
    if (!settings.catalog || settings.catalog.personal.cards.every(card =>
      card.garage.every((vehicle, index) => vehicle.slot === index + 1))) return settings;
    const next = structuredClone(settings);
    for (const card of next.catalog.personal.cards) {
      card.garage = [...card.garage].sort((a, b) => a.slot - b.slot)
        .map((vehicle, index) => ({ ...vehicle, slot: index + 1 }));
    }
    return next;
  }
  const api = { validate, withoutCardNumbers, readBundle, readMasters, masterTypesForFiles, readSelectedMasters, readDailyUpdate, readTimingMasters, masterCardDiffs, mergeMasters, merge, choices, label, roundCourseRows, selectedCard, selectedRound, applyCard, suggestContext, warnings, profiles, cardInfo, updateProfiles, updateOnlineEnabled, updateCardTeam, updateCardSlots, registerCard, registerTeam, registerList, opponentTeams, teamSuggestions, vehicleOptions, vehicleGroups, normalizeStars, formatStars, compactGarages, cleanOpponentLists };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RecordCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
