const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const AIRTABLE_BASE_ID = "apprFBMEVPG6yeee0";
const AIRTABLE_TABLES = { products: "tblkky5HA9VORtyBj", skills: "tblppoPZ2kQVm1Ipr" };
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CATALOG_REFRESH_MS = 15 * 60 * 1000;
const DEFAULT_ORIGINS = "https://www.amsterdamdataacademy.com,https://amsterdamdataacademy.com";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map(function (s) { return s.trim(); }).filter(Boolean);

app.set("trust proxy", 1); // Railway sits behind a proxy; needed for correct client IPs in the rate limiter

app.use(cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true); // same-origin iframe fetches, curl, healthchecks send no Origin header
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return cb(null, true);
    cb(null, false);
  }
}));
app.use(express.json({ limit: "10kb" }));

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Fallback catalog — used only if Airtable is unreachable and no cached data
// has ever loaded (e.g. AIRTABLE_TOKEN missing, or the very first boot fails).
// Real ADA programmes and URLs, kept intentionally small.
// ---------------------------------------------------------------------------
const FALLBACK_PRODUCTS = [
  { id: "fallback-1", name: "Data fundamentals", category: "Data", level: "Beginner", duration: 3, nlqf: "bachelor", delivery: "Blended", certificate: "", url: "https://amsterdamdataacademy.com/product/fundamentals-of-datascience-ai/", description: "De basis van data: het landschap, de tools en de statistiek achter elke datarol." },
  { id: "fallback-2", name: "Data & Analytics Bootcamp", category: "Data", level: "Intermediate", duration: 18, nlqf: "bachelor", delivery: "Blended", certificate: "", url: "https://amsterdamdataacademy.com/product/data-analytics-bootcamp/", description: "Word data-analytics expert: SQL, Power BI en data storytelling in één bootcamp." },
  { id: "fallback-3", name: "Datascience bootcamp", category: "Data", level: "Intermediate", duration: 18, nlqf: "bachelor", delivery: "Blended", certificate: "", url: "https://amsterdamdataacademy.com/product/datascience-bootcamp/", description: "Een brede introductie in data science, van statistiek tot machine learning." },
  { id: "fallback-4", name: "Data Engineering bootcamp", category: "Data", level: "Advanced", duration: 18, nlqf: "bachelor", delivery: "Blended", certificate: "", url: "https://amsterdamdataacademy.com/product/data-engineering-bootcamp/", description: "Werk met Python, Azure, Databricks en PySpark om data-infrastructuur te bouwen." },
  { id: "fallback-5", name: "Applied AI & bootcamp", category: "AI", level: "Intermediate", duration: 18, nlqf: "bachelor", delivery: "Blended", certificate: "", url: "https://amsterdamdataacademy.com/product/applied-ai-bootcamp/", description: "AI toepassen in de praktijk: prompt engineering, AI agents, LangChain en RAG." },
  { id: "fallback-6", name: "AI Leadership Track", category: "AI", level: "Intermediate", duration: 5, nlqf: "None", delivery: "Blended", certificate: "", url: "https://amsterdamdataacademy.com/product/ai-leadership-track/", description: "Voor founders en directie: AI-kansen identificeren en AI-adoptie leiden." }
];
const FALLBACK_SKILLS = [];

// ---------------------------------------------------------------------------
// Airtable catalog cache — refreshed every 15 minutes, with graceful fallback
// ---------------------------------------------------------------------------
let catalog = { products: FALLBACK_PRODUCTS, skills: FALLBACK_SKILLS, hash: "fallback", fetchedAt: 0, source: "fallback" };

async function fetchAirtableTable(tableId, opts) {
  opts = opts || {};
  let records = [];
  let offset;
  do {
    const params = new URLSearchParams();
    if (opts.filterByFormula) params.set("filterByFormula", opts.filterByFormula);
    if (opts.fields) opts.fields.forEach(function (f) { params.append("fields[]", f); });
    params.set("pageSize", "100");
    if (offset) params.set("offset", offset);
    const res = await fetchWithTimeout(
      "https://api.airtable.com/v0/" + AIRTABLE_BASE_ID + "/" + tableId + "?" + params.toString(),
      { headers: { Authorization: "Bearer " + AIRTABLE_TOKEN } },
      8000
    );
    if (!res.ok) throw new Error("Airtable " + tableId + " HTTP " + res.status);
    const data = await res.json();
    records = records.concat(data.records || []);
    offset = data.offset;
  } while (offset);
  return records;
}

