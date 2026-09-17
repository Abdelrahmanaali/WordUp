import { DurableObject } from "cloudflare:workers";

const WORDS=["apple","brick","cloud","dream","flame","grape","heart","lemon","ocean","plant","river","sugar","tiger","train","water","world","chair","house","light","music","paper","smile","stone","table","green","party","quick","sleep","sound","beach"];
const TIMER_OPTIONS=[60,90,120,180,300];
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const nick=v=>String(v||"").trim().replace(/\s+/g," ").slice(0,18);
const word=v=>String(v||"").trim().toLowerCase().replace(/[^a-z]/g,"").slice(0,5);
const code=()=>{const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";return Array.from({length:6},()=>c[Math.floor(Math.random()*c.length)]).join("")};
const utcDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"UTC"}).format(new Date());
const daily=()=>{const day=utcDate();let h=0;for(const c of day)h=(h*31+c.charCodeAt(0))>>>0;return WORDS[h%WORDS.length]};
const randomWord=()=>WORDS[Math.floor(Math.random()*WORDS.length)];
function score(w,g){const a=Array(5).fill("gray"),r={};for(let i=0;i<5;i++){if(g[i]===w[i])a[i]="green";else r[w[i]]=(r[w[i]]||0)+1}for(let i=0;i<5;i++)if(a[i]==="gray"&&r[g[i]]>0){a[i]="yellow";r[g[i]]--}return a}
const attempt=(w,g)=>({guess:g,colors:score(w,g)});

