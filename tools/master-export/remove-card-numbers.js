"use strict";
const fs = require("node:fs");
const C = require("../../record-poc/catalog.js");
const M = require("../../record-poc/model.js");

function clean(data) {
  if (data?.masterType === "CARD_Master") {
    const personal = C.withoutCardNumbers({ personal: data.data }).personal;
    return personal === data.data ? data : { ...data, data: personal };
  }
  if (data?.kind === "dac-personal-settings-design-draft") {
    return C.withoutCardNumbers({ personal: data }).personal;
  }
  if (data?.personal) return C.withoutCardNumbers(data);
  if (data?.settings) return M.withoutCardNumbers(data);
  return data;
}

const paths = process.argv.slice(2);
if (!paths.length) throw new Error("Specify JSON files to update in place. No backups are created.");
let changed = 0;
for (const path of paths) {
  const text = fs.readFileSync(path, "utf8");
  const bom = text.startsWith("\ufeff") ? "\ufeff" : "";
  const data = JSON.parse(text.slice(bom.length));
  const next = clean(data);
  if (next === data) continue;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const output = bom + JSON.stringify(next, null, 2).replace(/\n/g, newline) + newline;
  const temporary = path + ".card-number-removal.tmp";
  let created = false;
  try {
    fs.writeFileSync(temporary, output, { encoding: "utf8", flag: "wx" });
    created = true;
    fs.renameSync(temporary, path);
  } finally {
    if (created && fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  changed++;
}
console.log(`Checked ${paths.length} JSON files; removed card number fields from ${changed} files.`);