async function refreshCatalog() {
  if (!AIRTABLE_TOKEN) {
    console.warn("AIRTABLE_TOKEN ontbreekt — widget draait op de statische fallback-catalogus.");
    return;
  }
  try {
    const results = await Promise.all([
      fetchAirtableTable(AIRTABLE_TABLES.products, {
        filterByFormula: "AND({Published}=TRUE(),{Status}='Active')",
        fields: ["Product Name", "Category", "Level", "Duration (weeks)", "NLQF Level", "Delivery Method", "Certificate", "Product Detail Page URL", "Short Description (HTML)", "Description", "Study Load (hours)"]
      }),
      fetchAirtableTable(AIRTABLE_TABLES.skills, {
        filterByFormula: "{Active}=TRUE()",
        fields: ["Skill", "Category", "Level", "Description", "Relevant for roles", "Relevant for goals", "Products"]
      })
    ]);
    const productRecords = results[0];
    const skillRecords = results[1];

    const products = productRecords.map(function (r) {
      return {
        id: r.id,
        name: (r.fields["Product Name"] || "").trim(),
        category: r.fields["Category"] || "",
        level: r.fields["Level"] || "",
        duration: r.fields["Duration (weeks)"] || null,
        nlqf: r.fields["NLQF Level"] || "None",
        delivery: r.fields["Delivery Method"] || "",
        certificate: r.fields["Certificate"] || "",
        url: r.fields["Product Detail Page URL"] || "https://www.amsterdamdataacademy.com",
        description: stripHtml(r.fields["Short Description (HTML)"] || r.fields["Description"] || "")
      };
    }).filter(function (p) { return p.name; });

    const productIds = new Set(products.map(function (p) { return p.id; }));

    const skills = skillRecords.map(function (r) {
      return {
        id: r.id,
        name: r.fields["Skill"] || "",
        category: r.fields["Category"] || "",
        level: r.fields["Level"] || "",
        description: r.fields["Description"] || "",
        roles: r.fields["Relevant for roles"] || [],
        goals: r.fields["Relevant for goals"] || [],
        productIds: (r.fields["Products"] || []).filter(function (id) { return productIds.has(id); })
      };
    }).filter(function (s) { return s.name; });

    const hash = crypto.createHash("sha1").update(JSON.stringify({ products: products, skills: skills })).digest("hex").slice(0, 12);
    catalog = { products: products, skills: skills, hash: hash, fetchedAt: Date.now(), source: "airtable" };
    console.log("Catalogus ververst: " + products.length + " programma's, " + skills.length + " skills (hash " + hash + ").");
  } catch (e) {
    console.error("Kon Airtable-catalogus niet verversen, blijf op vorige/fallback data:", e.message);
  }
}

refreshCatalog();
setInterval(refreshCatalog, CATALOG_REFRESH_MS);

// ---------------------------------------------------------------------------
// Matching: quiz answers -> relevant AI Skills -> linked Products
// ---------------------------------------------------------------------------
function matchCatalog(answers) {
  let matchedSkills = catalog.skills.filter(function (s) {
    return s.roles.indexOf(answers.role) !== -1 && s.goals.indexOf(answers.goal) !== -1;
  });
  if (matchedSkills.length < 3) {
    matchedSkills = catalog.skills.filter(function (s) {
      return s.roles.indexOf(answers.role) !== -1 || s.goals.indexOf(answers.goal) !== -1;
    });
  }
  if (matchedSkills.length === 0) matchedSkills = catalog.skills;

  const productById = {};
  catalog.products.forEach(function (p) { productById[p.id] = p; });

  const counts = {};
  matchedSkills.forEach(function (s) {
    s.productIds.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
  });

  let matchedProducts = Object.keys(counts)
    .map(function (id) { return { product: productById[id], count: counts[id] }; })
    .filter(function (x) { return x.product; })
    .sort(function (a, b) { return b.count - a.count; })
    .map(function (x) { return x.product; });

  if (matchedProducts.length === 0) matchedProducts = catalog.products;

  return { skills: matchedSkills.slice(0, 12), products: matchedProducts.slice(0, 8) };
}

// ---------------------------------------------------------------------------
// Recommendation cache — keyed by answers + current catalog hash, so it is
// invalidated automatically whenever the live ADA catalogue actually changes.
// ---------------------------------------------------------------------------
const recommendationCache = new Map();
const ANSWER_KEYS = ["role", "python", "ai_experience", "goal", "timeline"];
function cacheKey(answers) {
  return ANSWER_KEYS.map(function (k) { return answers[k]; }).join("|") + "::" + catalog.hash;
}

