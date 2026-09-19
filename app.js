/* =========================================================
   KRISHWAVE FREE PREDICTION AI
   PAPER / DEMO ENGINE ONLY

   EACH MARKET:
   10s ANALYZING
        ↓
   PREDICTION REVEALED
        ↓
   5s ENTRY WINDOW
        ↓
   RESULT / RESET
        ↓
   10s ANALYZING AGAIN

   No Deriv login
   No OAuth
   No Cloudflare Worker
   No real-money trading
========================================================= */

"use strict";

const MARKETS = [
  "R_10","R_25","R_50","R_75","R_100",
  "1HZ10V","1HZ25V","1HZ30V","1HZ50V","1HZ75V",
  "1HZ90V","1HZ100V","1HZ150V","1HZ250V","1HZ1000V"
];

const MARKET_NAMES = {
  R_10:"Volatility 10",
  R_25:"Volatility 25",
  R_50:"Volatility 50",
  R_75:"Volatility 75",
  R_100:"Volatility 100",
  "1HZ10V":"Volatility 10 (1s)",
  "1HZ25V":"Volatility 25 (1s)",
  "1HZ30V":"Volatility 30 (1s)",
  "1HZ50V":"Volatility 50 (1s)",
  "1HZ75V":"Volatility 75 (1s)",
  "1HZ90V":"Volatility 90 (1s)",
  "1HZ100V":"Volatility 100 (1s)",
  "1HZ150V":"Volatility 150 (1s)",
  "1HZ250V":"Volatility 250 (1s)",
  "1HZ1000V":"Volatility 1000 (1s)"
};

const START_BALANCE = 1000;
const MAX_TICKS = 250;
const ANALYSIS_TIME = 10;
const ENTRY_TIME = 5;
const TICK_SPEED = 900;

const $ = id => document.getElementById(id);

const state = {
  market:"R_100",
  ticks:{},
  prices:{},
  cycles:{},
  predictions:[],
  trades:[],
  active:[],
  balance:START_BALANCE,
  bot:false,
  botTimer:null,
  theme:"dark",
  stats:{
    total:0,
    wins:0,
    losses:0,
    stake:0,
    won:0,
    profit:0
  }
};

/* =========================================================
   INITIALIZATION
========================================================= */

function init(){

  load();

  MARKETS.forEach(m=>{
    state.ticks[m]=[];
    state.prices[m]=1000+Math.random()*50;

    state.cycles[m]={
      phase:"ANALYZING",
      remaining:ANALYSIS_TIME,
      prediction:null,
      predictionId:null,
      traded:false,
      cycle:1,
      result:null,
      resultUntil:0
    };
  });

  populate("analysisMarketSelect");
  populate("botMarketSelect");
  populate("manualMarketSelect");

  ["analysisMarketSelect","botMarketSelect","manualMarketSelect"]
  .forEach(id=>{
    const el=$(id);
    if(!el)return;

    el.addEventListener("change",e=>{
      state.market=e.target.value;
      syncMarkets();
      render();
    });
  });

  if($("manualStrategySelect"))
    $("manualStrategySelect").onchange=renderManualTarget;

  if($("useAiPredictionBtn"))
    $("useAiPredictionBtn").onclick=useAI;

  if($("useAiPredictionAnalysis"))
    $("useAiPredictionAnalysis").onclick=useAI;

  if($("placeTradeBtn"))
    $("placeTradeBtn").onclick=manualTrade;

  if($("startBotBtn"))
    $("startBotBtn").onclick=startBot;

  if($("stopTradingBtn"))
    $("stopTradingBtn").onclick=stopBot;

  if($("clearLogsBtn"))
    $("clearLogsBtn").onclick=clearHistory;

  if($("themeToggle"))
    $("themeToggle").onclick=toggleTheme;

  setupNavigation();
  injectCycleDashboard();

  syncMarkets();
  renderManualTarget();
  applyTheme();

  /*
     Build a history for the simulator so the AI
     can immediately calculate statistics.
  */
  for(let i=0;i<120;i++){
    generateTick(true);
  }

  render();

  /* simulated market ticks */
  setInterval(()=>{
    generateTick(false);
  },TICK_SPEED);

  /* independent countdown clock */
  setInterval(()=>{
    updateCycles();
  },1000);

  /* UI */
  setInterval(()=>{
    render();
  },500);
}

/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation(){

  document.querySelectorAll(".nav").forEach(btn=>{
    btn.onclick=()=>{
      showPage(
        btn.dataset.page,
        btn
      );
    };
  });

  document.querySelectorAll(".tab").forEach(btn=>{
    btn.onclick=()=>{
      showTab(
        btn.dataset.tab,
        btn
      );
    };
  });
}

function showPage(id,button){

  document.querySelectorAll(".page")
    .forEach(p=>p.classList.remove("active"));

  const page=$(id);
  if(page)page.classList.add("active");

  document.querySelectorAll(".nav")
    .forEach(b=>b.classList.remove("active"));

  if(button)button.classList.add("active");
}

