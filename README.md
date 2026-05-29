# ADA Skill Navigator Widget

An embeddable quiz widget for [Amsterdam Data Academy](https://www.amsterdamdataacademy.com) that guides visitors through 5 questions about their background and goals, then returns a personalised learning path recommendation — currently powered by the Claude API.

> **Note:** As discussed in [Do you even need the API?](#do-you-even-need-the-api), this widget's output is fully predictable from a fixed set of inputs. A future version could eliminate the live API call entirely in favour of a pre-generated lookup table — faster, cheaper, and simpler to deploy.

---

## Table of contents

1. [What is this?](#what-is-this)
2. [How it works](#how-it-works)
3. [Getting started](#getting-started)
4. [Deploying](#deploying)
5. [Embedding on your site](#embedding-on-your-site)
6. [Do you even need the API?](#do-you-even-need-the-api)
7. [Security assessment](#security-assessment)
8. [Roadmap](#roadmap)

---

## What is this?

The ADA Skill Navigator is a lightweight embeddable widget you drop onto any webpage with a single `<script>` tag. Visitors answer 5 multiple-choice questions (role, Python level, AI experience, learning goal, available time), and receive a tailored recommendation: a skill level badge, a suggested programme, a 3-step learning path, and a call to action — all in Dutch, all on-brand for ADA.

---

## How it works

1. A visitor lands on an ADA webpage that includes the embed script.
2. An `<iframe>` is injected, loading the quiz from this server's `/widget` endpoint.
3. The visitor completes 5 questions. On submit, the iframe POSTs their answers to `/api/analyze`.
4. The server builds a prompt and calls the Claude API, which returns a structured JSON recommendation.
5. The result is rendered inside the iframe. The iframe auto-resizes via `postMessage` so it fits neatly on the host page.

The entire widget — HTML, CSS, and JavaScript — is served as a single self-contained response from the server. No frontend build step required.

---

## Getting started

**Prerequisites:** Node.js 18+, an Anthropic API key.

```bash
# Install dependencies
npm install

# Set your API key
export ANTHROPIC_API_KEY=your_key_here

# Start the server
npm start
```

Then open [http://localhost:3000/widget](http://localhost:3000/widget) to see the quiz, or hit `GET /` for a health check.

---

## Deploying

The repo includes a `railway.json` config. To deploy on [Railway](https://railway.app):

1. Connect the repo to a new Railway project.
2. Set the `ANTHROPIC_API_KEY` environment variable in the Railway dashboard.
3. Deploy — Railway will detect Node.js and run `node server.js` automatically.

---

## Embedding on your site

Add one script tag where you want the widget to appear:

```html
<script src="https://your-deployment.railway.app/skill-navigator.js"></script>
```

The script injects a responsive `<iframe>` (max-width 440px) that auto-resizes to fit its content.

---

## Do you even need the API?

The current implementation calls the Claude API on every quiz submission. But look at the input space:

| Question | Options |
|---|---|
| Role | 6 |
| Python experience | 4 |
| AI experience | 4 |
| Learning goal | 5 |
| Time per week | 4 |

**6 × 4 × 4 × 5 × 4 = 1,920 possible combinations.** That's a small, fully enumerable set. The Claude prompt itself asks for a fixed JSON structure — it isn't having a conversation or doing anything that requires real-time inference. This is a decision tree wearing an AI costume.

### Two approaches compared

| | Live API (current) | Pre-generated lookup table |
|---|---|---|
| **Response time** | ~1–3s (network + inference) | Instant |
| **Cost** | Per-request API charges | One-time generation cost |
| **Reliability** | Depends on Anthropic uptime | No external dependency |
| **Deployment** | Requires a server + API key | Can be a static site (no server) |
| **Wording variety** | Slight variation per call | Fixed copy |
| **Maintenance** | No content to maintain | Content lives in a JSON file |
| **Personalisation** | Effectively none (fixed template) | Same |

### Roadmap to migrate

1. **Generate all 1,920 responses using Claude Code** — no API key or API costs required. Write a generation script and run it once interactively in a Claude Code session. Claude iterates every combination of answers and writes the results to `responses.json`. You review the copy, tweak anything that feels off, and commit the file. That's the entire content pipeline.
2. **Replace the API call** — swap the `POST /api/analyze` handler for a lookup against `responses.json` using the 5 answer values as a composite key (e.g. `analyst|intermediate|practical|job|medium`).
3. **Optional: go fully static** — if the server's only job is serving the widget and doing lookups, the whole thing can become a static HTML file with the lookup table embedded inline. No server, no API key, no running costs.

This migration is low-risk: the current and future outputs are structurally identical. Steps 1 and 2 can be done in an afternoon.

### What the lookup table looks like

A flat JSON file, one entry per combination. Unminified it's roughly 200–400KB — small enough to embed directly in the widget script if you go static. Each key is the 5 answers joined by a pipe:

```json
{
  "analyst|none|none|job|low": {
    "headline": "Begin met de basics van data",
    "summary": "Je hebt een sterke basis nodig voordat je solliciteert. Met 1-3 uur per week bouw je stap voor stap aan de juiste skills.",
    "level": "Starter",
    "recommended_track": "Python voor Data-analyse",
    "track_description": "Een praktische 6-weken cursus waarmee je leert werken met echte datasets.",
    "learning_path": [
      { "step": 1, "title": "Python basics", "duration": "2 weken", "description": "Variabelen, loops en functies in de context van data." },
      { "step": 2, "title": "Data verkennen met pandas", "duration": "2 weken", "description": "Inladen, filteren en samenvatten van datasets." },
      { "step": 3, "title": "Visualiseren en presenteren", "duration": "2 weken", "description": "Grafieken maken en je bevindingen helder communiceren." }
    ],
    "skills_to_gain": ["Python", "pandas", "datavisualisatie", "analytisch denken"],
    "cta_text": "Bekijk Python voor Data-analyse"
  },
  "analyst|none|none|job|medium": {
    ...
  }
}
```

A lookup at runtime is a single property access: `responses[role + "|" + python + "|" + ai_experience + "|" + goal + "|" + timeline]`.

### Why not use building blocks and string concatenation instead?

It's tempting to spot the overlap between combinations and factor out shared fragments — a "Starter" headline here, a generic CTA there — and concatenate them at runtime instead of storing 1,920 full entries.

Don't. Here's why:

- **Dutch doesn't compose cleanly.** Grammar, gender agreement, and sentence flow mean that fragments that read fine in isolation produce awkward copy in some combinations. You won't catch all of them until a real person reads the output.
- **The overlap is shallower than it looks.** The fields that vary most — recommended track, learning path steps, track description — are exactly the specific content you care about. The fields that might share copy (CTA text, level badge) are trivial to deduplicate at *generation time* as a data normalisation step, not at runtime as assembly logic.
- **You'd be building a mini CMS.** String-assembly logic with conditionals is a new surface to maintain and test. A flat JSON file edited by a human is not.
- **200–400KB unminified is not a problem.** There is no performance pressure that justifies the complexity. If you want to deduplicate for cleanliness, do it in the generation script and store normalised data — keep the runtime lookup dumb.

---

## Security assessment

*Analysis performed May 29 2026.*

### What's good

- **No hardcoded secrets.** The Anthropic API key is read from an environment variable (`process.env.ANTHROPIC_API_KEY`). Nothing sensitive is committed to the repo.

### Risks in the current version

**1. No rate limiting**
Anyone who can reach the server can spam `POST /api/analyze` indefinitely, burning through API credits. There is no authentication, no per-IP throttling, and no request cap.

**2. Open CORS policy**
`cors()` is applied with no configuration, meaning any origin can call `/api/analyze`. This is fine for a public widget but worth tightening if the endpoint ever does anything more sensitive.

**3. Loose input validation**
The `answers` object from the request body is mapped directly into the Claude prompt without sanitisation. Since it goes to Claude rather than a database or shell, the injection risk is low — but a caller could send unexpectedly large values or attempt prompt manipulation.

**4. Unguarded `JSON.parse`**
The Claude response is parsed with `JSON.parse` inside a `try/catch` at the outer level, but the `.replace()` stripping of markdown fences (`` ```json `` etc.) runs before the parse without its own guard. If Claude returns something unexpected, this will throw and the outer catch will return a 500. Not a security issue, but a stability one.

### Overall

Safe to run locally with no changes. Before putting real traffic through it, rate limiting (risk #1) is the most important thing to address.

---

## Roadmap

### Stability
- Wrap the `JSON.parse` call in its own try/catch with a meaningful fallback
- Add a timeout to the Claude API fetch so a slow response doesn't hang the server indefinitely

### Security
- Add per-IP rate limiting (e.g. `express-rate-limit`) on `/api/analyze`
- Restrict CORS to known ADA domains once the embed URL is fixed
- Validate and truncate incoming `answers` values before inserting into the prompt

### Product
- Migrate to a pre-generated lookup table (see [Do you even need the API?](#do-you-even-need-the-api))
- Track quiz completions and recommended tracks (anonymised) for ADA to understand visitor intent
- Support English alongside Dutch
- A/B test different question sets or recommendation framings

### Developer experience
- Extract the inline HTML/CSS/JS string into separate source files with a build step
- Add a `.env.example` file so setup is self-documenting
- Add a dev watch mode (`nodemon` or equivalent)
- Add environment-based config (dev vs. production API base URL)