const ALLOWED_ANSWERS = {
  role: ["analyst", "developer", "manager", "hr_ld", "career_switch", "other"],
  python: ["none", "basic", "intermediate", "advanced"],
  ai_experience: ["none", "conceptual", "practical", "deployed"],
  goal: ["job", "promotion", "team", "project", "curious"],
  timeline: ["low", "medium", "high", "fulltime"]
};
function validateAnswers(raw) {
  if (!raw || typeof raw !== "object") return null;
  const clean = {};
  for (const key of ANSWER_KEYS) {
    const v = raw[key];
    if (typeof v !== "string" || ALLOWED_ANSWERS[key].indexOf(v) === -1) return null;
    clean[key] = v;
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Recommendation generation: Claude, grounded in the live catalogue, with a
// deterministic non-AI fallback so the widget never fully breaks.
// ---------------------------------------------------------------------------
const ANSWER_LABELS = {
  role: { analyst: "Data Analist", developer: "Developer", manager: "Manager", hr_ld: "HR/L&D", career_switch: "Carrièreswitch", other: "Anders" },
  python: { none: "Geen ervaring", basic: "Basis", intermediate: "Gevorderd", advanced: "Expert" },
  ai_experience: { none: "Vrijwel geen", conceptual: "Conceptueel", practical: "Praktisch", deployed: "In productie" },
  goal: { job: "Nieuwe baan", promotion: "Doorgroeien", team: "Team upskillen", project: "Project", curious: "Nieuwsgierigheid" },
  timeline: { low: "1-3u/week", medium: "4-8u/week", high: "8-15u/week", fulltime: "Fulltime" }
};

function buildPrompt(answers, matched) {
  const answerText = ANSWER_KEYS.map(function (k) {
    return k + ": " + (ANSWER_LABELS[k][answers[k]] || answers[k]);
  }).join(", ");
  const productLines = matched.products.map(function (p) {
    const bits = [];
    if (p.level) bits.push(p.level);
    if (p.duration) bits.push(p.duration + " weken");
    if (p.nlqf === "bachelor") bits.push("NLQF-niveau 6");
    return "- " + p.name + " (" + bits.join(", ") + "): " + p.description;
  }).join("\n");
  const skillLines = matched.skills.map(function (s) { return s.name; }).join(", ");

  return "Je bent leeradviseur van Amsterdam Data Academy (ADA). Bezoeker: " + answerText + ".\n" +
    "Kies het meest passende programma UITSLUITEND uit deze actieve ADA-programma's, gebruik de exacte naam:\n" + productLines + "\n\n" +
    "Kies skills_to_gain UITSLUITEND uit deze lijst: " + skillLines + "\n\n" +
    "Geef persoonlijk leeradvies ALLEEN als JSON zonder markdown, in het Nederlands, zonder emoji's, en zonder de termen \"NLQF-geaccrediteerd\" of \"bachelor\" als titel (gebruik \"NLQF-niveau 6\" als dat relevant is):\n" +
    "{\"headline\":\"max 10 woorden\",\"summary\":\"2-3 zinnen met je/jij\",\"level\":\"Starter of Gevorderd of Expert\",\"recommended_track\":\"exacte programmanaam uit de lijst\",\"track_description\":\"1-2 zinnen\",\"learning_path\":[{\"step\":1,\"title\":\"titel\",\"duration\":\"x weken\",\"description\":\"uitleg\"},{\"step\":2,\"title\":\"titel\",\"duration\":\"x weken\",\"description\":\"uitleg\"},{\"step\":3,\"title\":\"titel\",\"duration\":\"x weken\",\"description\":\"uitleg\"}],\"skills_to_gain\":[\"s1\",\"s2\",\"s3\",\"s4\"],\"cta_text\":\"CTA max 8 woorden\"}";
}

function defaultLearningPath(matched) {
  const skills = matched.skills.slice(0, 3);
  const fallbackTitles = ["Fundamenten leggen", "Vaardigheden verdiepen", "Toepassen in de praktijk"];
  return fallbackTitles.map(function (title, i) {
    const skill = skills[i];
    return {
      step: i + 1,
      title: skill ? skill.name : title,
      duration: "2-3 weken",
      description: skill ? skill.description : "Bouw stap voor stap verder op je huidige kennis."
    };
  });
}

function groundRecommendation(parsed, matched) {
  const pool = matched.products.length ? matched.products : catalog.products;
  const norm = function (s) { return String(s || "").toLowerCase().trim(); };
  const wanted = norm(parsed.recommended_track);
  let product = pool.find(function (p) { return norm(p.name) === wanted; })
    || pool.find(function (p) { return wanted && (wanted.indexOf(norm(p.name)) !== -1 || norm(p.name).indexOf(wanted) !== -1); })
    || pool[0];

  const skillNames = {};
  matched.skills.forEach(function (s) { skillNames[s.name] = true; });
  let skills = Array.isArray(parsed.skills_to_gain) ? parsed.skills_to_gain.filter(function (s) { return skillNames[s]; }) : [];
  if (skills.length < 3) {
    matched.skills.slice(0, 5).forEach(function (s) {
      if (skills.length < 5 && skills.indexOf(s.name) === -1) skills.push(s.name);
    });
  }

  const level = ["Starter", "Gevorderd", "Expert"].indexOf(parsed.level) !== -1 ? parsed.level : "Gevorderd";
  const learningPath = Array.isArray(parsed.learning_path) && parsed.learning_path.length
    ? parsed.learning_path.slice(0, 4).map(function (s, i) {
        return {
          step: i + 1,
          title: String(s.title || "").slice(0, 80),
          duration: String(s.duration || "").slice(0, 40),
          description: String(s.description || "").slice(0, 240)
        };
      })
    : defaultLearningPath(matched);

  return {
    headline: String(parsed.headline || (product.name + " past bij jou")).slice(0, 120),
    summary: String(parsed.summary || product.description || "").slice(0, 500),
    level: level,
    recommended_track: product.name,
    track_description: String(parsed.track_description || product.description || "").slice(0, 400),
    learning_path: learningPath,
    skills_to_gain: skills.slice(0, 6),
    cta_text: String(parsed.cta_text || ("Bekijk " + product.name)).slice(0, 80),
    cta_url: product.url,
    level_meta: { duration: product.duration, delivery: product.delivery, nlqf: product.nlqf, certificate: product.certificate }
  };
}

async function generateWithClaude(answers, matched) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY ontbreekt");
  const prompt = buildPrompt(answers, matched);
  const r = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
  }, 10000);
  if (!r.ok) throw new Error("Claude API HTTP " + r.status);
  const data = await r.json();
  if (data.error) throw new Error("Claude API error: " + (data.error.message || "onbekend"));
  const block = (data.content || []).find(function (b) { return b.type === "text"; });
  if (!block) throw new Error("Geen tekstblok in Claude-respons");
  let parsed;
  try {
    parsed = JSON.parse(block.text.replace(/```json|```/g, "").trim());
  } catch (e) {
    throw new Error("Kon Claude-JSON niet parsen");
  }
  return groundRecommendation(parsed, matched);
}

