const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const screens=["home","play","mode","config","join","lobby","game","result","records"];
const S={screen:"home",mode:"daily",timer:120,code:null,nickname:"",playerId:localStorage.getItem("wordupPlayerId")||crypto.randomUUID(),ws:null,room:null,hints:[],startedAt:null};
localStorage.setItem("wordupPlayerId",S.playerId);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function show(n){S.screen=n;screens.forEach(x=>$("#"+x+"Screen")?.classList.toggle("active",x===n));scrollTo({top:0,behavior:"smooth"})}
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)}
function fmt(ms){const s=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`}
function send(o){if(S.ws?.readyState===1)S.ws.send(JSON.stringify(o))}
function connect(){if(S.ws&&S.ws.readyState<2)S.ws.close();const p=location.protocol==="https:"?"wss":"ws";S.ws=new WebSocket(`${p}://${location.host}/ws/${S.code}/ws?playerId=${encodeURIComponent(S.playerId)}&nickname=${encodeURIComponent(S.nickname)}`);S.ws.onopen=()=>toast("Connected to room.");S.ws.onmessage=e=>handle(JSON.parse(e.data));S.ws.onclose=()=>{if(["lobby","game"].includes(S.screen))toast("Connection closed. Refresh to reconnect.")}}
function handle(m){if(m.type==="error")return toast(m.message);if(m.type==="hint"){S.hints[m.index]=m.text;renderHints();return}if(m.type==="state"){S.room=m.state;if(m.selfId)S.playerId=m.selfId;renderState()}if(m.type==="guessResult")renderBoard()}
function me(){return S.room?.players.find(p=>p.id===S.playerId)}
function opp(){return S.room?.players.find(p=>p.id!==S.playerId)}
function renderState(){const r=S.room;if(!r)return;const self=me(),other=opp();
 if(r.status==="waiting"){show("lobby");$("#roomCodeDisplay").textContent=r.code||S.code;$("#lobbyStatus").textContent=r.players.length<2?"Waiting for another player…":"Both players are here. Ready when you are.";$("#players").innerHTML=r.players.map(p=>`<div class="player"><strong>${esc(p.nickname)}</strong><small>${p.ready?"READY ✓":"NOT READY"}${p.connected?"":" · reconnecting…"}</small></div>`).join("");$("#readyBtn").disabled=!!self?.ready;$("#readyBtn").innerHTML=self?.ready?"Ready ✓":"I'm Ready <b>✓</b>";return}
 if(r.status==="playing"){show("game");$("#meName").textContent=self?.nickname||S.nickname;$("#oppName").textContent=other?.nickname||"Opponent";$("#meAvatar").textContent=(self?.nickname||"Y")[0].toUpperCase();$("#oppAvatar").textContent=(other?.nickname||"O")[0].toUpperCase();S.startedAt=r.startedAt;renderBoard();renderOpponent(other);renderHints();startClock(r);if(r.mode==="custom"&&r.setterId===self?.id){$("#guessInput").disabled=true;$("#guessBtn").disabled=true;$("#guessInput").placeholder="YOU SET THE WORD";$("#hintBtn").disabled=true}else{$("#guessInput").disabled=false;$("#guessBtn").disabled=false;$("#guessInput").placeholder="TYPE 5 LETTERS";$("#hintBtn").disabled=false}return}
 if(r.status==="ended"){show("result");if(S.clockInterval)clearInterval(S.clockInterval);renderResult(r,self)}}
function startClock(r){clearInterval(S.clockInterval);const tick=()=>{const left=r.timer*1000-(Date.now()-r.startedAt);$("#clock").textContent=fmt(left)};tick();S.clockInterval=setInterval(tick,250)}
function renderBoard(){const p=me();if(!p)return;const board=$("#board");board.innerHTML="";for(let i=0;i<6;i++){const row=document.createElement("div");row.className="row";const g=p.guesses[i];for(let j=0;j<5;j++){const c=document.createElement("div");c.className="cell";if(g){c.textContent=g.guess[j].toUpperCase();c.classList.add(g.colors[j])}row.appendChild(c)}board.appendChild(row)}
 $("#myBoard").innerHTML=p.guesses.map(g=>`<div class="mini">${g.guess.split("").map((c,i)=>`<i class="${g.colors[i]}">${c.toUpperCase()}</i>`).join("")}</div>`).join("")}
function renderOpponent(p){$("#oppStats").innerHTML=p?`<strong>${esc(p.nickname)}</strong><br>${p.guesses.length} guess${p.guesses.length===1?"":"es"}<br>${p.hintsUsed}/3 hints used`:"Waiting…"}
function renderHints(){const used=S.hints.filter(Boolean).length;$("#hintCount").textContent=`${Math.max(0,3-used)} left`;$("#hintBox").classList.toggle("hidden",used===0);$("#hintBox").innerHTML=S.hints.filter(Boolean).map((h,i)=>`<div><b>Hint ${i+1}</b> — ${esc(h)}</div>`).join("<hr style='border:0;border-top:1px solid #263147;margin:9px 0'>")}
function renderResult(r,p){const win=r.result?.winnerId===p?.id,draw=r.result?.type==="draw";$("#resultIcon").textContent=draw?"=":win?"✓":"×";$("#resultTitle").textContent=draw?"It's a draw.":win?"You won.":"You lost.";$("#resultText").textContent=r.result?.reason||"Round complete.";$("#resultWord").textContent=(r.result?.word||"-----").toUpperCase()}
function initTimers(){$("#timerGrid").innerHTML="";[[60,"1 min"],[90,"1.5 min"],[120,"2 min"],[180,"3 min"],[300,"5 min"]].forEach(([s,label])=>{const b=document.createElement("button");b.type="button";b.className="timer"+(s===120?" active":"");b.textContent=label;b.onclick=()=>{$$(".timer").forEach(x=>x.classList.remove("active"));b.classList.add("active");S.timer=s};$("#timerGrid").appendChild(b)})}
function addHint(){if($$("#hintInputs .hint-row").length>=6)return toast("Maximum 6 hints.");const d=document.createElement("div");d.className="hint-row";d.innerHTML=`<input maxlength="180" placeholder="Give a useful clue…"><button type="button" class="remove">×</button>`;d.querySelector(".remove").onclick=()=>d.remove();$("#hintInputs").appendChild(d)}
function resetHints(){$("#hintInputs").innerHTML="";for(let i=0;i<4;i++)addHint()}

$("#playOnline").onclick=()=>show("play");$("#playFriends").onclick=()=>show("play");$("#createBtn").onclick=()=>show("mode");$("#joinBtn").onclick=()=>show("join");
$("#dailyHome").onclick=()=>{S.mode="daily";$("#customFields").classList.add("hidden");$("#nickname").value=localStorage.getItem("wordupNickname")||"";show("config")};
$("#homeHow").onclick=$("#howBtn").onclick=()=>$("#howModal").classList.remove("hidden");
$("#closeHow").onclick=()=>$("#howModal").classList.add("hidden");
$("#recordsBtn").onclick=async()=>{show("records");await loadHistory()};
$$("[data-back]").forEach(b=>b.onclick=()=>show(b.dataset.back));
$$(".choice[data-mode]").forEach(b=>b.onclick=()=>{S.mode=b.dataset.mode;$("#customFields").classList.toggle("hidden",S.mode!=="custom");if(S.mode==="custom")resetHints();$("#nickname").value=localStorage.getItem("wordupNickname")||"";show("config")});
$("#addHint").onclick=addHint;

$("#configForm").onsubmit=async e=>{e.preventDefault();S.nickname=$("#nickname").value.trim();if(!S.nickname)return toast("Enter a nickname.");localStorage.setItem("wordupNickname",S.nickname);let w=null,h=[];if(S.mode==="custom"){w=$("#customWord").value.trim().toLowerCase();h=$$("#hintInputs .hint-row input").map(x=>x.value.trim()).filter(Boolean);if(!/^[a-z]{5}$/.test(w))return toast("Use exactly 5 English letters.");if(h.length<4||h.length>6)return toast("Use 4 to 6 hints.");}
 const res=await fetch("/api/create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({nickname:S.nickname,playerId:S.playerId,mode:S.mode,timer:S.timer,word:w,hints:h})});const d=await res.json();if(!res.ok)return toast(d.error||"Could not create room.");S.code=d.code;$("#roomCodeDisplay").textContent=S.code;show("lobby");connect()};

$("#joinForm").onsubmit=e=>{e.preventDefault();S.nickname=$("#joinNickname").value.trim();S.code=$("#roomCode").value.trim().toUpperCase();if(!S.nickname||S.code.length!==6)return toast("Enter a nickname and 6-character code.");localStorage.setItem("wordupNickname",S.nickname);$("#roomCodeDisplay").textContent=S.code;show("lobby");connect()};
$("#readyBtn").onclick=()=>send({type:"ready"});
$("#hintBtn").onclick=()=>{if(S.hints.filter(Boolean).length>=3)return toast("No hints left.");send({type:"hint"})};
$("#guessBtn").onclick=submitGuess;$("#guessInput").addEventListener("keydown",e=>{if(e.key==="Enter")submitGuess()});
function submitGuess(){if($("#guessInput").disabled)return;const g=$("#guessInput").value.trim().toLowerCase();if(g.length!==5)return toast("Enter exactly 5 letters.");send({type:"guess",guess:g});$("#guessInput").value=""}
$("#copyLink").onclick=async()=>{await navigator.clipboard.writeText(`${location.origin}/?room=${S.code}`);toast("Invite link copied.")};
$("#playAgain").onclick=()=>show("play");$("#backHome").onclick=()=>show("home");
async function loadHistory(){const r=await fetch("/api/history");const d=await r.json();$("#records").innerHTML=d.games?.length?d.games.map(g=>`<div class="record"><div><strong>${esc(g.room_code)}</strong><br><small>${esc(g.mode)}</small></div><div>${esc(g.player_one_name||"—")} vs ${esc(g.player_two_name||"—")}</div><div>Winner: <strong>${esc(g.winner_name||"Draw")}</strong></div><div>${new Date(g.created_at).toLocaleDateString()}</div></div>`).join(""):`<div class="empty">No completed games yet.</div>`}
initTimers();if(new URLSearchParams(location.search).get("room")){$("#roomCode").value=new URLSearchParams(location.search).get("room").toUpperCase();$("#joinNickname").value=localStorage.getItem("wordupNickname")||"";show("join")}
