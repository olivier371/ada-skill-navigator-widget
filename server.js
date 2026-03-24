const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "ADA Skill Navigator Widget" });
});

// Claude API proxy
app.post("/api/analyze", async (req, res) => {
  const { answers } = req.body;
  if (!answers) return res.status(400).json({ error: "Missing answers" });

  const labelMap = {
    role: { analyst: "Data Analist / BI Specialist", developer: "Developer / Engineer", manager: "Manager / Team Lead", hr_ld: "HR / L&D Professional", career_switch: "Carrièreswitch naar data", other: "Anders / Nog studerend" },
    python: { none: "Geen ervaring", basic: "Basis — variabelen, loops, functies", intermediate: "Gevorderd — pandas, matplotlib", advanced: "Expert — ML libraries, productiecode" },
    ai_experience: { none: "Vrijwel geen — ik wil beginnen", conceptual: "Ik begrijp de concepten, maar bouw nog niet", practical: "Ik heb modellen getraind en geëvalueerd", deployed: "Ik heb AI-oplossingen in productie draaien" },
    goal: { job: "Een nieuwe baan in data/AI", promotion: "Doorgroeien in mijn huidige rol", team: "Mijn team upskillen (B2B)", project: "Een specifiek project uitvoeren", curious: "Nieuwsgierigheid" },
    timeline: { low: "1-3 uur per week", medium: "4-8 uur per week", high: "8-15 uur per week", fulltime: "Fulltime (bootcamp-intensiteit)" }
  };

  const questions = { role: "Huidige rol", python: "Python-ervaring", ai_experience: "AI & ML ervaring", goal: "Leerdoel", timeline: "Beschikbare tijd per week" };

  const answerText = Object.entries(answers)
    .map(([k, v]) => questions[k] + ": " + (labelMap[k]?.[v] || v))
    .join("\n");

  const prompt = "Je bent een leeradviseur van Amsterdam Data Academy (ADA), een gecertificeerde (NLQF niveau 6) data science & AI opleider in Nederland.\n\nEen bezoeker heeft de volgende vragen beantwoord:\n" + answerText + "\n\nGeef een CONCREET en PERSOONLIJK leeradvies. Structureer je antwoord EXACT als volgt in JSON:\n\n{\n  \"headline\": \"Een krachtige koptekst (max 10 woorden)\",\n  \"summary\": \"2-3 zinnen persoonlijk advies. Spreek hen aan met je/jij.\",\n  \"level\": \"Starter | Gevorderd | Expert\",\n  \"recommended_track\": \"Naam van het meest passende ADA-programma\",\n  \"track_description\": \"1-2 zinnen over dit programma\",\n  \"learning_path\": [\n    { \"step\": 1, \"title\": \"Stap titel\", \"duration\": \"x weken\", \"description\": \"Korte uitleg\" },\n    { \"step\": 2, \"title\": \"Stap titel\", \"duration\": \"x weken\", \"description\": \"Korte uitleg\" },\n    { \"step\": 3, \"title\": \"Stap titel\", \"duration\": \"x weken\", \"description\": \"Korte uitleg\" }\n  ],\n  \"skills_to_gain\": [\"Skill 1\", \"Skill 2\", \"Skill 3\", \"Skill 4\"],\n  \"cta_text\": \"Actieve CTA-zin (start met werkwoord, max 8 woorden)\"\n}\n\nADA programma's:\n- Data Science Bootcamp (12 weken intensief)\n- Applied AI & Data Science (NLQF 6, 12 maanden part-time)\n- Python voor Data-analyse (6 weken)\n- Machine Learning in de Praktijk (8 weken)\n- Data Engineering Fundament (8 weken)\n- AI Leadership voor Managers (4 weken)\n- B2B Team Upskilling (maatwerk)\n\nGeef ALLEEN de JSON terug, geen markdown, geen uitleg.";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: "Claude API error" });

    const text = data.content?.find(function(b) { return b.type === "text"; })?.text || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    res.json(JSON.parse(clean));
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Widget embed script
app.get("/skill-navigator.js", function(req, res) {
  const apiBase = process.env.API_BASE_URL || ("https://" + req.headers.host);
  const script = "(function() {" +
    "var c = document.createElement('div');" +
    "c.style.cssText = 'width:100%;max-width:420px;margin:0 auto;';" +
    "var s = document.currentScript || document.querySelector('script[src*=\"skill-navigator.js\"]');" +
    "s.parentNode.insertBefore(c, s.nextSibling);" +
    "var f = document.createElement('iframe');" +
    "f.src = '" + apiBase + "/widget';" +
    "f.style.cssText = 'width:100%;height:620px;border:none;border-radius:16px;box-shadow:0 8px 40px rgba(49,57,156,0.14);';" +
    "f.setAttribute('title','ADA AI Skill Navigator');" +
    "window.addEventListener('message',function(e){if(e.data&&e.data.type==='ada-widget-height'){f.style.height=(e.data.height+20)+'px';}});" +
    "c.appendChild(f);" +
    "})();";

  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(script);
});

// Widget HTML page (served in iframe)
app.get("/widget", function(req, res) {
  res.sendFile(path.join(__dirname, "public", "widget.html"));
});

app.listen(PORT, function() {
  console.log("ADA Skill Navigator running on port " + PORT);
});