export class GameRoom extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.env=env}
 async load(){let s=await this.ctx.storage.get("room");if(!s){s={code:null,mode:"duel",timer:120,word:null,status:"waiting",players:[],startedAt:null,endedAt:null,result:null};await this.ctx.storage.put("room",s)}return s}
 async save(s){await this.ctx.storage.put("room",s)}
 send(ws,p){try{ws.send(JSON.stringify(p))}catch{}}
 broadcast(p){for(const ws of this.ctx.getWebSockets())this.send(ws,p)}
 public(s){return{code:s.code,mode:s.mode,timer:s.timer,status:s.status,startedAt:s.startedAt,endedAt:s.endedAt,players:s.players.map(p=>({id:p.id,nickname:p.nickname,ready:p.ready,connected:p.connected,guesses:p.guesses.map(g=>attempt(s.word,g.guess))})),result:s.result?{winnerId:s.result.winnerId,winnerName:s.result.winnerName,type:s.result.type,word:s.word,reason:s.result.reason}:null}}
 async fetch(req){
  const u=new URL(req.url),s=await this.load();
  if(u.pathname.endsWith("/ws")){
   if(req.headers.get("Upgrade")!=="websocket")return new Response("WebSocket required",{status:426});
   const pid=u.searchParams.get("playerId"),name=nick(u.searchParams.get("nickname"));if(!pid||!name)return new Response("Missing player information",{status:400});
   let p=s.players.find(x=>x.id===pid);
   if(!p){if(s.players.length>=2)return new Response("Room is full",{status:409});p={id:pid,nickname:name,ready:false,guesses:[],connected:true};s.players.push(p)}else{p.nickname=name;p.connected=true}
   await this.save(s);const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.serializeAttachment({playerId:pid});
   this.send(server,{type:"state",state:this.public(s),selfId:pid});this.broadcast({type:"state",state:this.public(s)});return new Response(null,{status:101,webSocket:client});
  }
  if(u.pathname.endsWith("/init")){
   const b=await req.json().catch(()=>({}));if(s.code)return json({ok:true});
   s.code=b.code;s.mode="duel";s.timer=TIMER_OPTIONS.includes(+b.timer)?+b.timer:120;s.word=randomWord();s.status="waiting";s.startedAt=null;await this.save(s);return json({ok:true})
  }
  return json({ok:true,state:this.public(s)})
 }
 async webSocketMessage(ws,msg){
  const s=await this.load(),a=ws.deserializeAttachment()||{},p=s.players.find(x=>x.id===a.playerId);if(!p)return;let d;try{d=JSON.parse(msg)}catch{return}
  if(d.type==="ready"&&s.status==="waiting"){p.ready=true;if(s.players.length===2&&s.players.every(x=>x.ready)){s.status="playing";s.startedAt=Date.now();await this.ctx.storage.setAlarm(s.startedAt+s.timer*1000)}await this.save(s);this.broadcast({type:"state",state:this.public(s)});return}
  if(d.type==="guess"&&s.status==="playing"){
   const g=word(d.guess);if(g.length!==5)return this.send(ws,{type:"error",message:"Enter exactly 5 letters."});
   if(p.guesses.length>=6)return this.send(ws,{type:"error",message:"You have used all 6 guesses."});
   if(p.guesses.some(x=>x.guess===g))return this.send(ws,{type:"error",message:"You already tried that word."});
   p.guesses.push({guess:g,at:Date.now()});this.send(ws,{type:"guessResult",...attempt(s.word,g)});
   if(g===s.word){s.status="ended";s.endedAt=Date.now();s.result={winnerId:p.id,winnerName:p.nickname,type:"win",reason:"Solved the word"};await this.save(s);await this.persist(s);this.broadcast({type:"state",state:this.public(s)});return}
   if(s.players.length===2&&s.players.every(x=>x.guesses.length>=6)){s.status="ended";s.endedAt=Date.now();s.result={winnerId:null,winnerName:null,type:"draw",reason:"Both players used all 6 guesses"};await this.save(s);await this.persist(s);this.broadcast({type:"state",state:this.public(s)});return}
   await this.save(s);this.broadcast({type:"state",state:this.public(s)})
  }
 }
 async webSocketClose(ws){const s=await this.load(),a=ws.deserializeAttachment()||{},p=s.players.find(x=>x.id===a.playerId);if(p){p.connected=false;await this.save(s)}}
 async alarm(){const s=await this.load();if(s.status!=="playing")return;s.status="ended";s.endedAt=Date.now();s.result={winnerId:null,winnerName:null,type:"timeout",reason:"Time ran out"};await this.save(s);await this.persist(s);this.broadcast({type:"state",state:this.public(s)})}
 async persist(s){if(!this.env.WORDUP_DB)return;const p1=s.players[0]||{},p2=s.players[1]||{},now=new Date().toISOString();await this.env.WORDUP_DB.prepare(`INSERT INTO games(room_code,mode,word,timer_seconds,player_one_name,player_two_name,winner_name,result,player_one_guesses,player_two_guesses,player_one_hints,player_two_hints,duration_seconds,started_at,ended_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(s.code,s.mode,s.word,s.timer,p1.nickname||null,p2.nickname||null,s.result?.winnerName||null,s.result?.type||"unknown",p1.guesses?.length||0,p2.guesses?.length||0,0,0,s.startedAt&&s.endedAt?Math.round((s.endedAt-s.startedAt)/1000):null,s.startedAt?new Date(s.startedAt).toISOString():null,s.endedAt?new Date(s.endedAt).toISOString():null,now).run()}
}

export default{async fetch(req,env){const u=new URL(req.url);
 if(u.pathname==="/api/daily"&&req.method==="POST")return json({ok:true,date:utcDate()});
 if(u.pathname==="/api/daily/guess"&&req.method==="POST"){
  const b=await req.json().catch(()=>({})),g=word(b.guess),attemptNo=Number(b.attempt)||0;
  if(g.length!==5)return json({error:"Enter exactly 5 letters."},400);
  if(attemptNo<1||attemptNo>6)return json({error:"You have used all 6 guesses."},400);
  return json({ok:true,correct:g===daily(),colors:score(daily(),g)});
 }
 if(u.pathname==="/api/daily/reveal"&&req.method==="GET")return json({ok:true,word:daily()});
 if(u.pathname==="/api/daily/complete"&&req.method==="POST")return json({ok:true});
 if(u.pathname==="/api/create"&&req.method==="POST"){const b=await req.json().catch(()=>({})),name=nick(b.nickname);if(!name)return json({error:"Nickname is required."},400);const c=code(),stub=env.GAME_ROOMS.getByName(c);const r=await stub.fetch(new Request("https://room/init",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:c,mode:"duel",timer:b.timer})}));if(!r.ok)return json({error:"Could not create room."},500);return json({ok:true,code:c})}
 if(u.pathname==="/api/history"){if(!env.WORDUP_DB)return json({games:[]});const n=Math.min(+u.searchParams.get("limit")||30,100);const r=await env.WORDUP_DB.prepare("SELECT room_code,mode,player_one_name,player_two_name,winner_name,result,timer_seconds,duration_seconds,created_at FROM games ORDER BY id DESC LIMIT ?").bind(n).all();return json({games:r.results||[]})}
 if(u.pathname.startsWith("/ws/")){const c=u.pathname.split("/")[2]?.toUpperCase();if(!c)return new Response("Missing room code",{status:400});return env.GAME_ROOMS.getByName(c).fetch(req)}
 return env.ASSETS.fetch(req)
}}
