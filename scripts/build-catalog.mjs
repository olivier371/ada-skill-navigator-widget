// Haalt de actieve ADA-catalogus uit Airtable en schrijft docs/catalog.json
// voor de widget. Draait dagelijks via .github/workflows/update-catalog.yml.
// Nodig: env AIRTABLE_TOKEN (Personal Access Token, scope data.records:read).
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const BASE = "apprFBMEVPG6yeee0";
const PRODUCTS_TABLE = "tblkky5HA9VORtyBj";
const SKILLS_TABLE = "tblppoPZ2kQVm1Ipr";
const OUT = new URL("../docs/catalog.json", import.meta.url);
const TOKEN = process.env.AIRTABLE_TOKEN;

if (!TOKEN) {
  console.error("AIRTABLE_TOKEN ontbreekt.");
  process.exit(1);
}

async function fetchAll(table, filterByFormula, fields) {
  let records = [], offset;
  do {
    const p = new URLSearchParams({ pageSize: "100", filterByFormula });
    fields.forEach((f) => p.append("fields[]", f));
    if (offset) p.set("offset", offset);
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${table}?${p}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`Airtable ${table}: HTTP ${res.status} ${await res.text()}`);
    const data = await res.json();
    records = records.concat(data.records || []);
    offset = data.offset;
  } while (offset);
  return records;
}

const stripHtml = (h) =>
  String(h || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const [productRecs, skillRecs] = await Promise.all([
  fetchAll(PRODUCTS_TABLE, "AND({Published}=TRUE(),{Status}='Active')", [
    "Product Name", "Level", "Duration (weeks)", "NLQF Level", "Delivery Method",
    "Product Detail Page URL", "Short Description (HTML)", "Description",
  ]),
  fetchAll(SKILLS_TABLE, "{Active}=TRUE()", [
    "Skill", "Description", "Relevant for roles", "Relevant for goals", "Products",
  ]),
]);

const byId = {};
const products = productRecs
  .map((r) => {
    const f = r.fields;
    const p = {
      n: (f["Product Name"] || "").trim(),
      l: f["Level"] || "",
      d: f["Duration (weeks)"] || null,
      nq: f["NLQF Level"] || "None",
      dl: f["Delivery Method"] || "",
      u: f["Product Detail Page URL"] || "https://www.amsterdamdataacademy.com",
      ds: stripHtml(f["Short Description (HTML)"] || f["Description"]),
    };
    byId[r.id] = p;
    return p;
  })
  .filter((p) => p.n);

const skills = skillRecs
  .map((r) => {
    const f = r.fields;
    return {
      n: f["Skill"] || "",
      ds: f["Description"] || "",
      r: f["Relevant for roles"] || [],
      g: f["Relevant for goals"] || [],
      // alleen koppelingen naar gepubliceerde, actieve producten
      p: (f["Products"] || []).map((id) => byId[id] && byId[id].n).filter(Boolean),
    };
  })
  .filter((s) => s.n);

if (products.length < 3 || skills.length < 3) {
  throw new Error(`Te weinig data (${products.length} producten, ${skills.length} skills); catalog.json niet overschreven.`);
}

const body = { products, skills };
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
if (prev && JSON.stringify({ products: prev.products, skills: prev.skills }) === JSON.stringify(body)) {
  console.log("Catalogus ongewijzigd.");
} else {
  writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), ...body }, null, 1));
  console.log(`catalog.json bijgewerkt: ${products.length} producten, ${skills.length} skills.`);
}
