globalThis.ViewerUtils = Object.freeze({
  normalize(s) {
    if (s == null) {
      return "";
    }

    s = String(s).trim();
    s = s.replace(/\u3000/g, " ");
    // Fold ASCII case before widening it, then convert hiragana to katakana.
    s = s.toLowerCase();
    s = s.replace(
      /[A-Za-z0-9]/g,
      ch => String.fromCharCode(ch.charCodeAt(0) + 0xFEE0)
    );
    s = s.replace(
      /[\u3041-\u3096]/g,
      ch => String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );
    s = s.replace(/\s+/g, "");

    return s;
  },

  normalizePlayerName(str) {
    return String(str ?? "")
      .normalize("NFKC");
  },

  fmt(n) {
    return Number(n)
      .toLocaleString();
  },

  getZenkakuLength(str) {
    if (!str) {
      return 0;
    }

    const len =
      str.replace(
        /[^\x00-\x7F]/g,
        "xx"
      ).length;

    return len / 2;
  },

  isMostlyAscii(str) {
    if (!str) {
      return true;
    }

    const asciiCount =
      (str.match(/[\x00-\x7F]/g) || [])
        .length;

    return (
      asciiCount / str.length >= 0.7
    );
  },

  foldToCycle(diff, cycle) {
    const mod =
      diff % cycle;

    const half =
      cycle / 2;

    return (
      mod <= half
    )
      ? mod
      : mod - cycle;
  },

  updateAdjust(prev, value, alpha) {
    return (
      (1 - alpha) * prev +
      alpha * value
    );
  },

  clamp(v, min, max) {
    return Math.max(
      min,
      Math.min(max, v)
    );
  },

  rejectFoldedOutliers(values, maxShiftSec) {
    const limit =
      Number(maxShiftSec);

    if (
      !isFinite(limit) ||
      limit <= 0
    ) {
      return values;
    }

    const filtered =
      values.filter(
        v => Math.abs(v) <= limit
      );

    // Keep the original samples if rejecting all of them would erase the learned data.
    return filtered.length > 0
      ? filtered
      : values;
  }
});

Object.assign(globalThis, {
  normalize: globalThis.ViewerUtils.normalize,
  normalizePlayerName: globalThis.ViewerUtils.normalizePlayerName,
  fmt: globalThis.ViewerUtils.fmt,
  getZenkakuLength: globalThis.ViewerUtils.getZenkakuLength,
  isMostlyAscii: globalThis.ViewerUtils.isMostlyAscii,
  foldToCycle: globalThis.ViewerUtils.foldToCycle,
  updateAdjust: globalThis.ViewerUtils.updateAdjust,
  clamp: globalThis.ViewerUtils.clamp,
  rejectFoldedOutliers: globalThis.ViewerUtils.rejectFoldedOutliers
});

if (typeof module === "object" && module.exports) {
  module.exports = globalThis.ViewerUtils;
}
