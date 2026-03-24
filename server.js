const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", function(req, res) {
  res.json({ status: "ok", service: "ADA Skill Navigator Widget" });
});

app.post("/api/analyze", async function(req, res) {
  const answers = req.body && req.body.answers;
  if (!answers) return res.status(400).json({ error: "Missing answers" });

  const labels = {
    role: { analyst: "Data Analist", developer: "Developer", manager: "Manager", hr_ld: "HR/L&D", career_switch: "Carrieswitch", other: "Anders" },
    python: { none: "Geen ervaring", basic: "Basis", intermediate: "Gevorderd", advanced: "Expert" },
    ai_experience: { none: "Vrijwel geen", conceptual: "Conceptueel", practical: "Praktisch", deployed: "In productie" },
    goal: { job: "Nieuwe baan", promotion: "Doorgroeien", team: "Team upskillen", project: "Project", curious: "Nieuwsgierigheid" },
    timeline: { low: "1-3u/week", medium: "4-8u/week", high: "8-15u/week", fulltime: "Fulltime" }
  };

  const text = Object.keys(answers).map(function(k) {
    return k + ": " + (labels[k] && labels[k][answers[k]] ? labels[k][answers[k]] : answers[k]);
  }).join(", ");

  const prompt = "Je bent leeradviseur van Amsterdam Data Academy (ADA, NLQF niveau 6). Bezoeker: " + text + ". Geef persoonlijk leeradvies ALLEEN als JSON zonder markdown: {\"headline\":\"max 10 woorden\",\"summary\":\"2-3 zinnen met je/jij\",\"level\":\"Starter of Gevorderd of Expert\",\"recommended_track\":\"programmanaam\",\"track_description\":\"1-2 zinnen\",\"learning_path\":[{\"step\":1,\"title\":\"titel\",\"duration\":\"x weken\",\"description\":\"uitleg\"},{\"step\":2,\"title\":\"titel\",\"duration\":\"x weken\",\"description\":\"uitleg\"},{\"step\":3,\"title\":\"titel\",\"duration\":\"x weken\",\"description\":\"uitleg\"}],\"skills_to_gain\":[\"s1\",\"s2\",\"s3\",\"s4\"],\"cta_text\":\"CTA max 8 woorden\"}. Programmas: Data Science Bootcamp (12w), Applied AI & Data Science NLQF6 (12mnd), Python voor Data-analyse (6w), Machine Learning (8w), Data Engineering (8w), AI Leadership (4w), B2B Maatwerk.";

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
    });
    const data = await r.json();
    if (data.error) { console.error("Claude error:", data.error); return res.status(500).json({ error: "API error" }); }
    const raw = ((data.content || []).find(function(b) { return b.type === "text"; }) || {}).text || "{}";
    res.json(JSON.parse(raw.replace(/```json|```/g, "").trim()));
  } catch(e) {
    console.error("Error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/skill-navigator.js", function(req, res) {
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

app.get("/widget", function(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(HTML);
});

var HTML = '<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ADA Skill Navigator</title>' +
'<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Nunito+Sans:wght@400;500;700&display=swap" rel="stylesheet">' +
'<style>' +
'*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Nunito Sans",sans-serif;background:#fff;color:#2E2E2E}' +
'.screen{display:none}.screen.active{display:block}' +
'.ih{background:linear-gradient(135deg,#242d82,#31399C);padding:32px 24px 28px;text-align:center}' +
'.ih h1{color:#fff;font-family:"Montserrat",sans-serif;font-size:22px;font-weight:900;margin-bottom:8px}' +
'.ih p{color:rgba(255,255,255,0.8);font-size:13px;line-height:1.6}' +
'.ib{padding:24px}.feat{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:13px}' +
'.pw-wrap{padding:20px 24px 0}.pl{display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px}' +
'.pl span:first-child{font-family:"Montserrat",sans-serif;font-weight:700;color:#31399C;letter-spacing:.06em}' +
'.pb{background:#E5E7EB;border-radius:99px;height:5px}' +
'.pf{background:linear-gradient(90deg,#31399C,#4650c4);height:100%;border-radius:99px;transition:width .4s ease}' +
'.qb{padding:16px 24px 24px}' +
'.qb h2{font-family:"Montserrat",sans-serif;font-size:16px;font-weight:800;margin-bottom:16px;line-height:1.35}' +
'.opts{display:flex;flex-direction:column;gap:8px}' +
'.opt{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;cursor:pointer;border:2px solid #E5E7EB;background:#fff;transition:all .15s;text-align:left;width:100%}' +
'.opt:hover{border-color:#4650c4}.opt.sel{border-color:#31399C;background:rgba(49,57,156,.05)}' +
'.oi{width:32px;height:32px;border-radius:8px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}' +
'.opt.sel .oi{background:#31399C}' +
'.ol{font-size:13px;color:#2E2E2E;font-weight:500;line-height:1.4}' +
'.opt.sel .ol{color:#242d82;font-weight:700}' +
'.ck{margin-left:auto;width:20px;height:20px;border-radius:50%;background:#31399C;display:none;align-items:center;justify-content:center;flex-shrink:0}' +
'.opt.sel .ck{display:flex}' +
'.btn{width:100%;margin-top:18px;padding:14px 20px;border:none;border-radius:10px;cursor:pointer;font-family:"Montserrat",sans-serif;font-size:14px;font-weight:800;letter-spacing:.02em;transition:all .15s}' +
'.btnp{background:#31399C;color:#fff}.btnp:hover{background:#4650c4}.btnp:disabled{background:#E5E7EB;color:#6B7280;cursor:default}' +
'.ld{padding:60px 24px;text-align:center}' +
'.sp{width:48px;height:48px;border-radius:50%;border:3px solid #E5E7EB;border-top-color:#31399C;animation:spin .8s linear infinite;margin:0 auto 16px}' +
'@keyframes spin{to{transform:rotate(360deg)}}' +
'.ld h3{font-family:"Montserrat",sans-serif;font-size:15px;font-weight:700;margin-bottom:4px}.ld p{font-size:12px;color:#6B7280}' +
'.rh{background:linear-gradient(135deg,#242d82,#31399C,#4650c4);padding:24px 24px 20px}' +
'.lv{display:inline-block;padding:3px 10px;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.08em;font-family:"Montserrat",sans-serif;color:#fff;margin-bottom:12px}' +
'.rh h2{color:#fff;font-family:"Montserrat",sans-serif;font-size:18px;font-weight:800;margin-bottom:10px;line-height:1.3}' +
'.rh p{color:rgba(255,255,255,.82);font-size:13px;line-height:1.6}' +
'.rb{padding:20px 24px}' +
'.tb{background:rgba(249,213,113,.2);border:1.5px solid #F9D571;border-radius:10px;padding:14px 16px;margin-bottom:18px}' +
'.tl{font-size:10px;font-weight:800;color:#92620a;letter-spacing:.08em;font-family:"Montserrat",sans-serif;margin-bottom:4px}' +
'.tb h3{font-size:15px;font-weight:800;font-family:"Montserrat",sans-serif;margin-bottom:4px}' +
'.tb p{font-size:12px;color:#6B4A1A;line-height:1.5}' +
'.sl{font-size:11px;font-weight:800;color:#31399C;letter-spacing:.08em;font-family:"Montserrat",sans-serif;margin-bottom:12px}' +
'.ps{display:flex;gap:12px;margin-bottom:12px;align-items:flex-start}' +
'.sn{width:28px;height:28px;border-radius:50%;flex-shrink:0;background:#31399C;color:#fff;display:flex;align-items:center;justify-content:center;font-family:"Montserrat",sans-serif;font-size:12px;font-weight:800}' +
'.st{font-size:13px;font-weight:700}.sd2{display:inline-block;font-size:10px;color:#6B7280;background:#F3F4F6;padding:2px 8px;border-radius:99px;margin-left:6px}' +
'.dd{font-size:12px;color:#6B7280;margin-top:2px;line-height:1.5}' +
'.sks{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px}' +
'.sk{background:rgba(123,217,184,.25);border:1px solid #7BD9B8;color:#1a6b53;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700}' +
'.ct{display:block;width:100%;padding:14px 20px;background:#D75A48;color:#fff;text-align:center;border-radius:10px;text-decoration:none;font-family:"Montserrat",sans-serif;font-size:14px;font-weight:800;margin-bottom:10px}' +
'.ct:hover{background:#c4503f}' +
'.rs{background:none;border:none;color:#6B7280;font-size:12px;cursor:pointer;text-decoration:underline;width:100%}' +
'.pw{border-top:1px solid #E5E7EB;padding:10px 24px;display:flex;align-items:center;justify-content:center;gap:6px;background:#F9FAFB}' +
'.pw span{font-size:10px;color:#6B7280}' +
'.pw a{font-size:10px;font-weight:800;color:#31399C;text-decoration:none;font-family:"Montserrat",sans-serif;display:flex;align-items:center;gap:4px}' +
'.pw a:hover{text-decoration:underline}' +
'</style></head><body>' +
'<div id="si" class="screen active">' +
'<div class="ih"><div style="font-size:40px;margin-bottom:12px">🧭</div>' +
'<h1>AI Skill Navigator</h1><p>Beantwoord 5 korte vragen en ontdek welk leerpad het beste bij jou past.</p></div>' +
'<div class="ib"><div class="feat"><span>⚡</span> Duurt maar 2 minuten</div>' +
'<div class="feat"><span>🎯</span> Persoonlijk advies op maat</div>' +
'<div class="feat"><span>🆓</span> Volledig gratis</div>' +
'<button class="btn btnp" onclick="go()">Start de check &#8594;</button></div></div>' +
'<div id="sq" class="screen">' +
'<div class="pw-wrap"><div class="pl"><span id="qc">VRAAG 1 VAN 5</span><span id="qp">0% compleet</span></div>' +
'<div class="pb"><div class="pf" id="pf" style="width:0%"></div></div></div>' +
'<div class="qb"><h2 id="qt"></h2><div class="opts" id="oc"></div>' +
'<button class="btn btnp" id="bn" disabled onclick="nxt()">Volgende vraag &#8594;</button></div></div>' +
'<div id="sl" class="screen"><div class="ld"><div class="sp"></div>' +
'<h3>Jouw leerpad wordt samengesteld...</h3><p>Onze AI analyseert jouw antwoorden</p></div></div>' +
'<div id="sr" class="screen">' +
'<div class="rh"><div class="lv" id="lv"></div><h2 id="rh2"></h2><p id="rp2"></p></div>' +
'<div class="rb"><div class="tb"><div class="tl">AANBEVOLEN LEERTRAJECT</div><h3 id="rt"></h3><p id="rd"></p></div>' +
'<div class="sl">JOUW LEERPAD</div><div id="rpa" style="margin-bottom:18px"></div>' +
'<div class="sl">WAT JE LEERT</div><div class="sks" id="rsk"></div>' +
'<a href="https://www.amsterdamdataacademy.com" target="_blank" rel="noopener noreferrer" class="ct" id="rc">Bekijk mijn opleidingen &#8594;</a>' +
'<button class="rs" onclick="rst()">Doe de check opnieuw</button></div></div>' +
'<div class="pw"><span>Mogelijk gemaakt door</span>' +
'<a href="https://www.amsterdamdataacademy.com" target="_blank" rel="noopener noreferrer">' +
'<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#31399C"/>' +
'<path d="M6 18L12 6L18 18" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
'<path d="M8.5 13.5H15.5" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>' +
'Amsterdam Data Academy</a></div>' +
'<script>' +
'var Q=[' +
'{id:"role",q:"Wat is jouw huidige rol?",o:[{v:"analyst",l:"Data Analist / BI Specialist",i:"📊"},{v:"developer",l:"Developer / Engineer",i:"💻"},{v:"manager",l:"Manager / Team Lead",i:"👔"},{v:"hr_ld",l:"HR / L&D Professional",i:"🎓"},{v:"career_switch",l:"Carri\u00e8reswitch naar data",i:"🔄"},{v:"other",l:"Anders / Nog studerend",i:"🌱"}]},' +
'{id:"python",q:"Hoe zou je jouw Python-ervaring omschrijven?",o:[{v:"none",l:"Geen ervaring",i:"🔰"},{v:"basic",l:"Basis \u2014 variabelen, loops",i:"📘"},{v:"intermediate",l:"Gevorderd \u2014 pandas, matplotlib",i:"📗"},{v:"advanced",l:"Expert \u2014 ML libraries",i:"📙"}]},' +
'{id:"ai_experience",q:"Wat is jouw ervaring met AI & Machine Learning?",o:[{v:"none",l:"Vrijwel geen \u2014 ik wil beginnen",i:"🌱"},{v:"conceptual",l:"Ik begrijp de concepten",i:"💡"},{v:"practical",l:"Ik heb modellen getraind",i:"⚙️"},{v:"deployed",l:"AI in productie draaien",i:"🚀"}]},' +
'{id:"goal",q:"Wat is jouw belangrijkste leerdoel?",o:[{v:"job",l:"Nieuwe baan in data/AI",i:"🎯"},{v:"promotion",l:"Doorgroeien in huidige rol",i:"📈"},{v:"team",l:"Mijn team upskillen",i:"👥"},{v:"project",l:"Een specifiek project",i:"🛠️"},{v:"curious",l:"Gewoon meer leren",i:"🔍"}]},' +
'{id:"timeline",q:"Hoeveel tijd kun je per week investeren?",o:[{v:"low",l:"1-3 uur per week",i:"⏱️"},{v:"medium",l:"4-8 uur per week",i:"⏰"},{v:"high",l:"8-15 uur per week",i:"🕐"},{v:"fulltime",l:"Fulltime intensiteit",i:"🔥"}]}' +
'];' +
'var step=0,ans={},sel=null;' +
'function show(id){document.querySelectorAll(".screen").forEach(function(s){s.classList.remove("active")});document.getElementById("s"+id).classList.add("active");setTimeout(function(){window.parent.postMessage({type:"ada-widget-height",height:document.body.scrollHeight},"*")},80)}' +
'function go(){step=0;ans={};sel=null;render();show("q")}' +
'function render(){var q=Q[step],pct=Math.round(step/Q.length*100);' +
'document.getElementById("qc").textContent="VRAAG "+(step+1)+" VAN "+Q.length;' +
'document.getElementById("qp").textContent=pct+"% compleet";' +
'document.getElementById("pf").style.width=pct+"%";' +
'document.getElementById("qt").textContent=q.q;' +
'var oc=document.getElementById("oc");oc.innerHTML="";' +
'q.o.forEach(function(o){var b=document.createElement("button");b.className="opt";' +
'b.innerHTML="<span class=oi>"+o.i+"</span><span class=ol>"+o.l+"</span><span class=ck><svg width=10 height=8 viewBox=\'0 0 10 8\' fill=none><path d=\'M1 4L3.5 6.5L9 1\' stroke=white stroke-width=2 stroke-linecap=round stroke-linejoin=round/></svg></span>";' +
'b.onclick=function(){document.querySelectorAll(".opt").forEach(function(x){x.classList.remove("sel")});b.classList.add("sel");sel=o.v;document.getElementById("bn").disabled=false};' +
'oc.appendChild(b)});' +
'sel=null;var bn=document.getElementById("bn");bn.disabled=true;bn.textContent=step===Q.length-1?"Bekijk mijn leerpad \u2192":"Volgende vraag \u2192"}' +
'function nxt(){if(!sel)return;ans[Q[step].id]=sel;if(step<Q.length-1){step++;render()}else{show("l");analyze()}}' +
'function analyze(){fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({answers:ans})}).then(function(r){return r.json()}).then(function(d){renderR(d);show("r")}).catch(function(){alert("Er ging iets mis. Probeer opnieuw.");show("i")})}' +
'function renderR(r){var lc={Starter:"#D75A48",Gevorderd:"#31399C",Expert:"#059669"};' +
'var lb=document.getElementById("lv");lb.textContent=(r.level||"Gevorderd").toUpperCase();lb.style.background=lc[r.level]||"#31399C";' +
'document.getElementById("rh2").textContent=r.headline||"";' +
'document.getElementById("rp2").textContent=r.summary||"";' +
'document.getElementById("rt").textContent=r.recommended_track||"";' +
'document.getElementById("rd").textContent=r.track_description||"";' +
'document.getElementById("rpa").innerHTML=(r.learning_path||[]).map(function(s){return"<div class=ps><div class=sn>"+s.step+"</div><div><div class=st>"+s.title+"<span class=sd2>"+s.duration+"</span></div><div class=dd>"+s.description+"</div></div></div>"}).join("");' +
'document.getElementById("rsk").innerHTML=(r.skills_to_gain||[]).map(function(s){return"<span class=sk>"+s+"</span>"}).join("");' +
'document.getElementById("rc").textContent=r.cta_text||"Bekijk mijn opleidingen \u2192"}' +
'function rst(){step=0;ans={};sel=null;show("i")}' +
'window.addEventListener("load",function(){window.parent.postMessage({type:"ada-widget-height",height:document.body.scrollHeight},"*")});' +
'</script></body></html>';

app.listen(PORT, function() {
  console.log("ADA Skill Navigator running on port " + PORT);
});
