(function (root) {
  "use strict";
  const Catalog = typeof module !== "undefined" && module.exports ? require("./catalog.js") : root.RecordCatalog;
  const fields = [
    ["card", "カード"], ["myRank", "自分のランク"], ["myStars", "自分の星"],
    ["opponentRank", "相手のランク"], ["opponentStars", "相手の星"],
    ["opponent", "対戦相手"], ["homeArea", "所属店舗のエリア"],
    ["homeShop", "所属店舗"], ["behavior", "ブレフラ・譲り"],
    ["copiedRate", "勝率：転記"], ["nameNote", "CN追加メモ"], ["note", "追加メモ"],
    ["team", "チーム"], ["teamShop", "チーム所属店舗"],
    ["choice", "選択権あり"], ["random", "ランダム"], ["course", "コース"],
    ["night", "夜"], ["win", "勝敗"], ["car", "自分の車種"], ["opponentCar", "相手の車種"],
    ["battleArea", "対戦店舗のエリア"], ["battleShop", "対戦店舗"],
    ["normalizedName", "相手名：全角化"], ["date", "日付"], ["season", "シーズン"],
    ["round", "ラウンド"]
  ];
  const defaultSettings = {
    cards: [], courses: [], cars: [], teams: [], teamShops: [], seasons: [], rounds: [], shopAliases: {}, shopsByArea: {}
  };
  const recordSearchFields = ["opponent", "homeShop", "team", "nameNote", "note", "homeArea", "battleArea", "battleShop", "teamShop"];
  const searchSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("ja", { granularity: "grapheme" }) : null;
  const normalizeSearch = value => value.normalize("NFKC").toLowerCase();
  const recordSearchParts = record => recordSearchFields.map(key => normalizeSearch(record.values[key]));
  function recordSearchMatches(record, input) {
    const query = normalizeSearch(input);
    return query ? searchMatchRanges(recordSearchParts(record), query) : {};
  }
  function searchMatchRanges(parts, query) {
    const text = parts.join(" ");
    const matches = {};
    let start = text.indexOf(query);
    if (start < 0) return null;
    while (start >= 0) {
      let offset = 0;
      for (let i = 0; i < parts.length; i++) {
        const from = Math.max(start, offset);
        const to = Math.min(start + query.length, offset + parts[i].length);
        if (from < to) (matches[recordSearchFields[i]] ||= []).push([from - offset, to - offset]);
        offset += parts[i].length + 1;
      }
      start = text.indexOf(query, start + 1);
    }
    return matches;
  }
  function opponentNameFilter(name) {
    return name ? record => record.values.opponent === name : () => true;
  }
  function recordHistoryPage(records, input, requestedPage, opponent = "", card = "", date = "") {
    const pageSize = 50;
    const query = normalizeSearch(input);
    const searchRows = query || date ? records.filter(record => (!date || record.values.date === date) &&
      (!query || recordSearchParts(record).join(" ").includes(query))) : records;
    const opponentRows = opponent ? searchRows.filter(opponentNameFilter(opponent)) : searchRows;
    const matching = card ? opponentRows.filter(record => record.values.card === card) : opponentRows;
    const visible = opponent && !matching.length ? searchRows : matching;
    if (visible !== matching) requestedPage = 0;
    const total = visible.length;
    const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    const page = Math.min(Math.max(0, requestedPage), lastPage);
    const end = total - page * pageSize;
    const start = Math.max(0, end - pageSize);
    const rows = visible.slice(start, end).reverse();
    const matches = new Map(query ? rows.map(record => [record, searchMatchRanges(recordSearchParts(record), query)]) : []);
    return { rows, matches, searchRows, page, lastPage, total, firstShown: total ? total - end + 1 : 0, lastShown: total - start };
  }
  function searchHighlightParts(value, ranges) {
    if (!ranges?.length) return [{ text: value, matched: false }];
    const graphemes = searchSegmenter
      ? Array.from(searchSegmenter.segment(value), item => item.segment)
      : value.match(/[^\p{M}\uFF9E\uFF9F][\p{M}\uFF9E\uFF9F]*|[\p{M}\uFF9E\uFF9F]+/gu) || [];
    const result = [];
    let offset = 0;
    for (const text of graphemes) {
      const end = offset + normalizeSearch(text).length;
      const matched = ranges.some(([from, to]) => from < end && to > offset);
      if (result.length && result[result.length - 1].matched === matched) result[result.length - 1].text += text;
      else result.push({ text, matched });
      offset = end;
    }
    return result;
  }
  const prefectures = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
  ];
  function formatWinRate(records) {
    if (!records.length) return "";
    const wins = records.filter(record => record.values.win === "1").length;
    return winRateText(wins, records.length);
  }
  function winRateText(wins, total) {
    return `${Math.round(wins / total * 100)}%（${wins}/${total}）`;
  }
  function formatCourseChoiceRate(records) {
    if (!records.length) return "";
    const choices = records.filter(record => record.values.choice === "1").length;
    return `${Math.round(choices / records.length * 100)}%（${choices}/${records.length}）`;
  }
  function formatCourseResult(records, courseMatch) {
    const choiceRate = formatCourseChoiceRate(records);
    const previous = courseMatch
      ? `${previousOutcome(courseMatch) === "1" ? "前回勝ち" : "前回負け"} ${courseMatch.values.date}`
      : "過去記録なし";
    return choiceRate ? `コース選択率${choiceRate} / ${previous}` : previous;
  }
  function searchText(value) {
    return value.normalize("NFKC").trim().toLowerCase();
  }
  function playerSuggestions(records, query, aliases, excludeId) {
    const needle = searchText(query);
    if (!needle) return [];
    const seen = new Set();
    return [...records].reverse().sort((a, b) => b.values.date.localeCompare(a.values.date) ||
      (b.updatedAt || "").localeCompare(a.updatedAt || "")).filter(record => {
      if (record.id === excludeId || !searchText(record.values.opponent).includes(needle)) return false;
      const key = JSON.stringify([normalizeName(record.values.opponent), shopKey(record.values.homeShop, aliases)]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(record => record.values);
  }
  function applyPlayerCandidate(values, candidate) {
    const retained = new Set(["date", "card", "myRank", "myStars", "season", "round", "win", "nameNote", "note",
      "battleArea", "battleShop", "normalizedName"]);
    return {
      ...values,
      ...Object.fromEntries(fields.filter(([key]) => !retained.has(key)).map(([key]) => [key, candidate[key]])),
      opponentRank: candidate.opponentRank || values.myRank,
      normalizedName: normalizeName(candidate.opponent),
      win: "",
      ...(candidate.battleArea || candidate.battleShop
        ? { battleArea: candidate.battleArea, battleShop: candidate.battleShop } : {})
    };
  }
  function teamSuggestions(records, configured, query, excludeId) {
    const needle = searchText(query);
    if (!needle) return [];
    const seen = new Set();
    return [...records.filter(r => r.id !== excludeId).map(r => r.values.team), ...configured].filter(team => {
      const key = searchText(team);
      if (!key || !key.includes(needle) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function newDraft() {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return {
      id: crypto.randomUUID(), status: "pending",
      values: Object.fromEntries(fields.map(([key]) => [key, key === "date" ? date : ""]))
    };
  }
  function hasMatchDraft(draft, paste = "", playerSearch = "") {
    const session = new Set(["date", "season", "round", "card", "myRank", "myStars", "normalizedName"]);
    return Boolean(paste || playerSearch || fields.some(([key]) =>
      !session.has(key) && draft.values[key] &&
      !(key === "opponentRank" && draft.values[key] === draft.values.myRank)));
  }
  function withCourse(values, course) {
    return values.course === course ? values : { ...values, course, choice: "", night: "", random: "" };
  }
  function summarizeMatches(records, season, round) {
    const groups = new Map();
    for (const { values } of records) {
      if (values.season !== season || values.round !== round) continue;
      const card = values.card || "未入力";
      const date = values.date || "未入力";
      const key = JSON.stringify([card, date]);
      if (!groups.has(key)) groups.set(key, { card, date, wins: 0, total: 0, unknown: 0 });
      const group = groups.get(key);
      group.total++;
      if (values.win === "1") group.wins++;
      else if (values.win !== "0") group.unknown++;
    }
    return [...groups.values()].sort((a, b) => a.card.localeCompare(b.card, "ja") || a.date.localeCompare(b.date));
  }
  function cardNameComparator(cardOrder) {
    const order = new Map(cardOrder.map((name, index) => [name, index]));
    return (a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) ||
      a.localeCompare(b, "ja", { numeric: true });
  }
  function sortCardNames(names, cardOrder) {
    return [...names].sort(cardNameComparator(cardOrder));
  }
  function summarizePivot(records, cardOrder) {
    const seasons = new Map();
    const increment = (group, win) => {
      group.total++;
      if (win === "1") group.wins++;
      else if (win !== "0") group.unknown++;
    };
    const group = name => ({ name, wins: 0, total: 0, unknown: 0 });
    const get = (map, name, create) => {
      if (!map.has(name)) map.set(name, create(name));
      return map.get(name);
    };
    for (const { values } of records) {
      const season = get(seasons, values.season, name => ({ ...group(name), rounds: new Map() }));
      const round = get(season.rounds, values.round, name => ({ ...group(name), cards: new Map(), days: new Map() }));
      const card = get(round.cards, values.card, group);
      const day = get(round.days, values.date, name => ({ ...group(name), cards: new Map() }));
      const dayCard = get(day.cards, values.card, group);
      for (const item of [season, round, card, day, dayCard]) increment(item, values.win);
    }
    const byName = (a, b) => a.name.localeCompare(b.name, "ja", { numeric: true });
    const compareCardNames = cardNameComparator(cardOrder);
    const byCard = (a, b) => compareCardNames(a.name, b.name);
    const roundNumber = name => {
      const normalized = name.normalize("NFKC").trim();
      if (normalized === "オープン") return 1.5;
      const ordinal = /^(\d+)(?:st|nd|rd|th)$/i.exec(normalized);
      return ordinal ? Number(ordinal[1]) : Infinity;
    };
    const byRound = (a, b) => roundNumber(a.name) - roundNumber(b.name) || byName(a, b);
    return [...seasons.values()].sort(byName).map(season => ({
      ...season,
      rounds: [...season.rounds.values()].sort(byRound).map(round => ({
        ...round,
        cards: [...round.cards.values()].sort(byCard),
        days: [...round.days.values()].sort(byName).map(day => ({
          ...day, cards: [...day.cards.values()].sort(byCard)
        }))
      }))
    }));
  }
  function opponentIdentity(values, aliases) {
    return [normalizeName(values.opponent.trim()), shopKey(values.homeShop, aliases)];
  }
  function hasCurrentOpponentTime(record, aliases = {}) {
    return record.opponentConfirmedAt !== undefined &&
      (record.opponentTimeMode === "input" || record.opponentConfirmedIdentity === undefined ||
        JSON.stringify(record.opponentConfirmedIdentity) === JSON.stringify(opponentIdentity(record.values, aliases)));
  }
  function captureOpponentTime(draft, values, aliases, now = new Date()) {
    const identity = opponentIdentity(values, aliases);
    if (!identity[0]) throw new Error("対戦時刻を記録するには相手名が必要です。");
    if (draft.opponentConfirmedAt && (draft.opponentTimeMode === "input" ||
        JSON.stringify(draft.opponentConfirmedIdentity) === JSON.stringify(identity))) {
      return { ...draft, values };
    }
    if (Number.isNaN(now.getTime())) throw new Error("端末の日時が不正です。");
    const pad = value => String(value).padStart(2, "0");
    const offset = -now.getTimezoneOffset();
    const at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
      `${offset < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
    return { ...draft, values, opponentConfirmedAt: at, opponentConfirmedIdentity: identity };
  }
  function startOpponentTime(draft, values, aliases, now = new Date()) {
    if (!values.opponent.trim()) return { ...draft, values };
    const next = captureOpponentTime(draft, values, aliases, now);
    return { ...next, opponentTimeMode: "input" };
  }
  function validateOpponentTime(record) {
    if (record.opponentTimeMode !== undefined && (record.opponentTimeMode !== "input" || !record.opponentConfirmedAt)) {
      throw new Error("対戦時刻の取得方法が不正です。");
    }
    if (record.opponentConfirmedAt !== undefined) {
      const at = record.opponentConfirmedAt;
      const match = typeof at === "string" &&
        /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-](\d{2}):(\d{2}))$/.exec(at);
      if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 ||
          Number(match[6] || 0) > 14 || Number(match[7] || 0) > 59 ||
          (Number(match[6]) === 14 && Number(match[7]) !== 0) || Number.isNaN(Date.parse(at))) {
        throw new Error("対戦時刻の形式が不正です。");
      }
      normalizeCsvDate(match[1], "対戦時刻");
    }
    if (record.opponentConfirmedIdentity !== undefined &&
        (!record.opponentConfirmedAt || !Array.isArray(record.opponentConfirmedIdentity) ||
          record.opponentConfirmedIdentity.length !== 2 ||
          record.opponentConfirmedIdentity.some(value => typeof value !== "string"))) {
      throw new Error("対戦時刻の相手情報が不正です。");
    }
  }
  function matchDateTime(record, aliases = {}) {
    validateOpponentTime(record);
    const date = normalizeCsvDate(record.values.date, "対戦");
    return hasCurrentOpponentTime(record, aliases) && record.opponentConfirmedAt.slice(0, 10) === date
      ? `${date} ${record.opponentConfirmedAt.slice(11, 19)}` : date;
  }
  function normalizeName(value) {
    return value.normalize("NFKC").replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0))
      .replace(/ /g, "\u3000");
  }
  function shopKey(shop, aliases) {
    let key = shop.trim();
    const seen = new Set();
    while (Object.hasOwn(aliases, key)) {
      if (seen.has(key)) throw new Error("店舗別名に循環があります。");
      seen.add(key);
      key = aliases[key].trim();
    }
    return key;
  }
  function parsePaste(text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    while (lines.length && !lines[0].trim()) lines.shift();
    if (lines.length !== 1) throw new Error("PoCでは1人分（1行）ずつ貼り付けてください。");
    const cells = lines[0].split("\t");
    if (cells.length !== 4 || !cells[1].trim()) {
      throw new Error("Viewerの4列（星・名前・エリア・所属店）を貼り付けてください。");
    }
    return Object.fromEntries(["opponentStars", "opponent", "homeArea", "homeShop"].map((key, i) => [key, cells[i]]));
  }
  function applyPaste(values, text) {
    const pasted = parsePaste(text);
    return {
      ...values, ...pasted,
      normalizedName: normalizeName(pasted.opponent),
      battleArea: values.battleArea || pasted.homeArea
    };
  }
  function applyUnknownPlayer(values, name) {
    const retained = new Set(["date", "card", "myRank", "myStars", "season", "round"]);
    return {
      ...Object.fromEntries(fields.map(([key]) => [key, retained.has(key) ? values[key] : ""])),
      opponentRank: values.myRank,
      opponent: name.trim(),
      normalizedName: normalizeName(name.trim())
    };
  }
  function syncDefaultOpponentRank(values, previousRank) {
    if (values.opponent || (values.opponentRank && values.opponentRank !== previousRank)) return values;
    return { ...values, opponentRank: values.myRank };
  }
  function applyPasteWithHistory(values, text, records, aliases, excludeId) {
    const pasted = applyPaste(applyUnknownPlayer(values, ""), text);
    const candidates = playerSuggestions(records, pasted.opponent, aliases, excludeId).filter(candidate =>
      normalizeName(candidate.opponent) === normalizeName(pasted.opponent) &&
      pasted.homeShop.trim() && shopKey(candidate.homeShop, aliases) === shopKey(pasted.homeShop, aliases));
    if (candidates.length !== 1) return { values: { ...pasted, win: "" }, matched: false };
    return {
      values: { ...applyPlayerCandidate(pasted, candidates[0]), ...parsePaste(text),
        normalizedName: normalizeName(pasted.opponent) },
      matched: true
    };
  }
  function validateSettings(settings) {
    if (!settings || typeof settings !== "object") throw new Error("設定が不正です。");
    if (settings.theme !== undefined && !["light", "dark"].includes(settings.theme)) throw new Error("画面配色が不正です。");
    if (settings.catalog !== undefined) Catalog.validate(settings.catalog);
    for (const key of ["cards", "courses", "cars", "teams", "rounds"]) {
      if (!Array.isArray(settings[key]) || settings[key].some(v => typeof v !== "string")) {
        throw new Error(`${key} は文字列の配列にしてください。`);
      }
      for (const key of ["teamShops", "seasons"]) {
        if (settings[key] !== undefined && (!Array.isArray(settings[key]) ||
            settings[key].some(value => typeof value !== "string"))) {
          throw new Error(`${key} は文字列の配列にしてください。`);
        }
      }
    }
    const aliases = settings.shopAliases;
    if (!aliases || Array.isArray(aliases) || typeof aliases !== "object" ||
        Object.values(aliases).some(v => typeof v !== "string" || !v.trim())) {
      throw new Error("shopAliases は旧店舗名と正式店舗名の対応表にしてください。");
    }
    for (const key of Object.keys(aliases)) shopKey(key, aliases);
    if (settings.shopsByArea !== undefined && (!settings.shopsByArea ||
        typeof settings.shopsByArea !== "object" || Array.isArray(settings.shopsByArea) ||
        Object.entries(settings.shopsByArea).some(([area, shops]) => !area.trim() ||
          !Array.isArray(shops) || shops.some(shop => typeof shop !== "string" || !shop.trim())))) {
      throw new Error("shopsByArea はエリア名と店舗名配列の対応表にしてください。");
    }
  }
  function validateDraft(draft) {
    if (!draft || typeof draft.id !== "string" || !draft.id ||
        !["pending", "confirmed"].includes(draft.status) || !draft.values ||
        fields.some(([key]) => typeof draft.values[key] !== "string")) {
      throw new Error("対戦データの形式が不正です。");
    }
    if (draft.temporaryNo !== undefined) parseTemporaryNo(draft.temporaryNo);
    validateOpponentTime(draft);
  }
  function validateRecord(record) {
    validateDraft(record);
    if (!record.values.opponent.trim() || !record.values.date) throw new Error("名前・日付が必要です。");
    if (record.temporaryNo !== undefined) parseTemporaryNo(record.temporaryNo);
    if (record.excelHistory !== undefined) {
      const history = record.excelHistory;
      if (!record.id.startsWith("excel-datano:") || !history || typeof history !== "object" || Array.isArray(history) ||
          !Number.isSafeInteger(history.sourceRow) || history.sourceRow < 10 ||
          (history.snapshotId !== undefined && (typeof history.snapshotId !== "string" || !history.snapshotId))) {
        throw new Error("Excel過去実績の基準行が不正です。");
      }
      for (const [total, wins] of [["matches", "wins"], ["courseMatches", "courseWins"]]) {
        if (!(history[total] === null && history[wins] === null) &&
            (!Number.isSafeInteger(history[total]) || !Number.isSafeInteger(history[wins]) ||
             history[total] < 0 || history[wins] < 0 || history[wins] > history[total])) {
          throw new Error("Excel過去実績の勝数・戦数が不正です。");
        }
      }
    }
  }
  function parseTemporaryNo(value) {
    const match = typeof value === "string" && /^(\d{8}-[\s\S]+-)(\d{3})$/.exec(value);
    if (!match || match[2] === "000") throw new Error("仮No.の形式が不正です。");
    const date = match[1].slice(0, 8);
    normalizeCsvDate(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, "仮No.");
    return { prefix: match[1], sequence: Number(match[2]) };
  }
  function temporaryNoIndex(records) {
    const numbers = new Map();
    records.forEach((record, index) => {
      if (record.temporaryNo === undefined) return;
      parseTemporaryNo(record.temporaryNo);
      if (numbers.has(record.temporaryNo)) throw new Error(`仮No. ${record.temporaryNo} が重複しています。`);
      numbers.set(record.temporaryNo, index);
    });
    return numbers;
  }
  function mergeTemporaryCounters(records, ...sources) {
    const result = {};
    for (const source of sources) {
      if (source === undefined) continue;
      if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("仮No.の採番情報が不正です。");
      for (const [prefix, sequence] of Object.entries(source)) {
        parseTemporaryNo(`${prefix}001`);
        if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) throw new Error("仮No.の採番情報が不正です。");
        result[prefix] = Math.max(result[prefix] || 0, sequence);
      }
    }
    for (const record of records) {
      if (record.temporaryNo === undefined) continue;
      const { prefix, sequence } = parseTemporaryNo(record.temporaryNo);
      result[prefix] = Math.max(result[prefix] || 0, sequence);
    }
    return result;
  }
  function nextTemporaryNo(records, counters, values) {
    temporaryNoIndex(records);
    const date = normalizeCsvDate(values.date, "対戦");
    if (typeof values.card !== "string" || !values.card.trim()) throw new Error("仮No.を付けるためカードを選択してください。");
    const prefix = `${date.replace(/-/g, "")}-${values.card}-`;
    const next = mergeTemporaryCounters(records, counters);
    const sequence = (next[prefix] || 0) + 1;
    if (sequence > 999) throw new Error("この日付・カードの仮No.は999件に達しました。");
    next[prefix] = sequence;
    return { temporaryNo: `${prefix}${String(sequence).padStart(3, "0")}`, counters: next };
  }
  function withoutCardNumbers(data) {
    const catalog = Catalog.withoutCardNumbers(data.settings?.catalog);
    let ownCard = data.settingsDraft?.ownCard;
    if (ownCard) {
      let parsed;
      try { parsed = JSON.parse(ownCard); }
      catch { throw new Error("旧カード編集下書きのJSONが不正なため、カード番号を除去できません。"); }
      if (parsed && typeof parsed === "object" && Object.hasOwn(parsed, "number")) {
        delete parsed.number;
        ownCard = JSON.stringify(parsed);
      }
    }
    if (catalog === data.settings?.catalog && ownCard === data.settingsDraft?.ownCard) return data;
    const next = { ...data, settings: { ...data.settings, catalog } };
    if (ownCard !== data.settingsDraft?.ownCard) next.settingsDraft = { ...data.settingsDraft, ownCard };
    return next;
  }
  function validateBackup(data) {
    if (!data || data.schema !== 1 || !Array.isArray(data.records)) throw new Error("対応していないバックアップです。");
    validateDraft(data.draft);
    validateSettings(data.settings);
    if (data.settingsDraft !== undefined && (data.settingsDraft === null ||
        typeof data.settingsDraft !== "object" || Array.isArray(data.settingsDraft) ||
        Object.entries(data.settingsDraft).some(([key, value]) =>
          !["cards", "courses", "cars", "teams", "teamShops", "seasons", "rounds", "aliases", "shopsByArea", "cardProfiles", "ownCard", "ownTeam"].includes(key) || typeof value !== "string"))) {
      throw new Error("設定の下書きが不正です。");
    }
    const ids = new Set();
    for (const record of data.records) {
      validateRecord(record);
      if (ids.has(record.id)) throw new Error("対戦IDが重複しています。");
      ids.add(record.id);
    }
    temporaryNoIndex(data.records);
    mergeTemporaryCounters(data.records, data.temporaryNoCounters);
    return withoutCardNumbers(data);
  }
  function findHistory(records, values, aliases, excludeId) {
    if (!values.opponent.trim() || !values.homeShop.trim()) return [];
    const name = normalizeName(values.opponent);
    const shop = shopKey(values.homeShop, aliases);
    return [...records].reverse().filter(r => r.id !== excludeId && normalizeName(r.values.opponent) === name &&
      shopKey(r.values.homeShop, aliases) === shop).sort((a, b) =>
      b.values.date.localeCompare(a.values.date) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }
  function excelHistoryStats(records, values, aliases, excludeId, matches = findHistory(records, values, aliases, excludeId)) {
    const official = matches.filter(record => record.id.startsWith("excel-datano:"));
    const local = matches.filter(record => !record.id.startsWith("excel-datano:"));
    const localStats = { matches: local.length, wins: local.filter(record => record.values.win === "1").length,
      unknown: local.filter(record => !["0", "1"].includes(record.values.win)).length };
    if (!values.opponent.trim() || !values.homeShop.trim()) return { reason: "相手名と所属店を選択してください", local: localStats };
    if (!official.length) return { reason: "Excel基準の履歴なし", local: localStats };
    if (official.some(record => record.values.homeShop.trim() !== values.homeShop.trim())) {
      return { reason: "店舗別名の照合はExcelと異なるため確認が必要です", local: localStats };
    }
    if (official.some(record => !record.excelHistory)) {
      return { reason: "Excel基準値を含む04マスターが必要です", local: localStats };
    }
    if (!official[0].excelHistory.snapshotId ||
        official.some(record => record.excelHistory.snapshotId !== official[0].excelHistory.snapshotId) ||
        new Set(official.map(record => record.excelHistory.sourceRow)).size !== official.length) {
      return { reason: "異なるExcel基準の履歴が混在しているため確認が必要です", local: localStats };
    }
    const latest = rows => rows.reduce((a, b) => !a || b.excelHistory.sourceRow > a.excelHistory.sourceRow ? b : a, null);
    const count = (record, total, wins) => {
      if (!record || record.excelHistory[total] === null || !["0", "1"].includes(record.values.win)) return null;
      return { matches: record.excelHistory[total] + 1,
        wins: record.excelHistory[wins] + (record.values.win === "1" ? 1 : 0), id: record.id };
    };
    const total = count(latest(official), "matches", "wins");
    const course = values.course ? count(latest(official.filter(record => record.values.course === values.course)),
      "courseMatches", "courseWins") : null;
    return { total, course, reason: total ? "" : "Excel基準値が空欄または勝敗不明です", local: localStats };
  }
  function missingExcelBaselines(records) {
    return records.filter(record => !record.excelHistory || record.excelHistory.matches === null).length;
  }
  function winRateColor(wins, matches) {
    if (!Number.isSafeInteger(wins) || !Number.isSafeInteger(matches) || matches <= 0 || wins < 0 || wins > matches) return null;
    const stops = [[0.4, [255, 255, 0]], [0.6, [51, 153, 255]], [0.9, [216, 131, 255]]];
    const rate = wins / matches;
    const upper = stops.findIndex(([position]) => rate <= position);
    let rgb;
    if (upper <= 0) rgb = stops[upper === -1 ? stops.length - 1 : 0][1];
    else {
      const [x0, a] = stops[upper - 1], [x1, b] = stops[upper];
      const ratio = (rate - x0) / (x1 - x0);
      rgb = a.map((value, i) => Math.round(value + (b[i] - value) * ratio));
    }
    const linear = rgb.map(value => {
      const component = value / 255;
      return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    return { background: `rgb(${rgb.join(", ")})`, foreground: luminance > 0.179 ? "#000000" : "#ffffff" };
  }
  function opponentWinRates(records, aliases, visible = records) {
    const keyOf = ({ values }) => JSON.stringify([normalizeName(values.opponent), shopKey(values.homeShop, aliases)]);
    const groups = new Map(), rates = new Map(), rowKeys = new Map();
    for (const record of visible) {
      if (!record.values.opponent.trim() || !record.values.homeShop.trim()) continue;
      const key = keyOf(record);
      if (!groups.has(key)) groups.set(key, { wins: 0, total: 0 });
      rowKeys.set(record, key);
    }
    if (!groups.size) return rates;
    for (const record of records) {
      const group = groups.get(rowKeys.get(record) ?? keyOf(record));
      if (!group) continue;
      group.total++;
      if (record.values.win === "1") group.wins++;
    }
    for (const [record, key] of rowKeys) {
      const { wins, total } = groups.get(key);
      if (total) rates.set(record, winRateText(wins, total));
    }
    return rates;
  }
  function upsert(records, record) {
    validateRecord(record);
    const result = [...records.filter(r => r.id !== record.id), record];
    temporaryNoIndex(result);
    return result;
  }
  function editAppRecord(records, id, values, updatedAt) {
    const index = records.findIndex(record => record.id === id);
    if (index < 0) throw new Error("修正対象の記録が見つかりません。");
    const original = records[index];
    if (original.id.startsWith("excel-datano:")) throw new Error("Excel由来の正式記録は修正できません。");
    const nextValues = { ...original.values, ...values };
    if (nextValues.opponent !== original.values.opponent) {
      nextValues.normalizedName = normalizeName(nextValues.opponent);
    }
    const edited = { ...original, values: nextValues, updatedAt };
    validateRecord(edited);
    normalizeCsvDate(edited.values.date, "対戦");
    const result = records.slice();
    result[index] = edited;
    return result;
  }
  function previousCourseMatch(records, values, aliases, excludeId) {
    if (!values.course.trim()) return undefined;
    return findHistory(records, values, aliases, excludeId)
      .find(record => searchText(record.values.course) === searchText(values.course));
  }
  function previousOutcome(record) {
    return record ? (record.values.win === "1" ? "1" : "0") : undefined;
  }
  function mergeHistory(records, data) {
    if (!data || data.schema !== 1 || !Array.isArray(data.records)) throw new Error("過去記録JSONの形式が不正です。");
    const ids = new Set(records.map(record => record.id));
    const added = [];
    for (const record of data.records) {
      validateRecord(record);
      if (!ids.has(record.id)) {
        added.push(record);
        ids.add(record.id);
      }
    }
    const result = [...records, ...added];
    temporaryNoIndex(result);
    return result;
  }
  function replaceHistory(records, data) {
    if (!data || data.schema !== 1 || data.masterType !== "OPPONENT_Master" ||
        !Array.isArray(data.records)) throw new Error("対戦履歴マスターの形式が不正です。");
    temporaryNoIndex(records);
    const incoming = structuredClone(data.records);
    const ids = new Set();
    const sourceRows = new Set();
    const snapshotId = crypto.randomUUID();
    for (const record of incoming) {
      validateRecord(record);
      if (!/^excel-datano:\d+$/.test(record.id)) throw new Error("対戦履歴マスターには正式なData_No.が必要です。");
      if (ids.has(record.id)) throw new Error("対戦履歴マスターのData_No.が重複しています。");
      ids.add(record.id);
      if (record.excelHistory) {
        if (sourceRows.has(record.excelHistory.sourceRow)) throw new Error("Excel過去実績の基準行が重複しています。");
        sourceRows.add(record.excelHistory.sourceRow);
        record.excelHistory.snapshotId = snapshotId;
      }
    }
    const numbers = temporaryNoIndex(incoming);
    const local = records.filter(record => !record.id.startsWith("excel-datano:"));
    const kept = local.filter(record => !record.temporaryNo || !numbers.has(record.temporaryNo));
    const previous = new Map(records.filter(record => record.id.startsWith("excel-datano:"))
      .map(record => [record.id, record]));
    const result = [...incoming, ...kept];
    temporaryNoIndex(result);
    const historyValues = history => history && [history.sourceRow, history.matches, history.wins, history.courseMatches, history.courseWins];
    const changed = (a, b) => JSON.stringify(a.values) !== JSON.stringify(b.values) ||
      a.temporaryNo !== b.temporaryNo || a.opponentConfirmedAt !== b.opponentConfirmedAt ||
      JSON.stringify(historyValues(a.excelHistory)) !== JSON.stringify(historyValues(b.excelHistory));
    return {
      records: result,
      added: incoming.filter(record => !previous.has(record.id)).length,
      updated: incoming.filter(record => previous.has(record.id) && changed(previous.get(record.id), record)).length,
      removed: [...previous.keys()].filter(id => !ids.has(id)).length,
      finalized: local.length - kept.length,
      retained: kept.length
    };
  }
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = [];
    let row = [], cell = "", quoted = false, afterQuote = false;
    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      if (quoted) {
        if (character === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else { quoted = false; afterQuote = true; }
        } else if (character === "\r" && text[i + 1] === "\n") { cell += "\n"; i++; }
        else cell += character;
      } else if (afterQuote) {
        if (character === ",") { row.push(cell); cell = ""; afterQuote = false; }
        else if (character === "\r" || character === "\n") {
          row.push(cell);
          if (row.some(value => value !== "")) rows.push(row);
          row = [];
          cell = "";
          afterQuote = false;
          if (character === "\r" && text[i + 1] === "\n") i++;
        } else throw new Error("CSVの閉じ引用符の後に不正な文字があります。");
      } else if (character === '"' && !cell) quoted = true;
      else if (character === '"') throw new Error("CSVの引用符の位置が不正です。");
      else if (character === ",") { row.push(cell); cell = ""; }
      else if (character === "\r" || character === "\n") {
        row.push(cell);
        if (row.some(value => value !== "")) rows.push(row);
        row = [];
        cell = "";
        if (character === "\r" && text[i + 1] === "\n") i++;
      } else cell += character;
    }
    if (quoted) throw new Error("CSVの引用符が閉じられていません。");
    if (cell || row.length) {
      row.push(cell);
      if (row.some(value => value !== "")) rows.push(row);
    }
    return rows;
  }
  function normalizeCsvDate(value, rowNumber) {
    const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
    if (!match) throw new Error(`${rowNumber}行目：日付はYYYY-MM-DDまたはYYYY/MM/DDで指定してください。`);
    const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error(`${rowNumber}行目：実在する日付を指定してください。`);
    }
    return date;
  }
  const importCsvHeader = ["format_version", "record_id", "status", ...fields.map(([key]) => key)];
  const temporaryNoColumn = "temporary_no";
  const opponentTimeColumn = "opponent_confirmed_at";
  function mergeImportCsv(records, text) {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error("CSVにヘッダー行がありません。");
    const header = rows[0];
    if (new Set(header).size !== header.length ||
        importCsvHeader.some(key => !header.includes(key)) ||
        header.some(key => ![...importCsvHeader, temporaryNoColumn, opponentTimeColumn].includes(key))) {
      throw new Error("集計後CSV v1のヘッダーが不正です。指定テンプレートを使用してください。");
    }
    const indexes = Object.fromEntries([...importCsvHeader, temporaryNoColumn, opponentTimeColumn].map(key => [key, header.indexOf(key)]));
    const result = [...records];
    const byId = new Map(result.map((record, index) => [record.id, index]));
    const byTemporaryNo = temporaryNoIndex(result);
    const seen = new Set();
    const seenTemporaryNos = new Set();
    let added = 0, updated = 0;
    let skipped = 0;
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      const rowNumber = i + 1;
      if (cells.length !== header.length) throw new Error(`${rowNumber}行目：列数がヘッダーと一致しません。`);
      if (cells[indexes.format_version] !== "1") throw new Error(`${rowNumber}行目：未対応のCSV形式バージョンです。`);
      const id = decodeImportCsvValue(cells[indexes.record_id]);
      if (!id.trim()) throw new Error(`${rowNumber}行目：record_idは必須です。`);
      if (seen.has(id)) throw new Error(`${rowNumber}行目：record_id「${id}」がCSV内で重複しています。`);
      seen.add(id);
      const status = decodeImportCsvValue(cells[indexes.status]);
      if (!["pending", "confirmed"].includes(status)) throw new Error(`${rowNumber}行目：statusはpendingまたはconfirmedにしてください。`);
      const values = Object.fromEntries(fields.map(([key]) => [key, cells[indexes[key]]]));
      for (const key of ["choice", "random", "night", "win"]) {
        if (values[key] && !["1", "0"].includes(values[key])) {
          throw new Error(`${rowNumber}行目：${key}は1、0、空欄のいずれかにしてください。`);
        }
      }
      for (const key of Object.keys(values)) values[key] = decodeImportCsvValue(values[key]);
      values.date = normalizeCsvDate(values.date, rowNumber);
      if (!values.normalizedName) values.normalizedName = normalizeName(values.opponent);
      const now = new Date().toISOString();
      const record = { id, status, values, createdAt: now, updatedAt: now };
      if (indexes[opponentTimeColumn] >= 0) {
        const at = decodeImportCsvValue(cells[indexes[opponentTimeColumn]]);
        if (at) record.opponentConfirmedAt = at;
      }
      if (indexes[temporaryNoColumn] >= 0) {
        const temporaryNo = decodeImportCsvValue(cells[indexes[temporaryNoColumn]]);
        if (temporaryNo) record.temporaryNo = temporaryNo;
      }
      validateRecord(record);
      if (record.temporaryNo && seenTemporaryNos.has(record.temporaryNo)) {
        throw new Error(`${rowNumber}行目：仮No. ${record.temporaryNo} がCSV内で重複しています。`);
      }
      if (record.temporaryNo) seenTemporaryNos.add(record.temporaryNo);
      if (record.temporaryNo && byTemporaryNo.has(record.temporaryNo) &&
          byId.get(id) !== byTemporaryNo.get(record.temporaryNo)) {
        throw new Error(`${rowNumber}行目：仮No. ${record.temporaryNo} は別のrecord_idに使用されています。照合方法を確認してください。`);
      }
      if (byId.has(id)) {
        const index = byId.get(id);
        const current = result[index];
        if (normalizeName(current.values.opponent) !== normalizeName(record.values.opponent) ||
            current.values.date !== record.values.date) {
          throw new Error(`${rowNumber}行目：record_id「${id}」が既存記録と異なる対戦を指しています。`);
        }
        const merged = mergeMissingValues(current, record);
        if (merged.record.temporaryNo) byTemporaryNo.set(merged.record.temporaryNo, index);
        if (merged.changed) {
          result[index] = merged.record;
          updated++;
        } else skipped++;
        continue;
      }
      const matches = result.map((current, index) => ({ current, index }))
        .filter(({ current }) => !(current.id.startsWith("excel-datano:") && record.id.startsWith("excel-datano:")) &&
          sameLegacyMatch(current, record));
      if (matches.some(({ current }) => current.temporaryNo || record.temporaryNo)) {
        throw new Error(`${rowNumber}行目：仮No.付き記録と一致する可能性がありますが、正式Data_No.との照合方法は未確定です。`);
      }
      if (matches.length > 1) {
        throw new Error(`${rowNumber}行目：同じ日付・相手・対戦内容の既存記録が複数あり、自動照合できません。record_idを確認してください。`);
      }
      if (matches.length === 1) {
        const { current, index } = matches[0];
        const merged = mergeMissingValues(current, record);
        if (merged.record.temporaryNo) byTemporaryNo.set(merged.record.temporaryNo, index);
        if (merged.changed) {
          result[index] = merged.record;
          updated++;
        } else skipped++;
        continue;
      }
      byId.set(id, result.length);
      if (record.temporaryNo) byTemporaryNo.set(record.temporaryNo, result.length);
      result.push(record);
      added++;
    }
    return { records: result, added, updated, skipped };
  }
  function sameLegacyMatch(current, incoming) {
    const first = current.values, second = incoming.values;
    if (!first.date || first.date !== second.date || !first.opponent ||
        searchText(first.opponent) !== searchText(second.opponent)) return false;
    if (current.opponentConfirmedAt && incoming.opponentConfirmedAt &&
        Date.parse(current.opponentConfirmedAt) !== Date.parse(incoming.opponentConfirmedAt)) return false;
    return ["homeShop", "course", "car", "opponentCar"].every(key =>
      !first[key] || !second[key] || searchText(first[key]) === searchText(second[key]));
  }
  function mergeMissingValues(current, incoming) {
    const merged = structuredClone(current);
    let changed = false;
    if (incoming.temporaryNo && merged.temporaryNo && incoming.temporaryNo !== merged.temporaryNo) {
      throw new Error("同じ対戦の仮No.が一致しません。");
    }
    if (incoming.temporaryNo && !merged.temporaryNo) {
      merged.temporaryNo = incoming.temporaryNo;
      changed = true;
    }
    if (incoming.opponentConfirmedAt && !merged.opponentConfirmedAt) {
      merged.opponentConfirmedAt = incoming.opponentConfirmedAt;
      changed = true;
    }
    for (const [key] of fields) {
      if (!merged.values[key] && incoming.values[key]) {
        merged.values[key] = incoming.values[key];
        changed = true;
      }
    }
    if (merged.status === "pending" && incoming.status === "confirmed" &&
        merged.values.homeShop.trim() && ["1", "0"].includes(merged.values.win)) {
      merged.status = "confirmed";
      changed = true;
    }
    if (changed) merged.updatedAt = new Date().toISOString();
    return { record: merged, changed };
  }
  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  }
  function toCardSlotsCsv(card) {
    const rows = [1, 2, 3].map(slot => card.activeSlots.find(item => item.slot === slot)?.label || "未登録");
    return "\ufeff" + rows.map(csvCell).join("\r\n") + "\r\n";
  }
  function toCsv(records) {
    const rows = [
      ["対戦ID", "状態", ...fields.map(([, label]) => label), "作成日時", "更新日時"],
      ...records.map(r => [r.id, r.status, ...fields.map(([key]) => r.values[key]), r.createdAt, r.updatedAt])
    ];
    return "\ufeff" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }
  function toImportCsv(records) {
    temporaryNoIndex(records);
    for (const record of records) validateRecord(record);
    const rows = [[...importCsvHeader, temporaryNoColumn, opponentTimeColumn], ...records.map(record => ["1", record.id, record.status,
      ...fields.map(([key]) => normalizeImportValue(key, record.values[key])), record.temporaryNo || "", record.opponentConfirmedAt || ""])];
    return "\ufeff" + rows.map(row => row.map(importCsvCell).join(",")).join("\r\n") + "\r\n";
  }
  function toExcelCsv(records) {
    temporaryNoIndex(records);
    const rows = [[
      "カード：入力", "ランク-自分：入力", "星-自分：入力", "ランク：相手", "星：相手",
      "対戦相手", "都道府県：所属店舗", "所属店", "ブレフラ・譲り", "CN追加メモ",
      "追加メモ", "チーム", "チーム所属", "選択権あり=1", "ランダム", "コース", "夜",
      "勝=1", "車種", "車種：相手", "都道府県：対戦店舗", "対戦店舗", "対戦相手：全角化",
      "仮No.", "日付：入力"
    ], ...records.map((record, index) => {
      validateRecord(record);
      const v = record.values;
      const flag = (key, mark) => {
        const value = v[key];
        if (!["", "0", "1", mark].includes(value)) throw new Error(`${index + 2}行目：${key}の値が不正です。`);
        return value === "1" || value === mark ? mark : "";
      };
      return [
        v.card, v.myRank, v.myStars, v.opponentRank, v.opponentStars, v.opponent, v.homeArea,
        v.homeShop, v.behavior, v.nameNote, v.note, v.team, v.teamShop, flag("choice", "1"),
        flag("random", "R"), v.course, flag("night", "夜"), flag("win", "1"), v.car,
        v.opponentCar, v.battleArea, v.battleShop, normalizeName(v.opponent),
        record.temporaryNo || "", matchDateTime(record).replace(/-/g, "/")
      ];
    })];
    // Column I contains numeric behavior codes, including negative integers.
    return "\ufeff" + rows.map(row => row.map((value, column) =>
      column === 8 && /^-\d+$/.test(value) ? `"${value}"` : csvCell(value)
    ).join(",")).join("\r\n") + "\r\n";
  }
  function normalizeImportValue(key, value) {
    if ((key === "random" && value === "R") || (key === "night" && value === "夜")) return "1";
    return value;
  }
  function importCsvCell(value) {
    let text = String(value ?? "");
    const leading = /^\s*/.exec(text)[0];
    const remainder = text.slice(leading.length);
    if (/^[=+\-@]/.test(remainder)) text = `${leading}'${remainder}`;
    else if (/^'[=+\-@]/.test(remainder)) text = `${leading}'${remainder}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
  function decodeImportCsvValue(value) {
    if (/^\s*''(?=[=+\-@])/.test(value)) return value.replace(/^(\s*)''/, "$1'");
    if (/^\s*'(?=[=+\-@])/.test(value)) return value.replace(/^(\s*)'/, "$1");
    return value;
  }
  const api = { fields, defaultSettings, prefectures, recordSearchMatches, recordHistoryPage, opponentNameFilter, searchHighlightParts, formatWinRate, opponentWinRates, excelHistoryStats, missingExcelBaselines, winRateColor, formatCourseChoiceRate, formatCourseResult, playerSuggestions, applyPlayerCandidate, applyUnknownPlayer, syncDefaultOpponentRank, teamSuggestions, newDraft, hasMatchDraft, withCourse, summarizeMatches, summarizePivot, sortCardNames, startOpponentTime, captureOpponentTime, hasCurrentOpponentTime, matchDateTime, normalizeName, shopKey, parsePaste, applyPaste, applyPasteWithHistory, mergeTemporaryCounters, nextTemporaryNo,
    validateSettings, validateDraft, validateRecord, validateBackup, withoutCardNumbers, findHistory, previousCourseMatch, previousOutcome, upsert, editAppRecord, mergeHistory, replaceHistory, toCsv, toImportCsv, toExcelCsv, toCardSlotsCsv, mergeImportCsv };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RecordModel = api;
})(globalThis);