function generateFallback(answers, matched) {
  const pool = matched.products.length ? matched.products : catalog.products;
  const product = pool[0] || FALLBACK_PRODUCTS[0];
  const levelScore = { none: 0, basic: 1, conceptual: 1, intermediate: 2, practical: 2, advanced: 3, deployed: 3 };
  const score = (levelScore[answers.python] || 0) + (levelScore[answers.ai_experience] || 0);
  const level = score >= 5 ? "Expert" : score >= 2 ? "Gevorderd" : "Starter";
  const skills = matched.skills.slice(0, 5).map(function (s) { return s.name; });

  return {
    headline: product.name + " sluit aan bij jouw profiel",
    summary: product.description || "We hebben op basis van je antwoorden een passend leertraject voor je gevonden.",
    level: level,
    recommended_track: product.name,
    track_description: product.description || "",
    learning_path: defaultLearningPath(matched),
    skills_to_gain: skills.length ? skills : ["Python", "Data-analyse", "AI-toepassingen"],
    cta_text: "Bekijk " + product.name,
    cta_url: product.url,
    level_meta: { duration: product.duration, delivery: product.delivery, nlqf: product.nlqf, certificate: product.certificate }
  };
}

async function generateRecommendation(answers, matched) {
  try {
    return await generateWithClaude(answers, matched);
  } catch (e) {
    console.error("Claude-aanbeveling mislukt, val terug op regelgebaseerd advies:", e.message);
    return generateFallback(answers, matched);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/", function (req, res) {
  res.json({
    status: "ok",
    service: "ADA Skill Navigator Widget",
    catalog: {
      source: catalog.source,
      products: catalog.products.length,
      skills: catalog.skills.length,
      fetchedAt: catalog.fetchedAt ? new Date(catalog.fetchedAt).toISOString() : null
    }
  });
});

const analyzeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Te veel aanvragen, probeer het later opnieuw." }
});

