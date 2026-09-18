/* KRISHWAVE FREE PREDICTION AI
   Fresh demo engine. No Deriv login, OAuth, Cloudflare Worker or Circular AI.
   All trades are paper/demo only.
*/
"use strict";

const MARKETS=["R_10","R_25","R_50","R_75","R_100","1HZ10V","1HZ25V","1HZ30V","1HZ50V","1HZ75V","1HZ90V","1HZ100V","1HZ150V","1HZ250V","1HZ1000V"];
const MAX=250, START=1000;
const state={market:"R_100",ticks:{},prices:{},predictions:[],trades:[],active:[],balance:START,bot:false,botTimer:null,theme:"dark",stats:{total:0,wins:0,losses:0,stake:0,won:0,profit:0}};
const $=id=>document.getElementById(id);
const markets=[...MARKETS];

function init(){
  load();
  for(const m of markets){state.ticks[m]=[];state.prices[m]=1000+Math.random()*50}
  populate("analysisMarketSelect");populate("botMarketSelect");populate("manualMarketSelect");
  ["analysisMarketSelect","botMarketSelect","manualMarketSelect"].forEach(id=>$(id).addEventListener("change",e=>{state.market=e.target.value;syncMarkets();render()}));
  document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>showPage(b.dataset.page,b));
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>showTab(b.dataset.tab,b));
  $("manualStrategySelect").onchange=renderManualTarget;
  $("useAiPredictionBtn").onclick=useAI;
  $("useAiPredictionAnalysis").onclick=useAI;
  $("placeTradeBtn").onclick=manualTrade;
  $("startBotBtn").onclick=startBot;
  $("stopTradingBtn").onclick=stopBot;
  $("clearLogsBtn").onclick=clearHistory;
  $("themeToggle").onclick=()=>document.body.classList.toggle("light");
  syncMarkets();renderManualTarget();render();
  for(let i=0;i<120;i++) generateTick(true);
  setInterval(()=>{generateTick(false)},900);
  setInterval(()=>{render()},1500);
}
function populate(id){$(id).innerHTML=markets.map(m=>`<option value="${m}" ${m===state.market?"selected":""}>${m}</option>`).join("")}
function syncMarkets(){["analysisMarketSelect","botMarketSelect","manualMarketSelect"].forEach(id=>$(id).value=state.market)}
function showPage(id,b){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$(id).classList.add("active");document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));b.classList.add("active")}
function showTab(id,b){document.querySelectorAll(".trade-panel").forEach(x=>x.classList.remove("active"));$(id).classList.add("active");document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active")}
function getDigit(price){return Number(String(price.toFixed(5)).replace(/\D/g,"").slice(-1))}
function generateTick(seed){
  for(const m of markets){
    let p=state.prices[m];
    let drift=(Math.random()-.5)*2.5;
    p=Math.max(100,p+drift);
    state.prices[m]=p;
    const d=getDigit(p);
    state.ticks[m].push({price:p,digit:d,time:Date.now()});
    if(state.ticks[m].length>MAX)state.ticks[m].shift();
    settle(m,d);
  }
  if(!seed && state.bot) botCycle();
}
function windows(arr){return [20,50,100,200].map(n=>arr.slice(-Math.min(n,arr.length)))}
function freq(arr){const c=Array(10).fill(0);arr.forEach(x=>c[x]++);return c.map(v=>v/(arr.length||1))}
function transitions(arr){
  const t=Array.from({length:10},()=>Array(10).fill(0));
  for(let i=1;i<arr.length;i++)t[arr[i-1]][arr[i]]++;
  const last=arr.at(-1); const row=t[last]; const s=row.reduce((a,b)=>a+b,0);
  return row.map(x=>x/(s||1));
}
function entropy(f){return -f.reduce((s,p)=>s+(p? p*Math.log2(p):0),0)/Math.log2(10)}
function engine(symbol){
  const raw=state.ticks[symbol]||[], ds=raw.map(x=>x.digit), n=ds.length;
  if(n<30)return {symbol,sampleCount:n,confidence:0,strategy:"WAIT",predictedDigit:null,barrier:null,signal:"WAIT",reason:"Collecting tick history."};
  const ws=windows(ds), weights=[.40,.28,.20,.12], score=Array(10).fill(0);
  ws.forEach((w,i)=>freq(w).forEach((p,d)=>score[d]+=p*weights[i]));
  const tr=transitions(ds.slice(-120)), last=ds.at(-1);
  tr.forEach((p,d)=>score[d]+=p*.18);
  const ranked=score.map((v,d)=>({d,v})).sort((a,b)=>b.v-a.v);
  const pred=ranked[0].d, second=ranked[1].v;
  const margin=Math.max(0,ranked[0].v-second);
  const stability=1-entropy(freq(ds.slice(-50)));
  const rec=freq(ds.slice(-20))[pred], base=freq(ds)[pred];
  const support=Math.min(1,Math.max(0,rec-base+.15));
  const rawConf=52+margin*260+stability*16+support*18;
  const confidence=Math.round(Math.min(94,Math.max(35,rawConf)));
  const recent=ds.slice(-50);
  const rf=freq(recent);
  const bestOver=[5,6,7,8].map(d=>rf[d]).reduce((a,b)=>a+b,0);
  const bestUnder=[0,1,2,3,4].map(d=>rf[d]).reduce((a,b)=>a+b,0);
  const candidate=[
    {strategy:"MATCHES",edge:rf[pred],digit:pred},
    {strategy:"DIFFERS",edge:1-rf[pred],digit:pred},
    {strategy:"OVER",edge:bestOver,barrier:4},
    {strategy:"UNDER",edge:bestUnder,barrier:5}
  ].sort((a,b)=>b.edge-a.edge);
  let best=candidate[0];
  // Do not confuse frequency with guaranteed probability: require separation from a neutral baseline.
  const edge=Math.abs(best.edge-(best.strategy==="MATCHES"||best.strategy==="DIFFERS"?.1:.5));
  const finalConf=Math.round(Math.min(94,confidence+edge*12));
  const signal=finalConf>=68?"SIGNAL":"NO SIGNAL";
  return {symbol,sampleCount:n,predictedDigit:pred,barrier:best.barrier??pred,strategy:best.strategy,confidence:finalConf,signal,
    reason:`${best.strategy} selected from multi-window frequency, transitions and stability. Last digit ${last}.`,
    frequencies:freq(ds.slice(-100)),stability};
}
function accuracy(strategy){
  const a=state.predictions.filter(x=>x.result&&(!strategy||x.strategy===strategy));
  if(!a.length)return "—";
  return Math.round(a.filter(x=>x.result==="WIN").length/a.length*100)+"%";
}
function createPrediction(a){
  if(a.signal==="NO SIGNAL")return;
  state.predictions.unshift({id:Date.now()+Math.random(),market:a.symbol,strategy:a.strategy,digit:a.predictedDigit,barrier:a.barrier,confidence:a.confidence,created:Date.now(),result:null});
  state.predictions=state.predictions.slice(0,100);
}
function validatePredictions(m,d){
  state.predictions.forEach(p=>{
    if(p.result||p.market!==m)return;
    let win=false;
    if(p.strategy==="MATCHES")win=d===p.digit;
    if(p.strategy==="DIFFERS")win=d!==p.digit;
    if(p.strategy==="UNDER")win=d<p.barrier;
    if(p.strategy==="OVER")win=d>p.barrier;
    p.result=win?"WIN":"LOSS";
  });
  save();
}
function settle(m,d){
  validatePredictions(m,d);
  state.active.filter(t=>t.market===m).forEach(t=>{
    let win=t.strategy==="MATCHES"?d===t.target:t.strategy==="DIFFERS"?d!==t.target:t.strategy==="UNDER"?d<t.target:d>t.target;
    finishTrade(t,win);
  });
}
function finishTrade(t,win){
  if(!state.active.includes(t))return;
  state.active=state.active.filter(x=>x!==t);
  const payout=win?t.stake*(t.strategy==="MATCHES"?8.5:.95):0;
  const profit=payout-t.stake;
  state.balance+=payout;
  state.stats.total++;state.stats.stake+=t.stake;state.stats.won+=payout;state.stats.profit+=profit;
  win?state.stats.wins++:state.stats.losses++;
  state.trades.unshift({...t,result:win?"WIN":"LOSS",payout,profit,closed:Date.now()});
  state.trades=state.trades.slice(0,100);save();render();
}
function manualTrade(){
  const a=engine(state.market), strategy=$("manualStrategySelect").value;
  let target=Number($("manualTargetDigitInput").value);
  if(!Number.isInteger(target)||target<0||target>9){toast("Enter a target digit/barrier from 0 to 9.");return}
  const stake=Math.max(.25,Number($("manualStakeInput").value)||1);
  if(stake>state.balance){toast("Insufficient paper balance.");return}
  state.balance-=stake;state.active.push({id:Date.now(),market:state.market,strategy,target,stake,source:"MANUAL"});
  $("manualStatusText").textContent=`${strategy} ${target} placed — waiting for next tick.`;
  render();save();
}
function useAI(){
  const a=engine(state.market);
  if(a.signal==="NO SIGNAL"){toast("AI has NO SIGNAL — wait for stronger evidence.");return}
  $("manualStrategySelect").value=a.strategy;
  $("manualTargetDigitInput").value=a.barrier??a.predictedDigit;
  showPage("tradePage",document.querySelector('[data-page="tradePage"]'));showTab("manualPanel",document.querySelector('[data-tab="manualPanel"]'));
  renderManualTarget();toast(`AI prediction loaded: ${a.strategy} ${a.barrier??a.predictedDigit}`);
}
function renderManualTarget(){$("targetDigitContainer").style.display="block"}
function startBot(){if(state.bot)return;state.bot=true;$("startBotBtn").textContent="AI BOT RUNNING";$("botStatusDash").textContent="RUNNING";botCycle();toast("AI Bot started in demo mode.")}
function stopBot(){state.bot=false;clearTimeout(state.botTimer);$("startBotBtn").textContent="START AI BOT";$("botStatusDash").textContent="STOPPED";toast("AI Bot stopped.")}
function botCycle(){
  if(!state.bot)return;
  const symbol=$("botMarketSelect").value||state.market, chosen=$("botStrategySelect").value;
  const a=engine(symbol);
  $("botScore").textContent=a.confidence+"%";
  if(a.signal==="SIGNAL"){
    let strategy=chosen==="AUTO"?a.strategy:chosen;
    let target=strategy==="UNDER"?a.barrier:strategy==="OVER"?a.barrier:a.predictedDigit;
    const stake=Math.max(.25,Number($("stakeInput").value)||1);
    if(stake<=state.balance){state.balance-=stake;state.active.push({id:Date.now(),market:symbol,strategy,target,stake,source:"AI BOT"});}
  }
  render();state.botTimer=setTimeout(botCycle,3000);
}
function render(){
  const a=engine(state.market);
  $("digitSampleCount").textContent=a.sampleCount;$("lastDigit").textContent=state.ticks[state.market]?.at(-1)?.digit??"-";
  $("analysisConfidence").textContent=a.confidence+"%";$("aiStatus").textContent=a.signal;$("aiType").textContent=a.strategy;
  $("aiPrediction").textContent=a.signal==="SIGNAL"?(a.strategy==="MATCHES"||a.strategy==="DIFFERS"?`${a.strategy} • ${a.predictedDigit}`:`${a.strategy} • ${a.barrier}`):"NO SIGNAL";
  $("analysisMsg").textContent=a.reason;
  const f=a.frequencies||Array(10).fill(0);$("digitStatsGrid").innerHTML=f.map((p,d)=>`<div class="digit"><b>${d}</b><small>${Math.round(p*100)}%</small></div>`).join("");
  $("accuracyAll").textContent=accuracy();$("accuracyRecent").textContent=accuracyRecent();$("accuracyMatches").textContent=accuracy("MATCHES");$("accuracyDiffers").textContent=accuracy("DIFFERS");$("accuracyUnder").textContent=accuracy("UNDER");$("accuracyOver").textContent=accuracy("OVER");
  $("predictionCount").textContent=state.predictions.length;$("predictionHistory").innerHTML=state.predictions.slice(0,8).map(p=>`<div class="history-row"><span>${p.market} • ${p.strategy} ${p.barrier??p.digit} • ${p.confidence}%</span><b class="${p.result==="WIN"?"profit":p.result==="LOSS"?"loss":""}">${p.result||"PENDING"}</b></div>`).join("")||"<div class='muted'>No predictions yet.</div>";
  $("balanceDisplay").textContent="$"+state.balance.toFixed(2);$("paperTotal").textContent=state.stats.total;$("paperWins").textContent=state.stats.wins;$("paperLosses").textContent=state.stats.losses;$("paperAccuracy").textContent=state.stats.total?Math.round(state.stats.wins/state.stats.total*100)+"%":"0%";
  $("activeTradeCount").textContent=state.active.length;$("activeTradesList").innerHTML=state.active.map(t=>`<div class="trade-row"><span>${t.source} • ${t.market}</span><b>${t.strategy} ${t.target} • $${t.stake.toFixed(2)}</b></div>`).join("")||"<span class='muted'>No active demo trades.</span>";
  $("historyTotalStake").textContent="$"+state.stats.stake.toFixed(2);$("historyAmountWon").textContent="$"+state.stats.won.toFixed(2);$("historyNetProfit").textContent="$"+state.stats.profit.toFixed(2);$("sessionProfitDisplay").textContent="$"+state.stats.profit.toFixed(2);
  $("historyCardsList").innerHTML=state.trades.map(t=>`<div class="history-card"><div class="history-row"><span>${new Date(t.closed).toLocaleTimeString()} • ${t.market}</span><b class="${t.result==="WIN"?"profit":"loss"}">${t.result}</b></div><p>${t.strategy} ${t.target} • Stake $${t.stake.toFixed(2)} • Profit $${t.profit.toFixed(2)}</p></div>`).join("")||"<div class='card muted'>No completed demo trades.</div>";
  drawChart();save();
  if(a.signal==="SIGNAL" && (!state.predictions[0]||Date.now()-state.predictions[0].created>5000))createPrediction(a);
}
function accuracyRecent(){const a=state.predictions.filter(x=>x.result).slice(0,30);return a.length?Math.round(a.filter(x=>x.result==="WIN").length/a.length*100)+"%":"—"}
function drawChart(){
  const c=$("priceChartCanvas"),ctx=c.getContext("2d"),dpr=devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;c.width=w*dpr;c.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const a=(state.ticks[state.market]||[]).slice(-80);if(a.length<2)return;const min=Math.min(...a.map(x=>x.price)),max=Math.max(...a.map(x=>x.price)),range=max-min||1;
  ctx.beginPath();a.forEach((x,i)=>{const X=i/(a.length-1)*w,Y=h-(x.price-min)/range*(h-15)-5;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y)});ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue("--accent");ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--muted");ctx.font="10px system-ui";ctx.fillText("DIGIT MOVEMENT",8,14);
  a.slice(-20).forEach((x,i)=>{ctx.fillText(String(x.digit),w-135+i*6,h-4)})
}
function clearHistory(){if(!confirm("Clear demo history and statistics?"))return;state.trades=[];state.predictions=[];state.stats={total:0,wins:0,losses:0,stake:0,won:0,profit:0};state.balance=START;save();render()}
function save(){try{localStorage.setItem("krishwave_free_prediction",JSON.stringify({balance:state.balance,trades:state.trades,predictions:state.predictions,stats:state.stats}))}catch(e){}}
function load(){try{const x=JSON.parse(localStorage.getItem("krishwave_free_prediction")||"null");if(x){state.balance=x.balance??START;state.trades=x.trades||[];state.predictions=x.predictions||[];state.stats=x.stats||state.stats}}catch(e){}}
let toastTimer;function toast(s){$("toast").textContent=s;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2400)}
window.KRISHWAVE={state,engine,startBot,stopBot,useAI,manualTrade};
document.addEventListener("DOMContentLoaded",init);