function showTab(id,button){

  document.querySelectorAll(".trade-panel")
    .forEach(p=>p.classList.remove("active"));

  const panel=$(id);
  if(panel)panel.classList.add("active");

  document.querySelectorAll(".tab")
    .forEach(b=>b.classList.remove("active"));

  if(button)button.classList.add("active");
}

/* =========================================================
   MARKET SELECTORS
========================================================= */

function populate(id){

  const el=$(id);
  if(!el)return;

  el.innerHTML=MARKETS.map(m=>`
    <option value="${m}" ${m===state.market?"selected":""}>
      ${MARKET_NAMES[m]}
    </option>
  `).join("");
}

function syncMarkets(){

  [
    "analysisMarketSelect",
    "botMarketSelect",
    "manualMarketSelect"
  ].forEach(id=>{
    const el=$(id);
    if(el)el.value=state.market;
  });
}

/* =========================================================
   MARKET TICKS
========================================================= */

function getDigit(price){

  const fixed=Number(price).toFixed(5);

  return Number(
    fixed.replace(/\D/g,"").slice(-1)
  );
}

function generateTick(seed){

  MARKETS.forEach(m=>{

    let price=state.prices[m];

    const movement=(Math.random()-0.5)*2.5;

    price=Math.max(
      100,
      price+movement
    );

    state.prices[m]=price;

    const digit=getDigit(price);

    state.ticks[m].push({
      price,
      digit,
      time:Date.now()
    });

    if(state.ticks[m].length>MAX_TICKS)
      state.ticks[m].shift();

    settleTrades(m,digit);
    validatePredictions(m,digit);
  });

  if(!seed && state.bot)
    botEntryCheck();
}

/* =========================================================
   INDEPENDENT 10s / 5s CYCLES
========================================================= */

function updateCycles(){

  MARKETS.forEach(m=>{

    const c=state.cycles[m];

    if(!c)return;

    if(c.phase==="ANALYZING"){

      c.remaining--;

      if(c.remaining<=0)
        revealPrediction(m);

    }else if(c.phase==="ENTRY"){

      c.remaining--;

      if(c.remaining<=0){

        c.phase="RESULT";
        c.resultUntil=Date.now()+900;
        c.remaining=0;

      }

    }else if(c.phase==="RESULT"){

      if(Date.now()>=c.resultUntil)
        newCycle(m);
    }
  });

  renderCycleDashboard();
}

function newCycle(m){

  const old=state.cycles[m];

  state.cycles[m]={
    phase:"ANALYZING",
    remaining:ANALYSIS_TIME,
    prediction:null,
    predictionId:null,
    traded:false,
    cycle:(old?.cycle||0)+1,
    result:null,
    resultUntil:0
  };
}

function revealPrediction(m){

  const c=state.cycles[m];
  const analysis=engine(m);

  /*
     If the AI does not have enough evidence,
     it still shows the end of analysis rather
     than pretending certainty.
  */

  if(
    !analysis ||
    analysis.signal!=="SIGNAL"
  ){

    c.prediction={
      strategy:"WAIT",
      digit:analysis?.predictedDigit ?? null,
      barrier:analysis?.barrier ?? null,
      confidence:analysis?.confidence ?? 0,
      signal:"NO SIGNAL",
      reason:"No sufficiently strong statistical signal."
    };

    c.phase="RESULT";
    c.remaining=0;
    c.resultUntil=Date.now()+1200;

    return;
  }

  const prediction={
    id:Date.now()+Math.random(),
    market:m,
    strategy:analysis.strategy,
    digit:analysis.predictedDigit,
    barrier:analysis.barrier,
    confidence:analysis.confidence,
    created:Date.now(),
    result:null,
    cycle:c.cycle
  };

  c.prediction=prediction;
  c.predictionId=prediction.id;
  c.traded=false;

  /*
     IMPORTANT:
     Prediction is created HERE,
     after the 10 second analysis.
  */

  c.phase="ENTRY";
  c.remaining=ENTRY_TIME;

  state.predictions.unshift(prediction);

  state.predictions=
    state.predictions.slice(0,100);

  save();
}

/* =========================================================
   AI ENGINE
========================================================= */

function frequency(arr){

  const count=Array(10).fill(0);

  arr.forEach(d=>{
    if(Number.isInteger(d))
      count[d]++;
  });

  return count.map(
    n=>n/(arr.length||1)
  );
}

function transitions(arr){

  const table=
    Array.from(
      {length:10},
      ()=>Array(10).fill(0)
    );

  for(let i=1;i<arr.length;i++){

    const from=arr[i-1];
    const to=arr[i];

    table[from][to]++;
  }

  const last=arr[arr.length-1];

  if(last===undefined)
    return Array(10).fill(0.1);

  const row=table[last];

  const total=row.reduce(
    (a,b)=>a+b,
    0
  );

  return row.map(
    x=>x/(total||1)
  );
}

