const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors()); // Allow all origins — widget wordt embedded op externe sites
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "ADA Skill Navigator Widget" });
});

// ─── Claude API proxy ─────────────────────────────────────────────────────────
// De API key zit ALLEEN op de server, nooit in de frontend
app.post("/api/analyze", async (req, res) => {
  const { answers } = req.body;

  if (!answers || typeof answers !== "object") {
    return res.status(400).json({ error: "Missing answers" });
  }

  // Bouw de prompt op basis van antwoorden
  const labelMap = {
    role: {
      analyst: "Data Analist / BI Specialist",
      developer: "Developer / Engineer",
      manager: "Manager / Team Lead",
      hr_ld: "HR / L&D Professional",
      career_switch: "Carrièreswitch naar data",
      other: "Anders / Nog studerend",
    },
    python: {
      none: "Geen ervaring",
      basic: "Basis — variabelen, loops, functies",
      intermediate: "Gevorderd — pandas, matplotlib",
      advanced: "Expert — ML libraries, productiecode",
    },
    ai_experience: {
      none: "Vrijwel geen — ik wil beginnen",
      conceptual: "Ik begrijp de concepten, maar bouw nog niet",
      practical: "Ik heb modellen getraind en geëvalueerd",
      deployed: "Ik heb AI-oplossingen in productie draaien",
    },
    goal: {
      job: "Een nieuwe baan in data/AI",
      promotion: "Doorgroeien in mijn huidige rol",
      team: "Mijn team upskillen (B2B)",
      project: "Een specifiek project uitvoeren",
      curious: "Nieuwsgierigheid — ik wil gewoon meer leren",
    },
    timeline: {
      low: "1-3 uur per week",
      medium: "4-8 uur per week",
      high: "8-15 uur per week",
      fulltime: "Fulltime (bootcamp-intensiteit)",
    },
  };

  const questions = {
    role: "Huidige rol",
    python: "Python-ervaring",
    ai_experience: "AI & ML ervaring",
    goal: "Leerdoel",
    timeline: "Beschikbare tijd per week",
  };

  const answerText = Object.entries(answers)
    .map(([key, val]) => {
      const label = labelMap[key]?.[val] || val;
      return `${questions[key]}: ${label}`;
    })
    .join("\n");

  const prompt = `Je bent een leeradviseur van Amsterdam Data Academy (ADA), een gecertificeerde (NLQF niveau 6) data science & AI opleider in Nederland.

Een bezoeker heeft de volgende vragen beantwoord:
${answerText}

Geef een CONCREET en PERSOONLIJK leeradvies. Structureer je antwoord EXACT als volgt in JSON:

{
  "headline": "Een krachtige, motiverende koptekst (max 10 woorden) die hun situatie raakt",
  "summary": "2-3 zinnen persoonlijk advies gebaseerd op hun antwoorden. Spreek hen direct aan met je/jij.",
  "level": "Starter | Gevorderd | Expert",
  "recommended_track": "Naam van het meest passende ADA-programma",
  "track_description": "1-2 zinnen over dit programma",
  "learning_path": [
    { "step": 1, "title": "Stap titel", "duration": "x weken", "description": "Korte uitleg" },
    { "step": 2, "title": "Stap titel", "duration": "x weken", "description": "Korte uitleg" },
    { "step": 3, "title": "Stap titel", "duration": "x weken", "description": "Korte uitleg" }
  ],
  "skills_to_gain": ["Skill 1", "Skill 2", "Skill 3", "Skill 4"],
  "cta_text": "Actieve CTA-zin (start met werkwoord, max 8 woorden)"
}

ADA programma's (gebruik deze namen):
- Data Science Bootcamp (12 weken intensief, Python + ML + AI)
- Applied AI & Data Science (NLQF 6, 12 maanden part-time, bachelor-niveau)
- Python voor Data-analyse (6 weken, basis-gevorderd)
- Machine Learning in de Praktijk (8 weken)
- Data Engineering Fundament (8 weken, pipelines + SQL + cloud)
- AI Leadership voor Managers (4 weken, niet-technisch)
- B2B Team Upskilling (maatwerk, voor teams)

Geef ALLEEN de JSON terug, geen markdown, geen uitleg.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // Haiku = snel + goedkoop voor widget
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("Claude API error:", data.error);
      return res.status(500).json({ error: "Claude API error" });
    }

    const text = data.content?.find((b) => b.type === "text")?.text || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const result = JSON.parse(clean);

    res.json(result);
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Widget JS bestand serveren ───────────────────────────────────────────────
// Dit is het bestand dat site-eigenaren embedden: <script src="https://widget.amsterdamdataacademy.com/skill-navigator.js">
app.get("/skill-navigator.js", (req, res) => {
  const apiBase = process.env.API_BASE_URL || `https://${req.headers.host}`;

  // Inline widget code — laadt als iframe op de site van de partner
  const widgetCode = `
(function() {
  // Maak container div aan
  var container = document.createElement('div');
  container.id = 'ada-skill-navigator';
  container.style.cssText = 'width:100%;max-width:420px;margin:0 auto;font-family:sans-serif;';

  // Vind het script-element en plaats de widget erna
  var scripts = document.querySelectorAll('script[src*="skill-navigator.js"]');
  var currentScript = scripts[scripts.length - 1];
  currentScript.parentNode.insertBefore(container, currentScript.nextSibling);

  // Laad de widget via iframe
  var iframe = document.createElement('iframe');
  iframe.src = '${apiBase}/widget';
  iframe.style.cssText = 'width:100%;height:600px;border:none;border-radius:16px;box-shadow:0 8px 40px rgba(49,57,156,0.14);';
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('title', 'ADA AI Skill Navigator');

  // Luister naar hoogte-aanpassingen van de iframe
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'ada-widget-height') {
      iframe.style.height = e.data.height + 'px';
    }
  });

  container.appendChild(iframe);
})();
`;

  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(widgetCode);
});

