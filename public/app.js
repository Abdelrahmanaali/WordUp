(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const SCREENS = ['home', 'play', 'mode', 'config', 'join', 'lobby', 'game', 'result', 'records'];
  const KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

  function getStored(key, fallback = '') { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
  function setStored(key, value) { try { localStorage.setItem(key, value); } catch {} }
  function makePlayerId() {
    const saved = getStored('wordupPlayerId'); if (saved) return saved;
    try { if (globalThis.crypto?.randomUUID) return crypto.randomUUID(); } catch {}
    return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  const S = {
    screen: 'home', mode: 'daily', timer: 120, code: null, nickname: '', ws: null, room: null,
    playerId: makePlayerId(), keyState: {}, inputBuffer: '', daily: null, clockInterval: null,
    homeInterval: null, sideLayout: true, initialized: false
  };
  setStored('wordupPlayerId', S.playerId);
  setStored('wordupLayout', 'side');

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2,'0')} : ${String(Math.floor((s % 3600) / 60)).padStart(2,'0')} : ${String(s % 60).padStart(2,'0')}`; };

  function show(name) { S.screen = name; SCREENS.forEach((screen) => $(`#${screen}Screen`)?.classList.toggle('active', screen === name)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function toast(message) { const el = $('#toast'); if (!el) return; el.textContent = message; el.classList.add('show'); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove('show'), 2600); }

  function updateHomeCountdown() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone:'Africa/Cairo', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).formatToParts(new Date()).reduce((out,p)=>(out[p.type]=p.value,out),{});
    const total = Number(parts.hour)*3600 + Number(parts.minute)*60 + Number(parts.second), left = (86400-total)%86400;
    const el = $('#dailyCountdown'); if (el) el.textContent = `${String(Math.floor(left/3600)).padStart(2,'0')} : ${String(Math.floor((left%3600)/60)).padStart(2,'0')} : ${String(left%60).padStart(2,'0')}`;
    const sub = document.querySelector('.hero-reset-sub'); if (sub) sub.textContent = 'New daily word at Egypt midnight';
  }

  function dailyHide(on) {
    [$('#gameScreen .game-top .pill.right'), $('#gameScreen .side.left'), $('#gameScreen .side.right')].filter(Boolean).forEach(el => el.classList.toggle('daily-hide', on));
    $('#gameScreen .game')?.classList.toggle('daily-game', on);
  }

  function applyLayout() {
    const game = $('#gameScreen .game'), toggle = $('#layoutToggle'); if (!game) return;
    const desktop = window.matchMedia('(min-width:951px)').matches;
    game.classList.toggle('layout-side', desktop && S.sideLayout);
    if (toggle) { toggle.textContent = desktop ? (S.sideLayout ? '▣' : '⌘') : '⌘'; toggle.title = desktop ? (S.sideLayout ? 'Use stacked layout' : 'Move keyboard to the right') : 'Desktop layout options'; }
  }

  function renderKeyboard() {
    const board = $('#keyboard'); if (!board) return; board.innerHTML = '';
    KEYS.forEach((letters,rowIndex) => { const row = document.createElement('div'); row.className='key-row';
      if (rowIndex===2) row.appendChild(makeKey('ENTER','wide',submitGuess));
      for (const letter of letters) row.appendChild(makeKey(letter.toUpperCase(),S.keyState[letter]||'',()=>typeKey(letter)));
      if (rowIndex===2) row.appendChild(makeKey('⌫','wide',()=>typeKey('back'))); board.appendChild(row);
    });
  }
  function makeKey(label,state,action) { const button=document.createElement('button'); button.type='button'; button.className=`key ${state}`.trim(); button.textContent=label; button.addEventListener('click',action); return button; }
  function resetKeyboard() { S.keyState={}; S.inputBuffer=''; renderKeyboard(); renderTypingRow(); }

  function renderTypingRow() {
    const board=$('#board'); if(!board) return; const rows=board.querySelectorAll('.row'), index=Math.min(S.daily?.guesses?.length||0,5), row=rows[index]; if(!row)return;
    row.querySelectorAll('.cell').forEach((cell,i)=>{ const value=S.inputBuffer[i]||''; if(cell.textContent!==value){ cell.textContent=value; cell.classList.remove('typing'); if(value){void cell.offsetWidth;cell.classList.add('typing');} } });
  }
  function typeKey(key) {
    if(S.screen!=='game'||S.daily?.ended)return;
    if(key==='back') S.inputBuffer=S.inputBuffer.slice(0,-1);
    else if(/^[a-z]$/.test(key)&&S.inputBuffer.length<5){ S.inputBuffer+=key; const button=[...document.querySelectorAll('#keyboard .key')].find(el=>el.textContent.toLowerCase()===key); if(button){button.classList.remove('typing');void button.offsetWidth;button.classList.add('typing');} }
    renderTypingRow();
  }
  function applyKeyboard(guess,colors){ if(guess&&colors)guess.split('').forEach((letter,index)=>{const next=colors[index],current=S.keyState[letter];if(next==='green'||(next==='yellow'&&current!=='green')||(next==='gray'&&!current))S.keyState[letter]=next;}); renderKeyboard(); }
  async function api(path,options={}){ const response=await fetch(path,{cache:'no-store',...options}); const data=await response.json().catch(()=>({})); if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`); return data; }

  async function startDaily(){
    try{
      clearInterval(S.clockInterval); if(S.ws&&S.ws.readyState<2)S.ws.close(); S.ws=null; S.mode='daily';
      S.daily={guesses:[],startedAt:Date.now(),ended:false,result:null,word:null,date:null}; resetKeyboard();
      const data=await api('/api/daily',{method:'POST'}); S.daily.date=data.date; show('game'); dailyHide(true);
      $('#meName')?.replaceChildren(document.createTextNode('DAILY CHALLENGE')); $('#meAvatar')?.replaceChildren(document.createTextNode('✦'));
      $('#gameModeLabel')?.replaceChildren(document.createTextNode("TODAY'S WORD")); $('#clock')?.replaceChildren(document.createTextNode('∞'));
      renderDailyBoard(); renderKeyboard(); renderTypingRow(); applyLayout();
    }catch(error){console.error('[WordUp] Daily start failed:',error);toast(error.message||"Couldn't start today's challenge.");}
  }

  async function submitDailyGuess(guess){
    if(!S.daily||S.daily.ended)return;
    try{
      const data=await api('/api/daily/guess',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({guess,attempt:S.daily.guesses.length+1})});
      S.daily.guesses.push({guess,colors:data.colors}); S.inputBuffer=''; applyKeyboard(guess,data.colors); renderDailyBoard(); renderTypingRow();
      if(data.correct)return finishDaily('win'); if(S.daily.guesses.length>=6)return finishDaily('loss');
    }catch(error){console.error('[WordUp] Daily guess failed:',error);toast(error.message||'Could not check that word.');}
  }

  function ensureLossModal(){
    let modal=$('#lossModal'); if(modal)return modal; modal=document.createElement('div'); modal.id='lossModal'; modal.className='modal hidden';
    modal.innerHTML='<div class="modal-card"><div class="eyebrow">ROUND COMPLETE</div><h2>Want to see the word? 😉</h2><div class="result-actions"><button id="revealDaily" class="primary" type="button">Reveal</button><button id="keepHidden" class="secondary" type="button">Keep Hidden</button></div></div>';
    document.body.appendChild(modal); $('#revealDaily')?.addEventListener('click',revealDaily); $('#keepHidden')?.addEventListener('click',()=>{modal.classList.add('hidden');showDailyResult(false);}); return modal;
  }
  function finishDaily(result){ if(!S.daily)return; S.daily.ended=true; S.daily.result=result; fetch('/api/daily/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:S.daily.date,result,guesses:S.daily.guesses.length})}).catch(()=>{}); if(result==='win')return showDailyResult(false); ensureLossModal().classList.remove('hidden'); }
  function showDailyResult(revealed){ show('result'); if($('#resultIcon'))$('#resultIcon').textContent=S.daily?.result==='win'?'✓':'×'; if($('#resultTitle'))$('#resultTitle').textContent=S.daily?.result==='win'?'You got it!':'Not this time.'; if($('#resultText'))$('#resultText').textContent=S.daily?.result==='win'?`Solved in ${S.daily.guesses.length}/6 guesses.`:(revealed&&S.daily.word?`The word was ${S.daily.word.toUpperCase()}.`:'You used all 6 guesses.'); if($('#playAgain'))$('#playAgain').textContent="Try Today's Word Again"; }
  async function revealDaily(){try{const data=await api('/api/daily/reveal');S.daily.word=data.word;$('#lossModal')?.classList.add('hidden');showDailyResult(true);}catch(error){toast(error.message||'Could not reveal the word.');}}

  function renderBoardFrom(guesses){ const board=$('#board'); if(!board)return; board.innerHTML=''; for(let rowIndex=0;rowIndex<6;rowIndex++){const row=document.createElement('div');row.className='row';const guess=guesses[rowIndex];for(let i=0;i<5;i++){const cell=document.createElement('div');cell.className='cell';if(guess){cell.textContent=guess.guess[i].toUpperCase();cell.classList.add(guess.colors[i]);}row.appendChild(cell);}board.appendChild(row);} }
  function renderDailyBoard(){const guesses=S.daily?.guesses||[];renderBoardFrom(guesses);if($('#guessCount'))$('#guessCount').textContent=`${guesses.length}/6`;}

  function send(message){if(S.ws?.readyState===1)S.ws.send(JSON.stringify(message));}
  function connect(){if(S.ws&&S.ws.readyState<2)S.ws.close();const protocol=location.protocol==='https:'?'wss':'ws';S.ws=new WebSocket(`${protocol}://${location.host}/ws/${S.code}/ws?playerId=${encodeURIComponent(S.playerId)}&nickname=${encodeURIComponent(S.nickname)}`);S.ws.onmessage=event=>{try{handle(JSON.parse(event.data));}catch{toast('Invalid room response.');}};S.ws.onerror=()=>toast('Could not connect to the room.');}
  function me(){return S.room?.players.find(player=>player.id===S.playerId)} function opp(){return S.room?.players.find(player=>player.id!==S.playerId)}
  function handle(message){if(message.type==='error')return toast(message.message);if(message.type==='state'){S.room=message.state;if(message.selfId){S.playerId=message.selfId;setStored('wordupPlayerId',S.playerId);}renderState();}if(message.type==='guessResult')applyKeyboard(message.guess,message.colors);}
  function renderState(){const room=S.room;if(!room)return;const self=me(),other=opp();
    if(room.status==='waiting'){show('lobby');if($('#roomCodeDisplay'))$('#roomCodeDisplay').textContent=room.code||S.code;if($('#lobbyStatus'))$('#lobbyStatus').textContent='Waiting for your friend to join…';if($('#players'))$('#players').innerHTML=room.players.map(p=>`<div class="player"><strong>${esc(p.nickname)}</strong><small>${p.ready?'READY ✓':'NOT READY'}</small></div>`).join('');if($('#readyBtn'))$('#readyBtn').disabled=!!self?.ready;return;}
    if(room.status==='playing'){show('game');dailyHide(false);if($('#meName'))$('#meName').textContent=self?.nickname||S.nickname;if($('#oppName'))$('#oppName').textContent=other?.nickname||'Waiting…';if($('#meAvatar'))$('#meAvatar').textContent=(self?.nickname||'Y')[0].toUpperCase();if($('#oppAvatar'))$('#oppAvatar').textContent=(other?.nickname||'F')[0].toUpperCase();renderBoardFrom(self?.guesses||[]);if($('#guessCount'))$('#guessCount').textContent=`${self?.guesses?.length||0}/6`;if($('#oppStats'))$('#oppStats').innerHTML=other?`<strong>${esc(other.nickname)}</strong><br>${other.guesses.length}/6 guesses`:'Waiting for friend…';if($('#gameModeLabel'))$('#gameModeLabel').textContent='FRIEND DUEL';startClock(room);applyLayout();return;}
    if(room.status==='ended'){show('result');clearInterval(S.clockInterval);renderResult(room,self);}
  }
  function startClock(room){clearInterval(S.clockInterval);const tick=()=>{if($('#clock'))$('#clock').textContent=fmt(room.timer*1000-(Date.now()-room.startedAt));};tick();S.clockInterval=setInterval(tick,250);}
  function renderResult(room,player){const type=room.result?.type,win=room.result?.winnerId===player?.id;if($('#resultIcon'))$('#resultIcon').textContent=type==='draw'?'=':win?'✓':'×';if($('#resultTitle'))$('#resultTitle').textContent=type==='draw'?"It's a draw.":win?'You won.':'Game over.';if($('#resultText'))$('#resultText').textContent=room.result?.reason||'Round complete.';if($('#playAgain'))$('#playAgain').textContent='Back Home';}

  function initTimers(){const grid=$('#timerGrid');if(!grid)return;grid.innerHTML='';[[60,'1 min'],[90,'1.5 min'],[120,'2 min'],[180,'3 min'],[300,'5 min']].forEach(([seconds,label])=>{const button=document.createElement('button');button.type='button';button.className=`timer${seconds===120?' active':''}`;button.textContent=label;button.addEventListener('click',()=>{$$('.timer').forEach(el=>el.classList.remove('active'));button.classList.add('active');S.timer=seconds;});grid.appendChild(button);});}
  async function loadHistory(){const board=$('#records');if(!board)return;try{const data=await api('/api/history?limit=30');board.innerHTML=data.games?.length?data.games.map(game=>`<div class="record"><strong>${esc(game.room_code||'—')}</strong><span>${esc(game.player_one_name||'—')} vs ${esc(game.player_two_name||'—')}</span><span>${esc(game.result||'—')}</span><span>${esc(game.created_at||'')}</span></div>`).join(''):'<div class="empty">No games recorded yet.</div>';}catch{board.innerHTML='<div class="empty">Could not load records.</div>';}}

  function submitGuess(){const guess=S.inputBuffer.trim().toLowerCase();if(guess.length!==5)return toast('Enter exactly 5 letters.');if(S.mode==='daily')return submitDailyGuess(guess);send({type:'guess',guess});S.inputBuffer='';renderTypingRow();}
  function goBack(target){show(target||'home');}

  function wire(){
    if(S.initialized)return;S.initialized=true;initTimers();updateHomeCountdown();S.homeInterval=setInterval(updateHomeCountdown,1000);
    const on=(id,event,handler)=>{const el=$(`#${id}`);if(el)el.addEventListener(event,handler);};
    on('playOnline','click',startDaily);on('dailyHome','click',startDaily);on('playFriends','click',()=>show('play'));on('createBtn','click',()=>{S.mode='duel';if($('#configEyebrow'))$('#configEyebrow').textContent='CREATE DUEL';if($('#configScreen h2'))$('#configScreen h2').textContent='Set up your room';if($('#startButton'))$('#startButton').innerHTML='Create Room <b>→</b>';$('#timerGrid')?.classList.remove('hidden');show('config');});on('joinBtn','click',()=>show('join'));on('howBtn','click',()=>$('#howModal')?.classList.remove('hidden'));on('homeHow','click',()=>$('#howModal')?.classList.remove('hidden'));on('closeHow','click',()=>$('#howModal')?.classList.add('hidden'));on('recordsBtn','click',async()=>{show('records');await loadHistory();});
    on('configForm','submit',async event=>{event.preventDefault();S.nickname=$('#nickname')?.value.trim()||'';if(!S.nickname)return toast('Enter a nickname.');try{const data=await api('/api/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nickname:S.nickname,timer:S.timer})});S.code=data.code;resetKeyboard();connect();}catch(error){toast(error.message||'Could not start game.');}});
    on('joinForm','submit',event=>{event.preventDefault();S.nickname=$('#joinNickname')?.value.trim()||'';S.code=($('#roomCode')?.value||'').trim().toUpperCase();if(!S.nickname||S.code.length!==6)return toast('Enter a nickname and 6-character code.');resetKeyboard();connect();});
    on('readyBtn','click',()=>send({type:'ready'}));on('playAgain','click',()=>S.mode==='daily'?startDaily():show('home'));on('backHome','click',()=>show('home'));
    on('layoutToggle','click',()=>{if(!window.matchMedia('(min-width:951px)').matches)return;S.sideLayout=!S.sideLayout;setStored('wordupLayout',S.sideLayout?'side':'stacked');applyLayout();});
    on('copyLink','click',async()=>{if(!S.code)return;try{await navigator.clipboard.writeText(`${location.origin}/?room=${S.code}`);toast('Invite link copied.');}catch{toast(`Room code: ${S.code}`);}});
    document.addEventListener('keydown',event=>{if(S.screen!=='game')return;if(event.key==='Enter'){event.preventDefault();submitGuess();}else if(event.key==='Backspace'){event.preventDefault();typeKey('back');}else if(/^[a-zA-Z]$/.test(event.key)){event.preventDefault();typeKey(event.key.toLowerCase());}});
    $$('.back[data-back]').forEach(button=>button.addEventListener('click',()=>goBack(button.dataset.back)));window.addEventListener('resize',applyLayout);applyLayout();console.info('[WordUp] Frontend initialized successfully.');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
  globalThis.WordUp=Object.freeze({startDaily,show,version:'2026-09-18-stable'});
})();