function entropy(freqs){

  return -freqs.reduce(
    (sum,p)=>{
      return sum+
        (p?p*Math.log2(p):0);
    },
    0
  )/Math.log2(10);
}

function engine(symbol){

  const raw=state.ticks[symbol]||[];

  const digits=raw.map(
    x=>x.digit
  );

  const n=digits.length;

  if(n<30){

    return {
      symbol,
      sampleCount:n,
      confidence:0,
      strategy:"WAIT",
      predictedDigit:null,
      barrier:null,
      signal:"WAIT",
      reason:"Collecting tick history."
    };
  }

  const windows=[
    digits.slice(-20),
    digits.slice(-50),
    digits.slice(-100),
    digits.slice(-200)
  ];

  const weights=[
    0.40,
    0.28,
    0.20,
    0.12
  ];

  const score=Array(10).fill(0);

  windows.forEach((arr,i)=>{

    const f=frequency(arr);

    f.forEach((p,d)=>{
      score[d]+=p*weights[i];
    });
  });

  /*
     Recent transition information
  */

  const tr=transitions(
    digits.slice(-120)
  );

  tr.forEach((p,d)=>{
    score[d]+=p*0.18;
  });

  const ranked=score
    .map((v,d)=>({digit:d,value:v}))
    .sort(
      (a,b)=>b.value-a.value
    );

  const predicted=ranked[0].digit;

  const second=ranked[1].value;

  const margin=Math.max(
    0,
    ranked[0].value-second
  );

  const recent50=digits.slice(-50);
  const recent20=digits.slice(-20);

  const stability=
    1-entropy(
      frequency(recent50)
    );

  const recentSupport=
    frequency(recent20)[predicted];

  const overallSupport=
    frequency(digits)[predicted];

  const support=Math.min(
    1,
    Math.max(
      0,
      recentSupport-overallSupport+0.15
    )
  );

  let confidence=
    52+
    margin*260+
    stability*16+
    support*18;

  confidence=Math.round(
    Math.min(
      94,
      Math.max(35,confidence)
    )
  );

  const rf=frequency(recent50);

  const over=
    rf[5]+rf[6]+rf[7]+rf[8]+rf[9];

  const under=
    rf[0]+rf[1]+rf[2]+rf[3]+rf[4];

  /*
     Candidate strategies.
  */

  const candidates=[

    {
      strategy:"MATCHES",
      edge:rf[predicted],
      digit:predicted,
      barrier:predicted
    },

    {
      strategy:"DIFFERS",
      edge:1-rf[predicted],
      digit:predicted,
      barrier:predicted
    },

    {
      strategy:"OVER",
      edge:over,
      digit:predicted,
      barrier:4
    },

    {
      strategy:"UNDER",
      edge:under,
      digit:predicted,
      barrier:5
    }

  ];

  candidates.sort(
    (a,b)=>b.edge-a.edge
  );

  const best=candidates[0];

  const neutral=
    best.strategy==="MATCHES" ||
    best.strategy==="DIFFERS"
      ?0.10
      :0.50;

  const edge=Math.abs(
    best.edge-neutral
  );

  confidence=Math.round(
    Math.min(
      94,
      confidence+edge*12
    )
  );

  const signal=
    confidence>=68
      ?"SIGNAL"
      :"NO SIGNAL";

  return {

    symbol,

    sampleCount:n,

    predictedDigit:predicted,

    barrier:best.barrier,

    strategy:best.strategy,

    confidence,

    signal,

    reason:
      `${best.strategy} selected from `+
      `multi-window digit frequency, `+
      `recent transitions and stability. `+
      `Last digit ${digits[digits.length-1]}.`,

    frequencies:
      frequency(
        digits.slice(-100)
      ),

    stability
  };
}

/* =========================================================
   PREDICTION VALIDATION
========================================================= */

function validatePredictions(
  market,
  digit
){

  state.predictions.forEach(p=>{

    if(
      p.result ||
      p.market!==market
    )return;

    let win=false;

    if(p.strategy==="MATCHES")
      win=digit===p.digit;

    else if(p.strategy==="DIFFERS")
      win=digit!==p.digit;

    else if(p.strategy==="UNDER")
      win=digit<p.barrier;

    else if(p.strategy==="OVER")
      win=digit>p.barrier;

    p.result=win
      ?"WIN"
      :"LOSS";
  });

  save();
}

/* =========================================================
   PAPER TRADING
========================================================= */

function settleTrades(
  market,
  digit
){

  const list=
    state.active.filter(
      t=>t.market===market
    );

  list.forEach(t=>{

    let win=false;

    if(t.strategy==="MATCHES")
      win=digit===t.target;

    else if(t.strategy==="DIFFERS")
      win=digit!==t.target;

    else if(t.strategy==="UNDER")
      win=digit<t.target;

    else if(t.strategy==="OVER")
      win=digit>t.target;

    finishTrade(t,win);
  });
}

