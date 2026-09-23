/* Basisstijl van de Skill Navigator hergebruiken, zodat alle varianten er hetzelfde uitzien */
fetch("../index.html").then(function(r){return r.text()}).then(function(h){var m=h.match(/<style>([\s\S]*?)<\/style>/);if(m){var st=document.createElement("style");st.textContent=m[1].replace(/#ada-widget/g,".adaw");var l=document.querySelector('link[href*="calc.css"]');document.head.insertBefore(st,l)}}).catch(function(){}).then(function(){document.documentElement.style.visibility=""});
setTimeout(function(){document.documentElement.style.visibility=""},2500);
var PRODUCTS=[],SKILLS=[];
var LOGO="../logo.png";
var CHECK='<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var BACK='<svg viewBox="0 0 20 20" fill="none"><path d="M12.5 4.5L6 10L12.5 15.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function esc(t){return String(t==null?"":t).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function nd(t){return String(t||"").replace(/\s*—\s*/g,", ")}
function eurFmt(n){var r=Math.round(n/100)*100;return "€ "+r.toLocaleString("nl-NL")}

var ROLE_Q={id:"role",q:"In welk vakgebied werk je?",o:[
{v:"marketing",l:"Marketing & communicatie"},{v:"finance",l:"Finance & control"},{v:"legal",l:"Legal & compliance"},
{v:"hr_ld",l:"HR & L&D"},{v:"sales",l:"Sales & klantcontact"},{v:"operations",l:"Operations & logistiek"},
{v:"management",l:"Management & directie"},{v:"tech",l:"IT, data & development"},{v:"career_switch",l:"Carrièreswitch / anders"}]};
var AIUSE_Q={id:"ai",q:"Hoe vaak gebruik je AI nu in je werk?",o:[{v:"never",l:"Nooit"},{v:"sometimes",l:"Af en toe"},{v:"weekly",l:"Wekelijks"},{v:"daily",l:"Dagelijks"}]};

/* ILO 2025: kantoor-, administratieve en tekst/data-taken het meest blootgesteld; fysiek werk het minst.
   Vertaald naar een indicatieve blootstelling per vakgebied (1 = lager, 3 = hoog). */
var FIELD_EXPOSURE={marketing:3,finance:3,legal:2.5,hr_ld:2.5,sales:2,operations:2,management:1.5,tech:2.5,career_switch:2};

function matchCatalog(role,goal){
  var m=SKILLS.filter(function(s){return s.r.indexOf(role)!==-1&&s.g.indexOf(goal)!==-1});
  if(m.length<3)m=SKILLS.filter(function(s){return s.r.indexOf(role)!==-1});
  if(!m.length)m=SKILLS;
  var c={};m.forEach(function(s){s.p.forEach(function(p){c[p]=(c[p]||0)+1})});
  var by={};PRODUCTS.forEach(function(p){by[p.n]=p});
  var prods=Object.keys(c).filter(function(n){return by[n]}).sort(function(a,b){return c[b]-c[a]}).map(function(n){return by[n]});
  return {skills:m.slice(0,3),product:prods[0]||PRODUCTS[0]};
}

function Widget(el,cfg){
  var st={step:0,ans:{},sel:null};
  el.innerHTML=
   '<div class="screen active" data-s="i"><div class="ih"><img class="ihlogo" src="'+LOGO+'" alt="Amsterdam Data Academy"><div class="ihvis">'+cfg.visual+'</div><h1>'+cfg.title+'</h1><p>'+cfg.sub+'</p></div>'+
   '<div class="ib"><button class="btn btnhot" data-a="go">'+cfg.cta+' &#8594;</button></div></div>'+
   '<div class="screen" data-s="q"><div class="pw-wrap"><div class="pl"><span class="pl-left"><img class="qlogo" src="'+LOGO+'" alt=""><button type="button" class="bk" data-a="back" aria-label="Vorige vraag">'+BACK+'</button><span class="qc"></span></span><span class="qp" style="color:rgba(255,255,255,.6)"></span></div><div class="pb"><div class="pf" style="width:0%"></div></div></div>'+
   '<div class="qb"><h2 class="qt"></h2><div class="body"></div><button class="btn btnp bn" data-a="next" disabled>Volgende vraag &#8594;</button></div></div>'+
   '<div class="screen" data-s="l"><div class="ld"><div class="sp"></div><h3>Even rekenen...</h3><p>We zetten jouw antwoorden af tegen actueel onderzoek</p></div></div>'+
   '<div class="screen" data-s="r"></div>'+
   '<div class="pw"><span>Mogelijk gemaakt door</span><a href="https://www.amsterdamdataacademy.com" target="_blank" rel="noopener noreferrer"><img src="'+LOGO+'" alt="" width="14" height="14" style="border-radius:3px">Amsterdam Data Academy</a></div>';
  function $(q){return el.querySelector(q)}
  function show(s){el.querySelectorAll(".screen").forEach(function(x){x.classList.toggle("active",x.getAttribute("data-s")===s)})}
  function render(){
    var Q=cfg.questions,q=Q[st.step],pct=Math.round(st.step/Q.length*100);
    $(".qc").textContent="VRAAG "+(st.step+1)+" VAN "+Q.length;$(".qp").textContent=pct+"% compleet";
    $(".pf").style.width=pct+"%";$(".qt").textContent=q.q;$(".bk").style.display=st.step>0?"flex":"none";
    var body=$(".body"),bn=$(".bn");bn.innerHTML=st.step===Q.length-1?cfg.finish+" &#8594;":"Volgende vraag &#8594;";
    if(q.type==="salary"){
      var v=st.ans[q.id]||55000;st.sel=v;
      body.innerHTML='<div class="salary"><div class="salval"></div><input type="range" min="25000" max="150000" step="1000" aria-label="Bruto jaarsalaris" value="'+v+'"><div class="salscale"><span>€ 25.000</span><span>€ 150.000+</span></div></div>';
      var r=body.querySelector("input"),out=body.querySelector(".salval");
      function upd(){st.sel=+r.value;out.textContent=eurFmt(+r.value)+(+r.value>=150000?"+":"")}
      r.oninput=upd;upd();bn.disabled=false;return;
    }
    var ex=st.ans[q.id]||null;st.sel=ex;
    body.innerHTML='<div class="opts'+(q.o.length>6?" grid2":"")+'"></div>';var oc=body.firstChild;
    q.o.forEach(function(o,i){var b=document.createElement("button");b.type="button";b.className="opt"+(o.v===ex?" sel":"");
      b.innerHTML='<span class="oi">'+(i+1)+'</span><span class="ol">'+esc(o.l)+'</span><span class="ck">'+CHECK+'</span>';
      b.onclick=function(){oc.querySelectorAll(".opt").forEach(function(x){x.classList.remove("sel")});b.classList.add("sel");st.sel=o.v;bn.disabled=false};
      oc.appendChild(b)});
    bn.disabled=!ex;
  }
  el.addEventListener("click",function(e){var t=e.target.closest("[data-a]");if(!t)return;var a=t.getAttribute("data-a");
    if(a==="go"){st.step=0;st.ans={};render();show("q")}
    else if(a==="back"&&st.step>0){st.step--;render()}
    else if(a==="next"&&st.sel!=null){st.ans[cfg.questions[st.step].id]=st.sel;
      if(st.step<cfg.questions.length-1){st.step++;render()}else{show("l");setTimeout(function(){$('[data-s="r"]').innerHTML=cfg.result(st.ans);show("r")},900)}}
    else if(a==="again"){show("i")}
  });
  el.addEventListener("keydown",function(e){if(!$('[data-s="q"]').classList.contains("active"))return;
    if(e.key>="1"&&e.key<="9"){var b=el.querySelectorAll(".opt")[+e.key-1];if(b)b.click()}
    else if(e.key==="Enter"&&!$(".bn").disabled){$(".bn").click()}});
}

function adviceBlock(role,goal,label){
  var m=matchCatalog(role,goal),p=m.product,meta=[];
  if(p.d)meta.push(p.d+" weken");if(p.dl)meta.push(p.dl);if(p.nq==="bachelor")meta.push("NLQF-niveau 6");
  return '<div class="tb"><div class="tl">'+label+'</div><h3>'+esc(p.n)+'</h3><p>'+esc(nd(p.ds))+'</p><p class="rmeta">'+esc(meta.join(" · "))+'</p></div>'+
   '<div class="sl">SKILLS DIE JE VERDER HELPEN</div><div class="sks">'+m.skills.map(function(s){return '<span class="sk">'+esc(s.n)+'</span>'}).join("")+'</div>'+
   '<a class="ct" href="'+esc(p.u)+'" target="_blank" rel="noopener noreferrer">Bekijk '+esc(p.n)+' &#8594;</a>'+
   '<a class="rs2" href="https://www.amsterdamdataacademy.com" target="_blank" rel="noopener noreferrer">Of bekijk alle opleidingen</a>'+
   '<button class="rs" data-a="again">Doe de check opnieuw</button>';
}

function notifyHeight(){try{parent.postMessage({type:"ada-skill-navigator:resize",height:document.documentElement.scrollHeight},"*")}catch(e){}}
new MutationObserver(function(){setTimeout(notifyHeight,30)}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
window.addEventListener("load",notifyHeight);window.addEventListener("resize",notifyHeight);
fetch("../catalog.json",{cache:"no-cache"}).then(function(r){return r.json()}).then(function(c){PRODUCTS=c.products||[];SKILLS=c.skills||[]}).catch(function(){});

var VARIANTS={};
/* ---------- Variant 1: risicocalculator ---------- */
VARIANTS.risico=({
  title:"Verdwijnt jouw baan door AI?",
  sub:"Ontdek hoeveel van jouw werk AI al kan overnemen, en hoe je voorop blijft.",
  cta:"Bereken mijn AI-risico",finish:"Bekijk mijn risico",
  visual:'<svg viewBox="0 0 220 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20 110A90 90 0 0 1 200 110" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="16" stroke-linecap="round"/><path d="M20 110A90 90 0 0 1 64 33" fill="none" stroke="#7BD9B8" stroke-width="16" stroke-linecap="round"/><path d="M80 25A90 90 0 0 1 140 25" fill="none" stroke="#F9D571" stroke-width="16"/><path d="M156 33A90 90 0 0 1 200 110" fill="none" stroke="#D7031C" stroke-width="16" stroke-linecap="round"/><line x1="110" y1="110" x2="168" y2="58" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="110" cy="110" r="10" fill="#fff"/></svg>',
  questions:[ROLE_Q,
    {id:"routine",q:"Hoeveel van je werkweek besteed je aan tekst, e-mail, data, planning en administratie?",o:[{v:15,l:"Minder dan 20%"},{v:35,l:"20 tot 50%"},{v:60,l:"50 tot 70%"},{v:80,l:"Meer dan 70%"}]},
    AIUSE_Q,
    {id:"hours",q:"Hoeveel uur werk je per week?",o:[{v:20,l:"Minder dan 24 uur"},{v:28,l:"24 tot 32 uur"},{v:36,l:"32 tot 40 uur"},{v:44,l:"Meer dan 40 uur"}]}],
  result:function(a){
    var fe=FIELD_EXPOSURE[a.role]||2, score=Math.round(Math.min(100,(a.routine*0.75)+(fe-1.5)*14));
    var level=score>=60?"HOOG":score>=35?"GEMIDDELD":"LAAG", col=level==="HOOG"?"#D7031C":level==="GEMIDDELD"?"#F9D571":"#7BD9B8", tc=level==="HOOG"?"#fff":"#1d1d2b";
    var exposedH=Math.round(a.hours*a.routine/100);
    var lead={never:"Je gebruikt nog geen AI. Collega's die dat wel doen, lopen nu al uit.",sometimes:"Je gebruikt AI af en toe. Met structureel gebruik haal je er veel meer uit.",weekly:"Je gebruikt AI al wekelijks. Nu is het moment om het slim in je werk in te bedden.",daily:"Je gebruikt AI al dagelijks. Daarmee hoor je bij de voorlopers."}[a.ai];
    return '<div class="rh"><img class="rlogo" src="'+LOGO+'" alt=""><div class="rtag" style="background:'+col+';color:'+tc+'">AI-IMPACT: '+level+'</div>'+
      '<h2>Je baan verdwijnt waarschijnlijk niet. Maar hij verandert wel.</h2>'+
      '<div class="meter"><i style="width:'+Math.max(6,score)+'%"></i></div><div class="meterlab"><span>LAAG</span><span>GEMIDDELD</span><span>HOOG</span></div>'+
      '<p style="margin-top:10px">'+esc(lead)+'</p></div>'+
      '<div class="rb"><div class="stats"><div class="stat"><b>~'+exposedH+' uur</b><span>per week aan taken waar AI al goed in is</span></div><div class="stat"><b>4+ uur</b><span>per week bespaart 1 op de 3 dagelijkse AI-gebruikers</span></div></div>'+
      '<p class="src">Indicatie op basis van jouw antwoorden en de ILO-index (2025): kantoor-, tekst- en datawerk is het meest blootgesteld aan AI, en de meeste banen veranderen eerder dan dat ze verdwijnen. Tijdwinst: Federal Reserve Bank of St. Louis (2025).</p>'+
      adviceBlock(a.role,"promotion","ZO BLIJF JE VOOROP")+'</div>';
  }
});

/* ---------- Variant 2: salariscalculator ---------- */
VARIANTS.salaris=({
  title:"Wat levert AI-kennis jou op?",
  sub:"Reken uit wat de juiste AI-vaardigheden kunnen betekenen voor je salaris en je tijd.",
  cta:"Bereken mijn AI-voordeel",finish:"Bekijk mijn uitkomst",
  visual:'<svg viewBox="0 0 220 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><line x1="14" y1="112" x2="206" y2="112" stroke="rgba(255,255,255,.2)" stroke-width="2"/><rect x="30" y="78" width="30" height="34" rx="4" fill="rgba(255,255,255,.22)"/><rect x="75" y="62" width="30" height="50" rx="4" fill="rgba(255,255,255,.32)"/><rect x="120" y="40" width="30" height="72" rx="4" fill="#F9D571"/><rect x="165" y="12" width="30" height="100" rx="4" fill="#D7031C"/><path d="M40 70L90 52L135 32L178 6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 7"/></svg>',
  questions:[ROLE_Q,{id:"salary",type:"salary",q:"Wat is je huidige bruto jaarsalaris?"},AIUSE_Q],
  result:function(a){
    var s=a.salary, lo=s*0.16, hi=s*0.62, hourly=s/(36*46), timeVal=4*46*hourly;
    var fn={finance:"Let op: in de Nederlandse financiële sector is de salarispremie voor AI-vaardigheden volgens PwC (2026) juist licht negatief. De winst zit daar vooral in tijd en inzetbaarheid.",tech:"In technologie, media en telecom liggen de premies voor AI-vaardigheden in Nederland het hoogst (PwC, 2026)."}[a.role]||"";
    var head=a.role==="finance"?'<div class="big">'+eurFmt(timeVal)+'</div><div class="bigsub">aan tijdwinst per jaar als je 4 uur per week bespaart</div>'
      :'<div class="big"><span class="nw">+'+eurFmt(lo)+'</span> <span class="tot">tot</span> <span class="nw">+'+eurFmt(hi)+'</span></div><div class="bigsub">per jaar, als je functie AI-vaardigheden gaat vragen</div>';
    return '<div class="rh"><img class="rlogo" src="'+LOGO+'" alt=""><div class="rtag" style="background:#F9D571;color:#1d1d2b">JOUW AI-VOORDEEL</div>'+head+'</div>'+
      '<div class="rb"><div class="stats"><div class="stat"><b>+62%</b><span>gemiddeld hoger salaris bij vacatures met AI-skills (wereldwijd)</span></div><div class="stat"><b>'+eurFmt(timeVal)+'</b><span>waarde van 4 uur tijdwinst per week, op basis van jouw salaris</span></div></div>'+
      (fn?'<div class="fieldnote">'+esc(fn)+'</div>':'')+
      '<p class="src">Indicatie. Salarispremie: PwC Global AI Jobs Barometer 2026 (gemiddeld +62%, laagste sector +16%); in Nederland verschilt dit sterk per sector. Tijdwinst: 1 op de 3 dagelijkse AI-gebruikers bespaart 4+ uur per week (St. Louis Fed, 2025), gerekend met 36 uur en 46 werkweken.</p>'+
      adviceBlock(a.role,"promotion","ZO HAAL JE HET ERUIT")+'</div>';
  }
});

var _v=document.body.getAttribute("data-variant");if(VARIANTS[_v])new Widget(document.getElementById("w"),VARIANTS[_v]);