// ─── Widget HTML pagina (geladen in de iframe) ────────────────────────────────
app.get("/widget", (req, res) => {
  const apiBase = process.env.API_BASE_URL || `https://${req.headers.host}`;

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ADA Skill Navigator</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Nunito+Sans:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Nunito Sans', sans-serif; background: #fff; color: #2E2E2E; }

    .widget { max-width: 420px; margin: 0 auto; }

    /* Intro */
    .intro-header {
      background: linear-gradient(135deg, #242d82, #31399C);
      padding: 32px 24px 28px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .intro-header h1 { color: #fff; font-family: 'Montserrat', sans-serif; font-size: 22px; font-weight: 900; margin-bottom: 8px; }
    .intro-header p { color: rgba(255,255,255,0.8); font-size: 13px; line-height: 1.6; }
    .intro-body { padding: 24px; }
    .feature { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 13px; }

    /* Progress */
    .progress-wrap { padding: 20px 24px 0; }
    .progress-label { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; }
    .progress-label span:first-child { font-family: 'Montserrat', sans-serif; font-weight: 700; color: #31399C; letter-spacing: 0.06em; }
    .progress-bar { background: #E5E7EB; border-radius: 99px; height: 5px; }
    .progress-fill { background: linear-gradient(90deg, #31399C, #4650c4); height: 100%; border-radius: 99px; transition: width 0.4s ease; }

    /* Questions */
    .question-body { padding: 16px 24px 24px; }
    .question-body h2 { font-family: 'Montserrat', sans-serif; font-size: 16px; font-weight: 800; margin-bottom: 16px; line-height: 1.35; }
    .options { display: flex; flex-direction: column; gap: 8px; }
    .option {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px; border-radius: 10px; cursor: pointer;
      border: 2px solid #E5E7EB; background: #fff;
      transition: all 0.15s; text-align: left; width: 100%;
    }
    .option:hover { border-color: #4650c4; }
    .option.selected { border-color: #31399C; background: rgba(49,57,156,0.05); }
    .option-icon {
      width: 32px; height: 32px; border-radius: 8px;
      background: #F3F4F6; display: flex; align-items: center;
      justify-content: center; font-size: 17px; flex-shrink: 0;
      transition: background 0.15s;
    }
    .option.selected .option-icon { background: #31399C; }
    .option-label { font-size: 13px; color: #2E2E2E; font-weight: 500; line-height: 1.4; }
    .option.selected .option-label { color: #242d82; font-weight: 700; }
    .check { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; background: #31399C; display: none; align-items: center; justify-content: center; flex-shrink: 0; }
    .check svg { display: block; }
    .option.selected .check { display: flex; }

    /* Buttons */
    .btn {
      width: 100%; margin-top: 18px; padding: 14px 20px;
      border: none; border-radius: 10px; cursor: pointer;
      font-family: 'Montserrat', sans-serif; font-size: 14px;
      font-weight: 800; letter-spacing: 0.02em; transition: all 0.15s;
    }
    .btn-primary { background: #31399C; color: #fff; }
    .btn-primary:hover { background: #4650c4; }
    .btn-primary:disabled { background: #E5E7EB; color: #6B7280; cursor: default; }
    .btn-start { background: #31399C; color: #fff; }
    .btn-start:hover { background: #4650c4; }

    /* Loading */
    .loading { padding: 60px 24px; text-align: center; }
    .spinner {
      width: 48px; height: 48px; border-radius: 50%;
      border: 3px solid #E5E7EB; border-top-color: #31399C;
      animation: spin 0.8s linear infinite; margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading h3 { font-family: 'Montserrat', sans-serif; font-size: 15px; font-weight: 700; margin-bottom: 4px; }
    .loading p { font-size: 12px; color: #6B7280; }

    /* Result */
    .result-header {
      background: linear-gradient(135deg, #242d82, #31399C, #4650c4);
      padding: 24px 24px 20px;
    }
    .level-badge {
      display: inline-block; padding: 3px 10px; border-radius: 99px;
      font-size: 10px; font-weight: 800; letter-spacing: 0.08em;
      font-family: 'Montserrat', sans-serif; color: #fff;
      margin-bottom: 12px;
    }
    .result-header h2 { color: #fff; font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 800; margin-bottom: 10px; line-height: 1.3; }
    .result-header p { color: rgba(255,255,255,0.82); font-size: 13px; line-height: 1.6; }
    .result-body { padding: 20px 24px; }
    .track-box {
      background: rgba(249,213,113,0.2); border: 1.5px solid #F9D571;
      border-radius: 10px; padding: 14px 16px; margin-bottom: 18px;
    }
    .track-box .label { font-size: 10px; font-weight: 800; color: #92620a; letter-spacing: 0.08em; font-family: 'Montserrat', sans-serif; margin-bottom: 4px; }
    .track-box h3 { font-size: 15px; font-weight: 800; font-family: 'Montserrat', sans-serif; margin-bottom: 4px; }
    .track-box p { font-size: 12px; color: #6B4A1A; line-height: 1.5; }
    .section-label { font-size: 11px; font-weight: 800; color: #31399C; letter-spacing: 0.08em; font-family: 'Montserrat', sans-serif; margin-bottom: 12px; }
    .path-step { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; }
    .step-num {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      background: #31399C; color: #fff; display: flex; align-items: center;
      justify-content: center; font-family: 'Montserrat', sans-serif;
      font-size: 12px; font-weight: 800;
    }
    .step-title { font-size: 13px; font-weight: 700; }
    .step-badge {
      display: inline-block; font-size: 10px; color: #6B7280;
      background: #F3F4F6; padding: 2px 8px; border-radius: 99px; margin-left: 6px;
    }
    .step-desc { font-size: 12px; color: #6B7280; margin-top: 2px; line-height: 1.5; }
    .skills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
    .skill-pill {
      background: rgba(123,217,184,0.25); border: 1px solid #7BD9B8;
      color: #1a6b53; padding: 4px 12px; border-radius: 99px;
      font-size: 12px; font-weight: 700;
    }
    .btn-cta {
      display: block; width: 100%; padding: 14px 20px; background: #D75A48;
      color: #fff; text-align: center; border-radius: 10px; text-decoration: none;
      font-family: 'Montserrat', sans-serif; font-size: 14px; font-weight: 800;
      letter-spacing: 0.01em; margin-bottom: 10px; transition: background 0.15s;
    }
    .btn-cta:hover { background: #c4503f; }
    .btn-reset { background: none; border: none; color: #6B7280; font-size: 12px; cursor: pointer; text-decoration: underline; width: 100%; }

    /* Footer — verplichte backlink */
    .powered-by {
      border-top: 1px solid #E5E7EB; padding: 10px 24px;
      display: flex; align-items: center; justify-content: center;
      gap: 6px; background: #F9FAFB;
    }
    .powered-by span { font-size: 10px; color: #6B7280; }
    .powered-by a {
      font-size: 10px; font-weight: 800; color: #31399C;
      text-decoration: none; font-family: 'Montserrat', sans-serif;
      display: flex; align-items: center; gap: 4px;
    }
    .powered-by a:hover { text-decoration: underline; }

    /* Hidden by default */
    .screen { display: none; }
    .screen.active { display: block; }
  </style>
</head>
<body>
<div class="widget">

  <!-- INTRO -->
  <div class="screen active" id="screen-intro">
    <div class="intro-header">
      <div style="font-size:40px;margin-bottom:12px;">🧭</div>
      <h1>AI Skill Navigator</h1>
      <p>Beantwoord 5 korte vragen en ontdek welk leerpad het beste bij jou past.</p>
    </div>
    <div class="intro-body">
      <div class="feature"><span>⚡</span> Duurt maar 2 minuten</div>
      <div class="feature"><span>🎯</span> Persoonlijk advies op maat</div>
      <div class="feature"><span>🆓</span> Volledig gratis</div>
      <button class="btn btn-start" onclick="startWidget()">Start de check →</button>
    </div>
  </div>

  <!-- QUESTION -->
  <div class="screen" id="screen-question">
    <div class="progress-wrap">
      <div class="progress-label">
        <span id="q-counter">VRAAG 1 VAN 5</span>
        <span id="q-percent">0% compleet</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
    </div>
    <div class="question-body">
      <h2 id="q-text"></h2>
      <div class="options" id="options-container"></div>
      <button class="btn btn-primary" id="btn-next" disabled onclick="nextQuestion()">Volgende vraag →</button>
    </div>
  </div>

  <!-- LOADING -->
  <div class="screen" id="screen-loading">
    <div class="loading">
      <div class="spinner"></div>
      <h3>Jouw leerpad wordt samengesteld...</h3>
      <p>Onze AI analyseert jouw antwoorden</p>
    </div>
  </div>

  <!-- RESULT -->
  <div class="screen" id="screen-result">
    <div class="result-header">
      <div class="level-badge" id="result-level-badge"></div>
      <h2 id="result-headline"></h2>
      <p id="result-summary"></p>
    </div>
    <div class="result-body">
      <div class="track-box">
        <div class="label">AANBEVOLEN LEERTRAJECT</div>
        <h3 id="result-track"></h3>
        <p id="result-track-desc"></p>
      </div>
      <div class="section-label">JOUW LEERPAD</div>
      <div id="result-path" style="margin-bottom:18px;"></div>
      <div class="section-label">WAT JE LEERT</div>
      <div class="skills" id="result-skills"></div>
      <a href="https://www.amsterdamdataacademy.com" target="_blank" rel="noopener noreferrer" class="btn-cta" id="result-cta">Bekijk mijn opleidingen →</a>
      <button class="btn-reset" onclick="resetWidget()">Doe de check opnieuw</button>
    </div>
  </div>

  <!-- POWERED BY — altijd zichtbaar -->
  <div class="powered-by">
    <span>Mogelijk gemaakt door</span>
    <a href="https://www.amsterdamdataacademy.com" target="_blank" rel="noopener noreferrer">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="4" fill="#31399C"/>
        <path d="M6 18L12 6L18 18" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8.5 13.5H15.5" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>
      Amsterdam Data Academy
    </a>
  </div>
</div>

<script>
const API_BASE = "${apiBase}";

const QUESTIONS = [
  {
    id: "role", question: "Wat is jouw huidige rol?",
    options: [
      { value: "analyst", label: "Data Analist / BI Specialist", icon: "📊" },
      { value: "developer", label: "Developer / Engineer", icon: "💻" },
      { value: "manager", label: "Manager / Team Lead", icon: "👔" },
      { value: "hr_ld", label: "HR / L&D Professional", icon: "🎓" },
      { value: "career_switch", label: "Carrièreswitch naar data", icon: "🔄" },
      { value: "other", label: "Anders / Nog studerend", icon: "🌱" },
    ]
  },
  {
    id: "python", question: "Hoe zou je jouw Python-ervaring omschrijven?",
    options: [
      { value: "none", label: "Geen ervaring", icon: "🔰" },
      { value: "basic", label: "Basis — variabelen, loops, functies", icon: "📘" },
      { value: "intermediate", label: "Gevorderd — pandas, matplotlib", icon: "📗" },
      { value: "advanced", label: "Expert — ML libraries, productiecode", icon: "📙" },
    ]
  },
  {
    id: "ai_experience", question: "Wat is jouw ervaring met AI & Machine Learning?",
    options: [
      { value: "none", label: "Vrijwel geen — ik wil beginnen", icon: "🌱" },
      { value: "conceptual", label: "Ik begrijp de concepten, maar bouw nog niet", icon: "💡" },
      { value: "practical", label: "Ik heb modellen getraind en geëvalueerd", icon: "⚙️" },
      { value: "deployed", label: "Ik heb AI-oplossingen in productie draaien", icon: "🚀" },
    ]
  },
  {
    id: "goal", question: "Wat is jouw belangrijkste leerdoel?",
    options: [
      { value: "job", label: "Een nieuwe baan in data/AI", icon: "🎯" },
      { value: "promotion", label: "Doorgroeien in mijn huidige rol", icon: "📈" },
      { value: "team", label: "Mijn team upskillen (B2B)", icon: "👥" },
      { value: "project", label: "Een specifiek project uitvoeren", icon: "🛠️" },
      { value: "curious", label: "Nieuwsgierigheid — ik wil gewoon meer leren", icon: "🔍" },
    ]
  },
  {
    id: "timeline", question: "Hoeveel tijd kun je per week investeren?",
    options: [
      { value: "low", label: "1-3 uur per week", icon: "⏱️" },
      { value: "medium", label: "4-8 uur per week", icon: "⏰" },
      { value: "high", label: "8-15 uur per week", icon: "🕐" },
      { value: "fulltime", label: "Fulltime (bootcamp-intensiteit)", icon: "🔥" },
    ]
  }
];

let currentStep = 0;
let answers = {};
let selectedValue = null;

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  sendHeight();
}

function sendHeight() {
  setTimeout(() => {
    window.parent.postMessage({ type: 'ada-widget-height', height: document.body.scrollHeight + 20 }, '*');
  }, 50);
}

function startWidget() {
  currentStep = 0;
  answers = {};
  selectedValue = null;
  renderQuestion();
  show('question');
}

function renderQuestion() {
  const q = QUESTIONS[currentStep];
  const total = QUESTIONS.length;
  const pct = Math.round(((currentStep) / total) * 100);

  document.getElementById('q-counter').textContent = 'VRAAG ' + (currentStep + 1) + ' VAN ' + total;
  document.getElementById('q-percent').textContent = pct + '% compleet';
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('q-text').textContent = q.question;

  const container = document.getElementById('options-container');
  container.innerHTML = '';

  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.innerHTML = \`
      <span class="option-icon">\${opt.icon}</span>
      <span class="option-label">\${opt.label}</span>
      <span class="check"><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    \`;
    btn.onclick = () => selectOption(btn, opt.value);
    container.appendChild(btn);
  });

  selectedValue = null;
  const nextBtn = document.getElementById('btn-next');
  nextBtn.disabled = true;
  nextBtn.textContent = currentStep === QUESTIONS.length - 1 ? 'Bekijk mijn leerpad →' : 'Volgende vraag →';
}

function selectOption(btn, value) {
  document.querySelectorAll('.option').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedValue = value;
  document.getElementById('btn-next').disabled = false;
}

async function nextQuestion() {
  if (!selectedValue) return;
  answers[QUESTIONS[currentStep].id] = selectedValue;

  if (currentStep < QUESTIONS.length - 1) {
    currentStep++;
    renderQuestion();
  } else {
    show('loading');
    await getAdvice();
  }
}

async function getAdvice() {
  try {
    const response = await fetch(API_BASE + '/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });
    const result = await response.json();
    renderResult(result);
    show('result');
  } catch (err) {
    alert('Er ging iets mis. Probeer het opnieuw.');
    show('intro');
  }
}

function renderResult(r) {
  const levelColors = { Starter: '#D75A48', Gevorderd: '#31399C', Expert: '#059669' };
  const badge = document.getElementById('result-level-badge');
  badge.textContent = (r.level || 'Gevorderd').toUpperCase();
  badge.style.background = levelColors[r.level] || '#31399C';

  document.getElementById('result-headline').textContent = r.headline || '';
  document.getElementById('result-summary').textContent = r.summary || '';
  document.getElementById('result-track').textContent = r.recommended_track || '';
  document.getElementById('result-track-desc').textContent = r.track_description || '';

  const pathEl = document.getElementById('result-path');
  pathEl.innerHTML = (r.learning_path || []).map(s => \`
    <div class="path-step">
      <div class="step-num">\${s.step}</div>
      <div>
        <div class="step-title">\${s.title}<span class="step-badge">\${s.duration}</span></div>
        <div class="step-desc">\${s.description}</div>
      </div>
    </div>
  \`).join('');

  const skillsEl = document.getElementById('result-skills');
  skillsEl.innerHTML = (r.skills_to_gain || []).map(s => \`<span class="skill-pill">\${s}</span>\`).join('');

  document.getElementById('result-cta').textContent = r.cta_text || 'Bekijk mijn opleidingen →';
}

function resetWidget() {
  currentStep = 0;
  answers = {};
  selectedValue = null;
  show('intro');
}

// Stuur initiële hoogte door
window.addEventListener('load', sendHeight);
</script>
</body>
</html>`);
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(\`ADA Skill Navigator Widget server running on port \${PORT}\`);
});
