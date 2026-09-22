# ADA AI Skill Navigator

An embeddable quiz widget for [Amsterdam Data Academy](https://www.amsterdamdataacademy.com). Visitors answer 5 questions (field of work, Python level, AI experience, goal, available time) and get a learning path grounded in ADA's live course catalogue, with a direct link to the recommended programme.

## How it works (v4, no server)

```
Airtable (Products + AI Skills)
   |  daily GitHub Action (scripts/build-catalog.mjs)
   v
docs/catalog.json  ->  GitHub Pages (docs/)  ->  <script src=".../embed.js"> on any site
                                                 -> visitor's browser computes the advice
```

- **Source of truth:** the `Products` (Published + Active) and `AI Skills` (Active) tables in the Operations base `apprFBMEVPG6yeee0`. Edit courses and skills there; nothing in this repo needs to change.
- **Daily sync:** `.github/workflows/update-catalog.yml` runs every day at 04:00 UTC (or manually via *Actions > Run workflow*), pulls the catalogue and commits `docs/catalog.json` only when something changed. It refuses to overwrite the file if Airtable returns suspiciously little data.
- **No backend:** the widget (`docs/index.html`) loads `catalog.json` and matches the answers against the skills' *Relevant for roles* / *Relevant for goals* tags in the browser. No API keys are exposed and no visitor answers are stored.
- **Embed:** `docs/embed.js` injects an iframe and resizes it to fit each screen.

## Setup (one time)

1. **Airtable token:** create a Personal Access Token with scope `data.records:read` on base `apprFBMEVPG6yeee0`, and add it in GitHub under *Settings > Secrets and variables > Actions* as `AIRTABLE_TOKEN`.
2. **GitHub Pages:** *Settings > Pages > Deploy from a branch > `main` / `docs`*. Pages on a private repository requires a paid GitHub plan; otherwise make the repo public (it contains no secrets).
3. **Photo:** replace `docs/hero.jpg` with the licensed, watermark-free version of the stock photo (same ratio, 800x598 or larger).
4. Run the workflow once manually to fill `catalog.json` from Airtable.

## Embedding

```html
<script src="https://<user>.github.io/ada-skill-navigator-widget/embed.js" async></script>
```

Optionally place `<div id="ada-skill-navigator"></div>` where the widget should appear; otherwise it renders right after the script tag. Works in WordPress (Custom HTML block), Webflow, etc.

## Field-of-work values

The first question maps to these values in the *Relevant for roles* field: `marketing`, `finance`, `legal`, `hr_ld`, `sales`, `operations`, `management`, `tech`, `career_switch`. When adding a skill in Airtable, tag every field of work it is relevant for.

## Legacy server (optional)

`server.js` is the earlier Express/Railway variant that adds a live Claude-written advice text. It is not needed for the widget above; keep it only if you want AI-generated copy per visitor (requires `ANTHROPIC_API_KEY` and `AIRTABLE_TOKEN`).

## Design notes

Brand colours (indigo `#31399C`, logo red `#D7031C`), Montserrat + Nunito Sans, no emoji and no em-dashes in copy, keyboard support (1-9 to pick, Enter to continue, Backspace to go back).