app.post("/api/analyze", analyzeLimiter, async function (req, res) {
  const answers = validateAnswers(req.body && req.body.answers);
  if (!answers) return res.status(400).json({ error: "Ongeldige antwoorden" });

  try {
    const key = cacheKey(answers);
    const cached = recommendationCache.get(key);
    if (cached) return res.json(cached);

    const matched = matchCatalog(answers);
    const result = await generateRecommendation(answers, matched);

    if (recommendationCache.size > 5000) recommendationCache.clear();
    recommendationCache.set(key, result);
    res.json(result);
  } catch (e) {
    console.error("Onverwachte fout in /api/analyze:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/skill-navigator.js", function (req, res) {
  const base = process.env.API_BASE_URL || ("https://" + req.headers.host);
  res.setHeader("Content-Type", "application/javascript");
  res.send("(function(){" +
    "var c=document.createElement('div');" +
    "c.style.cssText='width:100%;max-width:440px;margin:0 auto;';" +
    "var s=document.currentScript||document.querySelector('script[src*=\"skill-navigator.js\"]');" +
    "s.parentNode.insertBefore(c,s.nextSibling);" +
    "var f=document.createElement('iframe');" +
    "f.src='" + base + "/widget';" +
    "f.style.cssText='width:100%;height:640px;border:none;border-radius:16px;box-shadow:0 8px 40px rgba(49,57,156,0.14);';" +
    "f.title='ADA AI Skill Navigator';" +
    "window.addEventListener('message',function(e){if(e.data&&e.data.type==='ada-widget-height')f.style.height=(e.data.height+20)+'px';});" +
    "c.appendChild(f);" +
    "})();"
  );
});

app.get("/widget", function (req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(HTML);
});

// ---------------------------------------------------------------------------
// Widget page (HTML + CSS + client-side JS, self-contained, no build step)
// ---------------------------------------------------------------------------
const HTML = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ADA Skill Navigator</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Nunito+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Nunito Sans",sans-serif;background:#fff;color:#2E2E2E}
button{font:inherit;color:inherit}
.screen{display:none}.screen.active{display:block}
.ih{background:linear-gradient(135deg,#242d82,#31399C);padding:32px 24px 28px;text-align:center}
.ih .icon-lg{color:#fff;margin-bottom:10px;display:flex;justify-content:center}
.ih .icon-lg svg{width:38px;height:38px}
.ih h1{color:#fff;font-family:"Montserrat",sans-serif;font-size:22px;font-weight:900;margin-bottom:8px}
.ih p{color:rgba(255,255,255,0.8);font-size:13px;line-height:1.6}
.ib{padding:24px}.feat{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:13px}
.feat .fi{color:#31399C;display:flex;flex-shrink:0}.feat .fi svg{width:17px;height:17px}
.pw-wrap{padding:20px 24px 0}
.pl{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px}
.pl-left{display:flex;align-items:center;gap:6px}
.bk{background:none;border:none;cursor:pointer;color:#31399C;padding:2px;display:none;border-radius:6px}
.bk svg{width:15px;height:15px;display:block}
.bk:hover{background:rgba(49,57,156,.08)}
.pl span:first-child{font-family:"Montserrat",sans-serif;font-weight:700;color:#31399C;letter-spacing:.06em}
.pb{background:#E5E7EB;border-radius:99px;height:5px}
.pf{background:linear-gradient(90deg,#31399C,#4650c4);height:100%;border-radius:99px;transition:width .4s ease}
.qb{padding:16px 24px 24px}
.qb h2{font-family:"Montserrat",sans-serif;font-size:16px;font-weight:800;margin-bottom:16px;line-height:1.35}
.opts{display:flex;flex-direction:column;gap:8px}
.opt{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;cursor:pointer;border:2px solid #E5E7EB;background:#fff;transition:all .15s;text-align:left;width:100%}
.opt:hover{border-color:#4650c4}.opt.sel{border-color:#31399C;background:rgba(49,57,156,.05)}
.oi{width:32px;height:32px;border-radius:8px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;color:#31399C;flex-shrink:0}
.oi svg{width:18px;height:18px}
.opt.sel .oi{background:#31399C;color:#fff}
.ol{font-size:13px;color:#2E2E2E;font-weight:500;line-height:1.4}
.opt.sel .ol{color:#242d82;font-weight:700}
.ck{margin-left:auto;width:20px;height:20px;border-radius:50%;background:#31399C;display:none;align-items:center;justify-content:center;flex-shrink:0}
.opt.sel .ck{display:flex}
.btn{width:100%;margin-top:18px;padding:14px 20px;border:none;border-radius:10px;cursor:pointer;font-family:"Montserrat",sans-serif;font-size:14px;font-weight:800;letter-spacing:.02em;transition:all .15s}
.btnp{background:#31399C;color:#fff}.btnp:hover{background:#4650c4}.btnp:disabled{background:#E5E7EB;color:#6B7280;cursor:default}
.ld{padding:60px 24px;text-align:center}
.sp{width:48px;height:48px;border-radius:50%;border:3px solid #E5E7EB;border-top-color:#31399C;animation:spin .8s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}
.ld h3{font-family:"Montserrat",sans-serif;font-size:15px;font-weight:700;margin-bottom:4px}.ld p{font-size:12px;color:#6B7280}
.rh{background:linear-gradient(135deg,#242d82,#31399C,#4650c4);padding:24px 24px 20px}
.lv{display:inline-block;padding:3px 10px;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.08em;font-family:"Montserrat",sans-serif;color:#fff;margin-bottom:12px}
.rh h2{color:#fff;font-family:"Montserrat",sans-serif;font-size:18px;font-weight:800;margin-bottom:10px;line-height:1.3}
.rh p{color:rgba(255,255,255,.82);font-size:13px;line-height:1.6}
.rb{padding:20px 24px}
.tb{background:rgba(249,213,113,.2);border:1.5px solid #F9D571;border-radius:10px;padding:14px 16px;margin-bottom:18px}
.tl{font-size:10px;font-weight:800;color:#92620a;letter-spacing:.08em;font-family:"Montserrat",sans-serif;margin-bottom:4px}
.tb h3{font-size:15px;font-weight:800;font-family:"Montserrat",sans-serif;margin-bottom:4px}
.tb p{font-size:12px;color:#6B4A1A;line-height:1.5}
.rmeta{font-size:11px;color:#92620a;font-weight:700;margin-top:8px}
.sl{font-size:11px;font-weight:800;color:#31399C;letter-spacing:.08em;font-family:"Montserrat",sans-serif;margin-bottom:12px}
.ps{display:flex;gap:12px;margin-bottom:12px;align-items:flex-start}
.sn{width:28px;height:28px;border-radius:50%;flex-shrink:0;background:#31399C;color:#fff;display:flex;align-items:center;justify-content:center;font-family:"Montserrat",sans-serif;font-size:12px;font-weight:800}
.st{font-size:13px;font-weight:700}.sd2{display:inline-block;font-size:10px;color:#6B7280;background:#F3F4F6;padding:2px 8px;border-radius:99px;margin-left:6px}
.dd{font-size:12px;color:#6B7280;margin-top:2px;line-height:1.5}
.sks{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px}
.sk{background:rgba(123,217,184,.25);border:1px solid #7BD9B8;color:#1a6b53;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700}
.ct{display:block;width:100%;padding:14px 20px;background:#D75A48;color:#fff;text-align:center;border-radius:10px;text-decoration:none;font-family:"Montserrat",sans-serif;font-size:14px;font-weight:800;margin-bottom:10px}
.ct:hover{background:#c4503f}
.rs2{display:block;text-align:center;font-size:12px;color:#31399C;text-decoration:none;font-weight:700;margin-bottom:14px}
.rs2:hover{text-decoration:underline}
.rs{background:none;border:none;color:#6B7280;font-size:12px;cursor:pointer;text-decoration:underline;width:100%}
.pw{border-top:1px solid #E5E7EB;padding:10px 24px;display:flex;align-items:center;justify-content:center;gap:6px;background:#F9FAFB}
.pw span{font-size:10px;color:#6B7280}
.pw a{font-size:10px;font-weight:800;color:#31399C;text-decoration:none;font-family:"Montserrat",sans-serif;display:flex;align-items:center;gap:4px}
.pw a:hover{text-decoration:underline}
.opt:focus-visible,.btn:focus-visible,.bk:focus-visible,.rs:focus-visible,.rs2:focus-visible,.ct:focus-visible{outline:2px solid #4650c4;outline-offset:2px}
</style></head><body>
<div id="si" class="screen active">
<div class="ih"><div class="icon-lg" id="icHeader"></div>
<h1>AI Skill Navigator</h1><p>Beantwoord 5 korte vragen en ontdek welk leerpad het beste bij jou past.</p></div>
<div class="ib"><div class="feat"><span class="fi" id="icBolt"></span> Duurt maar 2 minuten</div>
<div class="feat"><span class="fi" id="icTarget"></span> Persoonlijk advies op maat</div>
<div class="feat"><span class="fi" id="icGift"></span> Volledig gratis</div>
<button class="btn btnp" onclick="go()">Start de check &#8594;</button></div></div>
<div id="sq" class="screen">
<div class="pw-wrap"><div class="pl"><span class="pl-left"><button type="button" class="bk" id="bk" onclick="back()" aria-label="Vorige vraag"></button><span id="qc">VRAAG 1 VAN 5</span></span><span id="qp">0% compleet</span></div>
<div class="pb"><div class="pf" id="pf" style="width:0%"></div></div></div>
<div class="qb"><h2 id="qt"></h2><div class="opts" id="oc"></div>
<button class="btn btnp" id="bn" disabled onclick="nxt()">Volgende vraag &#8594;</button></div></div>
<div id="sl" class="screen"><div class="ld"><div class="sp"></div>
<h3>Jouw leerpad wordt samengesteld...</h3><p>We stemmen ons advies af op het actuele ADA-aanbod</p></div></div>
<div id="sr" class="screen">
<div class="rh"><div class="lv" id="lv"></div><h2 id="rh2"></h2><p id="rp2"></p></div>
<div class="rb"><div class="tb"><div class="tl">AANBEVOLEN LEERTRAJECT</div><h3 id="rt"></h3><p id="rd"></p><p class="rmeta" id="rm"></p></div>
<div class="sl">JOUW LEERPAD</div><div id="rpa" style="margin-bottom:18px"></div>
<div class="sl">WAT JE LEERT</div><div class="sks" id="rsk"></div>
<a href="https://www.amsterdamdataacademy.com" target="_blank" rel="noopener noreferrer" class="ct" id="rc">Bekijk mijn opleiding &#8594;</a>
<a href="https://www.amsterdamdataacademy.com" target="_blank" rel="noopener noreferrer" class="rs2">Of bekijk alle opleidingen</a>
<button class="rs" onclick="rst()">Doe de check opnieuw</button></div></div>
<div class="pw"><span>Mogelijk gemaakt door</span>
<a href="https://www.amsterdamdataacademy.com" target="_blank" rel="noopener noreferrer">
<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#31399C"/>
<path d="M6 18L12 6L18 18" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M8.5 13.5H15.5" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
Amsterdam Data Academy</a></div>
<script>
var ICONS={
compass:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M12.5 7.5L10.8 10.8L7.5 12.5L9.2 9.2L12.5 7.5Z" fill="currentColor"/></svg>',
bolt:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 2L4.5 11.5H9.5L8.5 18L15.5 8H10.5L11 2Z" fill="currentColor"/></svg>',
target:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="4.5" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="1.3" fill="currentColor"/></svg>',
gift:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="8.5" width="14" height="8" rx="1" stroke="currentColor" stroke-width="1.6"/><path d="M3 8.5H17" stroke="currentColor" stroke-width="1.6"/><path d="M10 8.5V17" stroke="currentColor" stroke-width="1.6"/><path d="M10 8.5C10 8.5 6.5 8.5 6.5 6C6.5 4.6 8.7 4 10 6C11.3 4 13.5 4.6 13.5 6C13.5 8.5 10 8.5 10 8.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
chartBar:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 17V3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3 17H17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="6" y="11" width="2.4" height="6" fill="currentColor"/><rect x="10.3" y="7" width="2.4" height="10" fill="currentColor"/><rect x="14.6" y="4" width="2.4" height="13" fill="currentColor"/></svg>',
code:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 6L2.5 10L7 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 6L17.5 10L13 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
briefcase:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="6.5" width="15" height="10" rx="1.4" stroke="currentColor" stroke-width="1.6"/><path d="M7 6.5V4.8C7 4.2 7.5 3.7 8.1 3.7H11.9C12.5 3.7 13 4.2 13 4.8V6.5" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 11H17.5" stroke="currentColor" stroke-width="1.6"/></svg>',
cap:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 4L18 8L10 12L2 8L10 4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5.5 9.8V13C5.5 14.1 7.5 15.5 10 15.5C12.5 15.5 14.5 14.1 14.5 13V9.8" stroke="currentColor" stroke-width="1.6"/></svg>',
shuffle:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6H8L14 14H17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3 14H8L9.5 11.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 6H17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M15 4L17 6L15 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
sprout:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 17V11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10 11C10 11 5.5 10.5 5.5 6C9 6 10 8.5 10 11Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 11C10 11 14.5 10.5 14.5 6C11 6 10 8.5 10 11Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
book:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 5.5C8.5 4.3 5.8 4 3 4.6V15.6C5.8 15 8.5 15.3 10 16.5C11.5 15.3 14.2 15 17 15.6V4.6C14.2 4 11.5 4.3 10 5.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 5.5V16.5" stroke="currentColor" stroke-width="1.5"/></svg>',
layers:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 3L17 7L10 11L3 7L10 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 11L10 15L17 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
rocket:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2.5C12.5 4 14 7 13.5 11L10 14.5L6.5 11C6 7 7.5 4 10 2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="10" cy="8" r="1.4" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 11L4 12.5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.5 11L16 12.5L15 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 14.5L8 17.5L10 16L12 17.5L11.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
brain:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 4.5C6 4.5 5 6 5.2 7.5C4 8 3.5 9.8 4.5 11C4 12.3 4.8 13.8 6.2 14C6.3 15.2 7.4 16 8.5 16C9.2 16 10 15.6 10 15V6C10 5 9 4.5 8 4.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 4.5C14 4.5 15 6 14.8 7.5C16 8 16.5 9.8 15.5 11C16 12.3 15.2 13.8 13.8 14C13.7 15.2 12.6 16 11.5 16C10.8 16 10 15.6 10 15V6C10 5 11 4.5 12 4.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
cog:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="3" stroke="currentColor" stroke-width="1.6"/><path d="M10 3V5M10 15V17M17 10H15M5 10H3M15.1 4.9L13.7 6.3M6.3 13.7L4.9 15.1M15.1 15.1L13.7 13.7M6.3 6.3L4.9 4.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
users:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7.2" cy="7" r="2.3" stroke="currentColor" stroke-width="1.6"/><path d="M2.8 16C2.8 13.2 4.7 11.5 7.2 11.5C9.7 11.5 11.6 13.2 11.6 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="13.8" cy="7.5" r="1.9" stroke="currentColor" stroke-width="1.5"/><path d="M13 11.6C15 11.7 16.6 13.2 16.8 15.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
wrench:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 3.5C15 3.5 16.2 4.7 16.2 6.2C16.2 6.9 15.9 7.6 15.5 8.1L8.2 15.4C7.6 16 6.6 16 6 15.4C5.4 14.8 5.4 13.8 6 13.2L13.3 5.9C12.9 5.5 12.6 4.9 12.6 4.2C12.6 3.9 12.6 3.7 12.7 3.5C12.9 3.5 13.2 3.5 13.5 3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="6.5" cy="14.5" r="0.6" fill="currentColor"/></svg>',
search:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M13 13L17 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
clock:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.6"/><path d="M10 6V10L12.8 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
flame:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2.5C10 2.5 6 6.5 6 10.5C6 13 7.8 15 10 15C12.2 15 14 13 14 10.5C14 9.5 13.6 8.7 13.1 8C13.1 9.3 12.2 10.2 11.5 10.2C11.9 9 12 7.5 10.9 6C10.9 7.2 10.2 8 9.5 8.3C8.6 8.7 8 9.6 8 10.6C8 11.5 8.5 12.2 9.2 12.6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
trendingUp:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 14L8 9L11.5 12.5L17 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 6H17V10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
arrowLeft:'<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 4.5L6 10L12.5 15.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
var CHECK_SVG='<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
document.getElementById('icHeader').innerHTML=ICONS.compass;
document.getElementById('icBolt').innerHTML=ICONS.bolt;
document.getElementById('icTarget').innerHTML=ICONS.target;
document.getElementById('icGift').innerHTML=ICONS.gift;
document.getElementById('bk').innerHTML=ICONS.arrowLeft;
function escapeHtml(str){
  return String(str==null?'':str).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
var Q=[
{id:"role",q:"Wat is jouw huidige rol?",o:[{v:"analyst",l:"Data Analist / BI Specialist",ic:"chartBar"},{v:"developer",l:"Developer / Engineer",ic:"code"},{v:"manager",l:"Manager / Team Lead",ic:"briefcase"},{v:"hr_ld",l:"HR / L&D Professional",ic:"cap"},{v:"career_switch",l:"Carrièreswitch naar data",ic:"shuffle"},{v:"other",l:"Anders / Nog studerend",ic:"sprout"}]},
{id:"python",q:"Hoe zou je jouw Python-ervaring omschrijven?",o:[{v:"none",l:"Geen ervaring",ic:"sprout"},{v:"basic",l:"Basis — variabelen, loops",ic:"book"},{v:"intermediate",l:"Gevorderd — pandas, matplotlib",ic:"layers"},{v:"advanced",l:"Expert — ML libraries",ic:"rocket"}]},
{id:"ai_experience",q:"Wat is jouw ervaring met AI & Machine Learning?",o:[{v:"none",l:"Vrijwel geen — ik wil beginnen",ic:"sprout"},{v:"conceptual",l:"Ik begrijp de concepten",ic:"brain"},{v:"practical",l:"Ik heb modellen getraind",ic:"cog"},{v:"deployed",l:"AI in productie draaien",ic:"rocket"}]},
{id:"goal",q:"Wat is jouw belangrijkste leerdoel?",o:[{v:"job",l:"Nieuwe baan in data/AI",ic:"target"},{v:"promotion",l:"Doorgroeien in huidige rol",ic:"trendingUp"},{v:"team",l:"Mijn team upskillen",ic:"users"},{v:"project",l:"Een specifiek project",ic:"wrench"},{v:"curious",l:"Gewoon meer leren",ic:"search"}]},
{id:"timeline",q:"Hoeveel tijd kun je per week investeren?",o:[{v:"low",l:"1-3 uur per week",ic:"clock"},{v:"medium",l:"4-8 uur per week",ic:"clock"},{v:"high",l:"8-15 uur per week",ic:"flame"},{v:"fulltime",l:"Fulltime intensiteit",ic:"flame"}]}
];
var step=0,ans={},sel=null;
function show(id){
  document.querySelectorAll(".screen").forEach(function(s){s.classList.remove("active")});
  var el=document.getElementById("s"+id);
  el.classList.add("active");
  el.style.opacity="0";
  requestAnimationFrame(function(){el.style.transition="opacity .25s ease";el.style.opacity="1"});
  setTimeout(function(){window.parent.postMessage({type:"ada-widget-height",height:document.body.scrollHeight},"*")},90)
}
function go(){step=0;ans={};render();show("q")}
function render(){
  var q=Q[step],pct=Math.round(step/Q.length*100);
  document.getElementById("qc").textContent="VRAAG "+(step+1)+" VAN "+Q.length;
  document.getElementById("qp").textContent=pct+"% compleet";
  document.getElementById("pf").style.width=pct+"%";
  document.getElementById("qt").textContent=q.q;
  document.getElementById("bk").style.display=step>0?"flex":"none";
  var existing=ans[q.id]||null;
  sel=existing;
  var oc=document.getElementById("oc");oc.innerHTML="";
  q.o.forEach(function(o){
    var b=document.createElement("button");
    b.type="button";
    b.className="opt"+(o.v===existing?" sel":"");
    b.innerHTML="<span class=oi>"+(ICONS[o.ic]||"")+"</span><span class=ol>"+escapeHtml(o.l)+"</span><span class=ck>"+CHECK_SVG+"</span>";
    b.onclick=function(){document.querySelectorAll(".opt").forEach(function(x){x.classList.remove("sel")});b.classList.add("sel");sel=o.v;document.getElementById("bn").disabled=false};
    oc.appendChild(b)
  });
  var bn=document.getElementById("bn");bn.disabled=!existing;bn.textContent=step===Q.length-1?"Bekijk mijn leerpad →":"Volgende vraag →"
}
function back(){if(step===0)return;step--;render()}
function nxt(){if(!sel)return;ans[Q[step].id]=sel;if(step<Q.length-1){step++;render()}else{show("l");analyze()}}
function analyze(){
  fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({answers:ans})})
    .then(function(r){return r.json()})
    .then(function(d){renderR(d);show("r")})
    .catch(function(){alert("Er ging iets mis. Probeer opnieuw.");show("i")})
}
function renderR(r){
  var lc={Starter:"#D75A48",Gevorderd:"#31399C",Expert:"#059669"};
  var lb=document.getElementById("lv");lb.textContent=(r.level||"Gevorderd").toUpperCase();lb.style.background=lc[r.level]||"#31399C";
  document.getElementById("rh2").textContent=r.headline||"";
  document.getElementById("rp2").textContent=r.summary||"";
  document.getElementById("rt").textContent=r.recommended_track||"";
  document.getElementById("rd").textContent=r.track_description||"";
  var meta=r.level_meta||{},metaParts=[];
  if(meta.duration)metaParts.push(meta.duration+" weken");
  if(meta.delivery)metaParts.push(meta.delivery);
  if(meta.nlqf==="bachelor")metaParts.push("NLQF-niveau 6");
  document.getElementById("rm").textContent=metaParts.join(" · ");
  document.getElementById("rpa").innerHTML=(r.learning_path||[]).map(function(s){
    return "<div class=ps><div class=sn>"+(s.step||"")+"</div><div><div class=st>"+escapeHtml(s.title)+"<span class=sd2>"+escapeHtml(s.duration||"")+"</span></div><div class=dd>"+escapeHtml(s.description||"")+"</div></div></div>"
  }).join("");
  document.getElementById("rsk").innerHTML=(r.skills_to_gain||[]).map(function(s){return "<span class=sk>"+escapeHtml(s)+"</span>"}).join("");
  var cta=document.getElementById("rc");
  cta.textContent=r.cta_text||"Bekijk mijn opleidingen →";
  cta.href=r.cta_url||"https://www.amsterdamdataacademy.com"
}
function rst(){step=0;ans={};sel=null;show("i")}
document.addEventListener("keydown",function(e){
  var qScreen=document.getElementById("sq");
  if(!qScreen.classList.contains("active"))return;
  if(e.key>="1"&&e.key<="9"){
    var btns=document.querySelectorAll("#oc .opt");
    var idx=parseInt(e.key,10)-1;
    if(btns[idx])btns[idx].click()
  }else if(e.key==="Enter"){
    if(!document.getElementById("bn").disabled)nxt()
  }else if(e.key==="Backspace"||e.key==="ArrowLeft"){
    if(step>0){e.preventDefault();back()}
  }
});
window.addEventListener("load",function(){window.parent.postMessage({type:"ada-widget-height",height:document.body.scrollHeight},"*")});
</script></body></html>`;

app.listen(PORT, function () {
  console.log("ADA Skill Navigator running on port " + PORT);
});