function finishTrade(
  trade,
  win
){

  if(!state.active.includes(trade))
    return;

  state.active=
    state.active.filter(
      x=>x!==trade
    );

  /*
     Simulated payout only.
     This is NOT a Deriv payout calculation.
  */

  const payout=win
    ?trade.stake*
      (
        trade.strategy==="MATCHES"
          ?8.5
          :0.95
      )
    :0;

  const profit=
    payout-trade.stake;

  state.balance+=payout;

  state.stats.total++;
  state.stats.stake+=trade.stake;
  state.stats.won+=payout;
  state.stats.profit+=profit;

  if(win)
    state.stats.wins++;
  else
    state.stats.losses++;

  state.trades.unshift({
    ...trade,
    result:win?"WIN":"LOSS",
    payout,
    profit,
    closed:Date.now()
  });

  state.trades=
    state.trades.slice(0,100);

  save();
  render();
}

/* =========================================================
   MANUAL TRADE
========================================================= */

function manualTrade(){

  const strategy=
    $("manualStrategySelect")?.value;

  const target=Number(
    $("manualTargetDigitInput")?.value
  );

  if(
    !Number.isInteger(target) ||
    target<0 ||
    target>9
  ){

    toast(
      "Enter a target digit/barrier from 0 to 9."
    );

    return;
  }

  const market=
    $("manualMarketSelect")?.value ||
    state.market;

  const cycle=
    state.cycles[market];

  /*
     Manual entry is allowed only while
     the market is in its ENTRY window.
  */

  if(!cycle || cycle.phase!=="ENTRY"){

    toast(
      `${MARKET_NAMES[market]} is not in ENTRY. Wait for its prediction.`
    );

    return;
  }

  const stake=Math.max(
    0.25,
    Number(
      $("manualStakeInput")?.value
    )||1
  );

  if(stake>state.balance){

    toast(
      "Insufficient paper balance."
    );

    return;
  }

  state.balance-=stake;

  state.active.push({

    id:Date.now()+Math.random(),

    market,

    strategy,

    target,

    stake,

    source:"MANUAL",

    opened:Date.now(),

    predictionId:
      cycle.predictionId

  });

  cycle.traded=true;

  if($("manualStatusText")){

    $("manualStatusText").textContent=
      `${strategy} ${target} placed — waiting for next tick.`;
  }

  save();
  render();
}

/* =========================================================
   LOAD AI PREDICTION INTO MANUAL
========================================================= */

function useAI(){

  const market=
    $("manualMarketSelect")?.value ||
    state.market;

  const cycle=
    state.cycles[market];

  if(
    !cycle ||
    cycle.phase!=="ENTRY" ||
    !cycle.prediction
  ){

    toast(
      `${MARKET_NAMES[market]} is still analyzing.`
    );

    return;
  }

  const p=cycle.prediction;

  if(p.signal==="NO SIGNAL"){

    toast(
      "AI has NO SIGNAL."
    );

    return;
  }

  if($("manualStrategySelect"))
    $("manualStrategySelect").value=
      p.strategy;

  if($("manualTargetDigitInput"))
    $("manualTargetDigitInput").value=
      p.strategy==="UNDER" ||
      p.strategy==="OVER"
        ?p.barrier
        :p.digit;

  showPage(
    "tradePage",
    document.querySelector(
      '[data-page="tradePage"]'
    )
  );

  showTab(
    "manualPanel",
    document.querySelector(
      '[data-tab="manualPanel"]'
    )
  );

  toast(
    `${MARKET_NAMES[market]}: ${p.strategy} ${
      p.strategy==="UNDER" ||
      p.strategy==="OVER"
        ?p.barrier
        :p.digit
    }`
  );
}

function renderManualTarget(){

  const el=$("targetDigitContainer");

  if(el)
    el.style.display="block";
}

/* =========================================================
   AI BOT
========================================================= */

function startBot(){

  if(state.bot)return;

  state.bot=true;

  if($("startBotBtn"))
    $("startBotBtn").textContent=
      "AI BOT RUNNING";

  if($("botStatusDash"))
    $("botStatusDash").textContent=
      "RUNNING";

  toast(
    "AI Bot started — demo mode."
  );

  botEntryCheck();
}

function stopBot(){

  state.bot=false;

  if(state.botTimer)
    clearTimeout(state.botTimer);

  state.botTimer=null;

  if($("startBotBtn"))
    $("startBotBtn").textContent=
      "START AI BOT";

  if($("botStatusDash"))
    $("botStatusDash").textContent=
      "STOPPED";

  toast(
    "AI Bot stopped."
  );
}

function botEntryCheck(){

  if(!state.bot)return;

  const selected=
    $("botMarketSelect")?.value ||
    state.market;

  const strategyChoice=
    $("botStrategySelect")?.value ||
    "AUTO";

  /*
     One selected market gets its own entry.
  */

  const market=selected;

  const cycle=
    state.cycles[market];

  if(
    cycle &&
    cycle.phase==="ENTRY" &&
    !cycle.traded &&
    cycle.prediction
  ){

    const p=cycle.prediction;

    if(p.signal==="SIGNAL"){

      const strategy=
        strategyChoice==="AUTO"
          ?p.strategy
          :strategyChoice;

      const target=
        strategy==="UNDER" ||
        strategy==="OVER"
          ?p.barrier
          :p.digit;

      const stake=Math.max(
        0.25,
        Number(
          $("stakeInput")?.value
        )||1
      );

      if(
        stake<=state.balance &&
        Number.isFinite(target)
      ){

        state.balance-=stake;

        state.active.push({

          id:Date.now()+Math.random(),

          market,

          strategy,

          target,

          stake,

          source:"AI BOT",

          opened:Date.now(),

          predictionId:
            cycle.predictionId
        });

        cycle.traded=true;

        save();

        toast(
          `${MARKET_NAMES[market]}: ${strategy} ${target} — ENTRY`
        );
      }
    }
  }
}

/* =========================================================
   15 MARKET VISIBLE CYCLE DASHBOARD
========================================================= */

function injectCycleDashboard(){

  if($("marketCycleDashboard"))
    return;

  const analysisPage=
    $("analysisPage");

  if(!analysisPage)return;

  const dashboard=
    document.createElement("section");

  dashboard.id=
    "marketCycleDashboard";

  dashboard.className=
    "card";

  dashboard.innerHTML=`

    <div class="section-title">

      <h3>
        15-MARKET LIVE PREDICTION CYCLES
      </h3>

      <span>
        10s → PREDICTION → 5s
      </span>

    </div>

    <p
      class="muted"
      style="margin:6px 0 12px"
    >
      Every market has its own independent
      analysis, prediction and entry countdown.
    </p>

    <div
      id="cycleGrid"
      class="kw-cycle-grid"
    ></div>
  `;

  analysisPage.appendChild(
    dashboard
  );

  const grid=
    $("cycleGrid");

  MARKETS.forEach(m=>{

    const card=
      document.createElement("div");

    card.className=
      "kw-cycle-card";

    card.id=
      "cycleCard_"+safeId(m);

    card.innerHTML=`

      <div class="kw-cycle-head">

        <div>

          <strong>
            ${MARKET_NAMES[m]}
          </strong>

          <small>
            ${m}
          </small>

        </div>

        <span class="kw-live">
          ● LIVE
        </span>

      </div>

      <div
        class="kw-phase analysis"
        data-phase
      >
        ANALYZING
      </div>

      <div
        class="kw-countdown"
        data-countdown
      >
        10s
      </div>

      <div
        class="kw-prediction"
        data-prediction
      >
        ⌛
      </div>

      <div
        class="kw-confidence"
        data-confidence
      >
        AI analyzing market...
      </div>

      <div
        class="kw-note"
        data-note
      >
        NEXT PREDICTION IN 10s
      </div>

    `;

    grid.appendChild(card);
  });

  injectCycleStyles();
}

function safeId(m){

  return m.replace(
    /[^a-zA-Z0-9]/g,
    "_"
  );
}

/* =========================================================
   RENDER 15 CYCLES
========================================================= */

function renderCycleDashboard(){

  const grid=$("cycleGrid");

  if(!grid)return;

  MARKETS.forEach(m=>{

    const c=
      state.cycles[m];

    if(!c)return;

    const card=
      $("cycleCard_"+safeId(m));

    if(!card)return;

    const phase=
      card.querySelector(
        "[data-phase]"
      );

    const countdown=
      card.querySelector(
        "[data-countdown]"
      );

    const prediction=
      card.querySelector(
        "[data-prediction]"
      );

    const confidence=
      card.querySelector(
        "[data-confidence]"
      );

    const note=
      card.querySelector(
        "[data-note]"
      );

    /* ANALYZING */

    if(c.phase==="ANALYZING"){

      phase.textContent=
        "ANALYZING";

      phase.className=
        "kw-phase analysis";

      countdown.textContent=
        `${Math.max(0,c.remaining)}s`;

      prediction.textContent=
        "⌛";

      const a=engine(m);

      confidence.textContent=
        a.sampleCount>=30
          ?`Confidence building: ${a.confidence}%`
          :"Collecting tick data...";

      note.textContent=
        `NEXT PREDICTION IN ${Math.max(0,c.remaining)}s`;

      card.classList.remove(
        "entry",
        "result"
      );

      card.classList.add(
        "analyzing"
      );
    }

    /* ENTRY */

    else if(c.phase==="ENTRY"){

      const p=c.prediction;

      phase.textContent=
        "ENTRY READY";

      phase.className=
        "kw-phase entry";

      countdown.textContent=
        `${Math.max(0,c.remaining)}s`;

      if(p){

        const target=
          p.strategy==="UNDER" ||
          p.strategy==="OVER"
            ?p.barrier
            :p.digit;

        prediction.textContent=
          `${p.strategy} • ${target}`;

        confidence.textContent=
          `Confidence: ${p.confidence}%`;

        note.textContent=
          c.traded
            ?"TRADE ENTERED • waiting for result"
            :`ENTRY WINDOW • ${c.remaining}s`;
      }

      card.classList.remove(
        "analyzing",
        "result"
      );

      card.classList.add(
        "entry"
      );
    }

    /* RESULT */

    else {

      phase.textContent=
        "RESETTING";

      phase.className=
        "kw-phase result";

      countdown.textContent=
        "0s";

      if(c.prediction?.strategy==="WAIT")
        prediction.textContent=
          "NO SIGNAL";
      else
        prediction.textContent=
          "RESET";

      confidence.textContent=
        c.prediction?.reason ||
        "Starting next analysis...";

      note.textContent=
        "NEW 10s ANALYSIS STARTING";

      card.classList.remove(
        "analyzing",
        "entry"
      );

      card.classList.add(
        "result"
      );
    }

  });
}

/* =========================================================
   CYCLE STYLES
========================================================= */

function injectCycleStyles(){

  if($("kw-cycle-styles"))
    return;

  const style=
    document.createElement("style");

  style.id=
    "kw-cycle-styles";

  style.textContent=`

    .kw-cycle-grid{
      display:grid;
      grid-template-columns:
        repeat(2,minmax(0,1fr));
      gap:10px;
    }

    .kw-cycle-card{
      background:
        var(--card3);
      border:
        1px solid var(--line);
      border-radius:
        15px;
      padding:
        12px;
      min-height:
        205px;
      transition:
        .2s;
    }

    .kw-cycle-card.entry{
      border-color:
        var(--green);
      box-shadow:
        0 0 0 1px
        rgba(25,230,140,.18),
        0 8px 25px
        rgba(0,0,0,.18);
    }

    .kw-cycle-card.result{
      border-color:
        var(--accent);
    }

    .kw-cycle-head{
      display:flex;
      justify-content:
        space-between;
      align-items:
        flex-start;
      gap:8px;
    }

    .kw-cycle-head strong{
      display:block;
      font-size:13px;
    }

    .kw-cycle-head small{
      display:block;
      color:var(--muted);
      font-size:9px;
      margin-top:3px;
    }

    .kw-live{
      color:var(--green);
      font-size:9px;
      font-weight:900;
      white-space:nowrap;
    }

    .kw-phase{
      text-align:center;
      margin-top:15px;
      font-size:10px;
      font-weight:950;
      letter-spacing:1px;
    }

    .kw-phase.analysis{
      color:var(--yellow);
    }

    .kw-phase.entry{
      color:var(--green);
    }

    .kw-phase.result{
      color:var(--accent);
    }

    .kw-countdown{
      text-align:center;
      font-size:34px;
      font-weight:950;
      margin:5px 0;
      color:var(--accent);
    }

    .kw-prediction{
      text-align:center;
      font-size:19px;
      font-weight:950;
      min-height:28px;
    }

    .kw-confidence{
      text-align:center;
      color:var(--muted);
      font-size:10px;
      line-height:1.35;
      min-height:30px;
      margin-top:5px;
    }

    .kw-note{
      text-align:center;
      color:var(--muted);
      font-size:9px;
      font-weight:850;
      margin-top:6px;
    }

    .kw-cycle-card.entry
    .kw-note{
      color:var(--green);
    }

    body.light
    .kw-cycle-card{
      background:var(--card3);
    }

    @media(max-width:500px){

      .kw-cycle-grid{
        grid-template-columns:1fr;
      }

      .kw-cycle-card{
        min-height:215px;
      }

    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   MAIN RENDER
========================================================= */

function render(){

  const market=
    state.market;

  const a=engine(market);

  if($("digitSampleCount"))
    $("digitSampleCount").textContent=
      a.sampleCount;

  if($("lastDigit"))
    $("lastDigit").textContent=
      state.ticks[market]?.at(-1)?.digit ??
      "-";

  if($("analysisConfidence"))
    $("analysisConfidence").textContent=
      `${a.confidence}%`;

  if($("aiStatus"))
    $("aiStatus").textContent=
      a.signal;

  if($("aiType"))
    $("aiType").textContent=
      a.strategy;

  if($("currentChartMarket"))
    $("currentChartMarket").textContent=
      market;

  if($("currentLivePrice"))
    $("currentLivePrice").textContent=
      Number(
        state.prices[market]||0
      ).toFixed(5);

  const cycle=
    state.cycles[market];

  /*
     Main prediction card follows
     the selected market's cycle.
  */

  if(cycle?.phase==="ENTRY" &&
     cycle.prediction){

    const p=cycle.prediction;

    if($("aiPrediction"))
      $("aiPrediction").textContent=
        `${p.strategy} • ${
          p.strategy==="UNDER" ||
          p.strategy==="OVER"
            ?p.barrier
            :p.digit
        }`;

    if($("aiStatus"))
      $("aiStatus").textContent=
        "ENTRY READY";

    if($("analysisMsg"))
      $("analysisMsg").textContent=
        `ENTRY WINDOW: ${cycle.remaining}s remaining. ${a.reason}`;

  }else{

    if($("aiPrediction"))
      $("aiPrediction").textContent=
        "ANALYZING";

    if($("analysisMsg"))
      $("analysisMsg").textContent=
        `Next prediction in ${
          cycle?.remaining ??
          ANALYSIS_TIME
        }s. ${a.reason}`;
  }

  /* digit distribution */

  const frequencies=
    a.frequencies||
    Array(10).fill(0);

  if($("digitStatsGrid")){

    $("digitStatsGrid").innerHTML=
      frequencies.map((p,d)=>`

        <div class="digit">

          <b>${d}</b>

          <small>
            ${Math.round(p*100)}%
          </small>

        </div>

      `).join("");
  }

  /* accuracy */

  if($("accuracyAll"))
    $("accuracyAll").textContent=
      accuracy();

  if($("accuracyRecent"))
    $("accuracyRecent").textContent=
      accuracyRecent();

  if($("accuracyMatches"))
    $("accuracyMatches").textContent=
      accuracy("MATCHES");

  if($("accuracyDiffers"))
    $("accuracyDiffers").textContent=
      accuracy("DIFFERS");

  if($("accuracyUnder"))
    $("accuracyUnder").textContent=
      accuracy("UNDER");

  if($("accuracyOver"))
    $("accuracyOver").textContent=
      accuracy("OVER");

  /* prediction history */

  if($("predictionCount"))
    $("predictionCount").textContent=
      state.predictions.length;

  if($("predictionHistory")){

    $("predictionHistory").innerHTML=
      state.predictions
        .slice(0,8)
        .map(p=>`

          <div class="history-row">

            <span>
              ${p.market}
              • ${p.strategy}
              ${p.strategy==="UNDER" ||
                p.strategy==="OVER"
                  ?p.barrier
                  :p.digit}
              • ${p.confidence}%
            </span>

            <b class="${
              p.result==="WIN"
                ?"profit"
                :p.result==="LOSS"
                  ?"loss"
                  :""
            }">
              ${p.result||"PENDING"}
            </b>

          </div>

        `)
        .join("")
      ||
      "<div class='muted'>No predictions yet.</div>";
  }

  /* balance */

  if($("balanceDisplay"))
    $("balanceDisplay").textContent=
      "$"+state.balance.toFixed(2);

  /* paper stats */

  if($("paperTotal"))
    $("paperTotal").textContent=
      state.stats.total;

  if($("paperWins"))
    $("paperWins").textContent=
      state.stats.wins;

  if($("paperLosses"))
    $("paperLosses").textContent=
      state.stats.losses;

  if($("paperAccuracy"))
    $("paperAccuracy").textContent=
      state.stats.total
        ?Math.round(
          state.stats.wins/
          state.stats.total*100
        )+"%"
        :"0%";

  /* active trades */

  if($("activeTradeCount"))
    $("activeTradeCount").textContent=
      state.active.length;

  if($("activeTradesList")){

    $("activeTradesList").innerHTML=
      state.active.map(t=>`

        <div class="trade-row">

          <span>
            ${t.source}
            • ${t.market}
          </span>

          <b>
            ${t.strategy}
            ${t.target}
            • $${t.stake.toFixed(2)}
          </b>

        </div>

      `).join("")
      ||
      "<span class='muted'>No active demo trades.</span>";
  }

  /* history totals */

  if($("historyTotalStake"))
    $("historyTotalStake").textContent=
      "$"+state.stats.stake.toFixed(2);

  if($("historyAmountWon"))
    $("historyAmountWon").textContent=
      "$"+state.stats.won.toFixed(2);

  if($("historyNetProfit"))
    $("historyNetProfit").textContent=
      "$"+state.stats.profit.toFixed(2);

  if($("sessionProfitDisplay"))
    $("sessionProfitDisplay").textContent=
      "$"+state.stats.profit.toFixed(2);

  /* trade history */

  if($("historyCardsList")){

    $("historyCardsList").innerHTML=
      state.trades.map(t=>`

        <div class="history-card">

          <div class="history-row">

            <span>
              ${new Date(
                t.closed
              ).toLocaleTimeString()}
              • ${t.market}
            </span>

            <b class="${
              t.result==="WIN"
                ?"profit"
                :"loss"
            }">
              ${t.result}
            </b>

          </div>

          <p>
            ${t.strategy} ${t.target}
            • Stake $${t.stake.toFixed(2)}
            • Profit $${t.profit.toFixed(2)}
          </p>

        </div>

      `).join("")
      ||
      "<div class='card muted'>No completed demo trades.</div>";
  }

  drawChart();

  renderCycleDashboard();

  save();
}

/* =========================================================
   ACCURACY
========================================================= */

function accuracy(strategy){

  const arr=
    state.predictions.filter(
      p=>
        p.result &&
        (!strategy ||
         p.strategy===strategy)
    );

  if(!arr.length)
    return "—";

  const wins=
    arr.filter(
      p=>p.result==="WIN"
    ).length;

  return Math.round(
    wins/arr.length*100
  )+"%";
}

function accuracyRecent(){

  const arr=
    state.predictions
      .filter(p=>p.result)
      .slice(0,30);

  if(!arr.length)
    return "—";

  const wins=
    arr.filter(
      p=>p.result==="WIN"
    ).length;

  return Math.round(
    wins/arr.length*100
  )+"%";
}

/* =========================================================
   CHART
========================================================= */

function drawChart(){

  const canvas=
    $("priceChartCanvas");

  if(!canvas)return;

  const ctx=
    canvas.getContext("2d");

  const dpr=
    window.devicePixelRatio||1;

  const width=
    canvas.clientWidth||300;

  const height=
    canvas.clientHeight||220;

  canvas.width=
    width*dpr;

  canvas.height=
    height*dpr;

  ctx.setTransform(
    dpr,0,0,dpr,0,0
  );

  ctx.clearRect(
    0,0,width,height
  );

  const data=
    (state.ticks[state.market]||[])
      .slice(-80);

  if(data.length<2)
    return;

  const min=
    Math.min(
      ...data.map(x=>x.price)
    );

  const max=
    Math.max(
      ...data.map(x=>x.price)
    );

  const range=
    max-min||1;

  ctx.beginPath();

  data.forEach((x,i)=>{

    const X=
      i/(data.length-1)*width;

    const Y=
      height-
      (x.price-min)/
      range*
      (height-15)-5;

    if(i)
      ctx.lineTo(X,Y);
    else
      ctx.moveTo(X,Y);
  });

  ctx.strokeStyle=
    getComputedStyle(
      document.documentElement
    ).getPropertyValue(
      "--accent"
    );

  ctx.lineWidth=2;

  ctx.stroke();

  ctx.fillStyle=
    getComputedStyle(
      document.documentElement
    ).getPropertyValue(
      "--muted"
    );

  ctx.font=
    "10px system-ui";

  ctx.fillText(
    "DIGIT MOVEMENT",
    8,
    14
  );

  data.slice(-20)
    .forEach((x,i)=>{

      ctx.fillText(
        String(x.digit),
        Math.max(
          5,
          width-135+i*6
        ),
        height-4
      );
    });
}

/* =========================================================
   LIGHT / DARK MODE
========================================================= */

function toggleTheme(){

  state.theme=
    state.theme==="light"
      ?"dark"
      :"light";

  applyTheme();
  save();
}

function applyTheme(){

  document.body.classList.toggle(
    "light",
    state.theme==="light"
  );

  if($("themeToggle")){

    $("themeToggle").textContent=
      state.theme==="light"
        ?"🌙"
        :"☀️";
  }
}

/* =========================================================
   HISTORY
========================================================= */

function clearHistory(){

  if(!confirm(
    "Clear demo history and statistics?"
  ))return;

  state.trades=[];
  state.predictions=[];

  state.stats={
    total:0,
    wins:0,
    losses:0,
    stake:0,
    won:0,
    profit:0
  };

  state.balance=
    START_BALANCE;

  save();
  render();
}

/* =========================================================
   STORAGE
========================================================= */

function save(){

  try{

    localStorage.setItem(
      "krishwave_free_prediction",
      JSON.stringify({

        balance:
          state.balance,

        trades:
          state.trades,

        predictions:
          state.predictions,

        stats:
          state.stats,

        theme:
          state.theme

      })
    );

  }catch(e){}
}

function load(){

  try{

    const data=
      JSON.parse(
        localStorage.getItem(
          "krishwave_free_prediction"
        )||"null"
      );

    if(!data)return;

    state.balance=
      Number.isFinite(
        data.balance
      )
        ?data.balance
        :START_BALANCE;

    state.trades=
      Array.isArray(data.trades)
        ?data.trades
        :[];

    state.predictions=
      Array.isArray(data.predictions)
        ?data.predictions
        :[];

    if(data.stats){

      state.stats={

        total:
          Number(data.stats.total)||0,

        wins:
          Number(data.stats.wins)||0,

        losses:
          Number(data.stats.losses)||0,

        stake:
          Number(data.stats.stake)||0,

        won:
          Number(data.stats.won)||0,

        profit:
          Number(data.stats.profit)||0

      };
    }

    state.theme=
      data.theme==="light"
        ?"light"
        :"dark";

  }catch(e){}
}

/* =========================================================
   TOAST
========================================================= */

let toastTimer;

function toast(message){

  const el=$("toast");

  if(!el)return;

  el.textContent=
    message;

  el.classList.add("show");

  clearTimeout(
    toastTimer
  );

  toastTimer=
    setTimeout(
      ()=>{
        el.classList.remove(
          "show"
        );
      },
      2400
    );
}

/* =========================================================
   PUBLIC API
========================================================= */

window.KRISHWAVE={

  state,

  engine,

  startBot,

  stopBot,

  useAI,

  manualTrade

};

/* =========================================================
   START
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);