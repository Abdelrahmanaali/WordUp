import { DurableObject } from "cloudflare:workers";

const DAILY_WORDS = [
 ["apple",["A common fruit that can be red, green, or yellow.","It is often associated with teachers and lunchboxes.","It grows on trees."]],
 ["brick",["A small rectangular building material.","It is commonly made from fired clay.","Walls and houses are often built with it."]],
 ["cloud",["You can see it in the sky.","It can be white, gray, or very dark.","It is made of tiny water droplets or ice crystals."]],
 ["dream",["It can happen while you sleep.","It can describe a strong hope for the future.","It is often linked with imagination."]],
 ["flame",["It is the visible part of a fire.","It gives off heat and often light.","It can be blue, yellow, orange, or red."]],
 ["grape",["It is a small round fruit.","It can be green, red, or purple.","It grows in clusters on vines."]],
 ["heart",["It is a body organ that pumps blood.","It is also a common symbol of love.","It has four chambers."]],
 ["lemon",["It is a yellow citrus fruit.","Its juice tastes strongly sour.","It is often used in drinks and cooking."]],
 ["ocean",["It is a huge body of salt water.","It covers most of Earth's surface.","Whales, fish, and many other animals live in it."]],
 ["plant",["It usually needs light and water to grow.","It can have roots, stems, and leaves.","Some types produce flowers or fruit."]],
 ["river",["It is a natural flow of water.","It usually moves toward a lake, sea, or another river.","It can have a source and a mouth."]],
 ["sugar",["It is commonly used to sweeten food and drinks.","It is a type of carbohydrate.","It can be found naturally in fruits."]],
 ["tiger",["It is a large striped animal.","It belongs to the cat family.","It is known for orange fur with dark stripes."]],
 ["train",["It travels on tracks.","It can carry people or cargo.","A long one may have many connected cars."]],
 ["water",["It is essential for life.","Its chemical formula is H2O.","It freezes at 0°C under standard conditions."]],
 ["world",["It can mean Earth and everything on it.","It can also mean a particular area of experience.","It has seven commonly recognized continents."]]
];
const TIMER_OPTIONS=[60,90,120,180,300];

const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const nick=v=>String(v||"").trim().replace(/\s+/g," ").slice(0,18);
const word=v=>String(v||"").trim().toLowerCase().replace(/[^a-z]/g,"").slice(0,5);
const hints=v=>Array.isArray(v)?v.map(x=>String(x||"").trim().slice(0,180)).filter(Boolean).slice(0,6):[];
const code=()=>{const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";return Array.from({length:6},()=>c[Math.floor(Math.random()*c.length)]).join("")};
const daily=()=>{const day=new Intl.DateTimeFormat("en-CA",{timeZone:"UTC"}).format(new Date());let h=0;for(const c of day)h=(h*31+c.charCodeAt(0))>>>0;return DAILY_WORDS[h%DAILY_WORDS.length]};
function score(w,g){const a=Array(5).fill("gray"),r={};for(let i=0;i<5;i++){if(g[i]===w[i])a[i]="green";else r[w[i]]=(r[w[i]]||0)+1}for(let i=0;i<5;i++)if(a[i]==="gray"&&r[g[i]]>0){a[i]="yellow";r[g[i]]--}return a}
const attempt=(w,g)=>{const colors=score(w,g);return{guess:g,colors,green:colors.filter(x=>x==="green").length,positive:colors.filter(x=>x==="green"||x==="yellow").length}};
function best(players,w){const x=players.map(p=>{const a=p.guesses.map(g=>attempt(w,g.guess));return{...p,green:Math.max(0,...a.map(v=>v.green)),positive:Math.max(0,...a.map(v=>v.positive)),count:p.guesses.length}}).sort((a,b)=>b.green-a.green||b.positive-a.positive||a.count-b.count);if(x.length===2&&x[0].green===x[1].green&&x[0].positive===x[1].positive&&x[0].count===x[1].count)return null;return x[0]||null}

export class GameRoom extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.env=env}
 async load(){let s=await this.ctx.storage.get("room");if(!s){s={code:null,mode:"daily",timer:120,word:null,hints:[],setterId:null,status:"waiting",players:[],startedAt:null,endedAt:null,result:null};await this.ctx.storage.put("room",s)}return s}
 async save(s){await this.ctx.storage.put("room",s)}
 send(ws,p){try{ws.send(JSON.stringify(p))}catch{}}
 broadcast(p){for(const ws of this.ctx.getWebSockets())this.send(ws,p)}
 public(s){return{code:s.code,mode:s.mode,timer:s.timer,status:s.status,startedAt:s.startedAt,endedAt:s.endedAt,setterId:s.setterId,
 players:s.players.map(p=>({id:p.id,nickname:p.nickname,ready:p.ready,connected:p.connected,guesses:p.guesses.map(g=>({guess:g.guess,colors:score(s.word,g.guess)})),hintsUsed:p.hintsUsed})),
 result:s.result?{winnerId:s.result.winnerId,winnerName:s.result.winnerName,type:s.result.type,word:s.word,reason:s.result.reason}:null}}
 async fetch(req){
  const u=new URL(req.url),s=await this.load();
  if(u.pathname.endsWith("/ws")){
   if(req.headers.get("Upgrade")!=="websocket")return new Response("WebSocket required",{status:426});
   const pid=u.searchParams.get("playerId"),name=nick(u.searchParams.get("nickname"));if(!pid||!name)return new Response("Missing player information",{status:400});
   let p=s.players.find(x=>x.id===pid);
   if(!p){if(s.players.length>=2)return new Response("Room is full",{status:409});p={id:pid,nickname:name,ready:false,guesses:[],hintsUsed:0,connected:true};s.players.push(p)}else{p.nickname=name;p.connected=true}
   await this.save(s);const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.serializeAttachment({playerId:pid});
   this.send(server,{type:"state",state:this.public(s),selfId:pid});this.broadcast({type:"state",state:this.public(s)});return new Response(null,{status:101,webSocket:client});
  }
  if(u.pathname.endsWith("/init")){
   const b=await req.json().catch(()=>({}));if(s.code)return json({ok:true});
   const mode=b.mode==="custom"?"custom":"daily",timer=TIMER_OPTIONS.includes(+b.timer)?+b.timer:120;
   let w,h;if(mode==="custom"){w=word(b.word);h=hints(b.hints);if(w.length!==5||h.length<4)return json({error:"Custom mode needs a 5-letter word and 4–6 hints."},400)}else[w,h]=daily();
   s.code=b.code;s.mode=mode;s.timer=timer;s.word=w;s.hints=h;s.setterId=b.setterId||null;await this.save(s);return json({ok:true});
  }
  return json({ok:true,state:this.public(s)})
 }
 async webSocketMessage(ws,msg){
  const s=await this.load(),a=ws.deserializeAttachment()||{},p=s.players.find(x=>x.id===a.playerId);if(!p)return;
  let d;try{d=JSON.parse(msg)}catch{return}
  if(d.type==="ready"&&s.status==="waiting"){p.ready=true;if(s.players.length===2&&s.players.every(x=>x.ready)){s.status="playing";s.startedAt=Date.now();await this.ctx.storage.setAlarm(s.startedAt+s.timer*1000)}await this.save(s);this.broadcast({type:"state",state:this.public(s)});return}
  if(d.type==="unready"&&s.status==="waiting"){p.ready=false;await this.save(s);this.broadcast({type:"state",state:this.public(s)});return}
  if(d.type==="hint"&&s.status==="playing"){
   if(p.hintsUsed>=3)return;const i=p.hintsUsed;p.hintsUsed++;await this.save(s);this.send(ws,{type:"hint",index:i,text:s.hints[i]});this.broadcast({type:"state",state:this.public(s)});return
  }
  if(d.type==="guess"&&s.status==="playing"){
   if(s.mode==="custom"&&p.id===s.setterId)return this.send(ws,{type:"error",message:"In Custom Word mode you created the word; your friend is the guesser."});
   const g=word(d.guess);if(g.length!==5)return this.send(ws,{type:"error",message:"Enter exactly 5 letters."});
   if(p.guesses.some(x=>x.guess===g))return this.send(ws,{type:"error",message:"You already tried that word."});
   p.guesses.push({guess:g,at:Date.now()});this.send(ws,{type:"guessResult",...attempt(s.word,g)});
   if(g===s.word){s.status="ended";s.endedAt=Date.now();s.result={winnerId:p.id,winnerName:p.nickname,type:"win",reason:"Solved the word"};await this.save(s);await this.persist(s);this.broadcast({type:"state",state:this.public(s)});return}
   await this.save(s);this.broadcast({type:"state",state:this.public(s)})
  }
 }
 async webSocketClose(ws){const s=await this.load(),a=ws.deserializeAttachment()||{},p=s.players.find(x=>x.id===a.playerId);if(p){p.connected=false;await this.save(s)}}
 async alarm(){const s=await this.load();if(s.status!=="playing")return;s.status="ended";s.endedAt=Date.now();
  if(s.mode==="custom"){const setter=s.players.find(p=>p.id===s.setterId),guessers=s.players.filter(p=>p.id!==s.setterId);s.result={winnerId:setter?.id||null,winnerName:setter?.nickname||"Word Setter",type:"timeout",reason:"The word was not solved before time ran out"}}else{const w=best(s.players,s.word);s.result=w?{winnerId:w.id,winnerName:w.nickname,type:"timeout",reason:"Best score after timeout"}:{winnerId:null,winnerName:null,type:"draw",reason:"Tie after timeout"}}
  await this.save(s);await this.persist(s);this.broadcast({type:"state",state:this.public(s)})
 }
 async persist(s){if(!this.env.WORDUP_DB)return;const p1=s.players[0]||{},p2=s.players[1]||{},now=new Date().toISOString();
  await this.env.WORDUP_DB.prepare(`INSERT INTO games(room_code,mode,word,timer_seconds,player_one_name,player_two_name,winner_name,result,player_one_guesses,player_two_guesses,player_one_hints,player_two_hints,duration_seconds,started_at,ended_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .bind(s.code,s.mode,s.word,s.timer,p1.nickname||null,p2.nickname||null,s.result?.winnerName||null,s.result?.type||"unknown",p1.guesses?.length||0,p2.guesses?.length||0,p1.hintsUsed||0,p2.hintsUsed||0,s.startedAt&&s.endedAt?Math.round((s.endedAt-s.startedAt)/1000):null,s.startedAt?new Date(s.startedAt).toISOString():null,s.endedAt?new Date(s.endedAt).toISOString():null,now).run();
 }
}

export default{async fetch(req,env){
 const u=new URL(req.url);
 if(u.pathname==="/api/create"&&req.method==="POST"){
  const b=await req.json().catch(()=>({})),name=nick(b.nickname);if(!name)return json({error:"Nickname is required."},400);
  const c=code(),stub=env.GAME_ROOMS.getByName(c);
  const r=await stub.fetch(new Request("https://room/init",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:c,mode:b.mode,timer:b.timer,word:b.word,hints:b.hints,setterId:b.mode==="custom"?b.playerId:null})}));
  if(!r.ok)return json({error:"Could not create room."},500);return json({ok:true,code:c})
 }
 if(u.pathname==="/api/history"){if(!env.WORDUP_DB)return json({games:[]});const n=Math.min(+u.searchParams.get("limit")||30,100);const r=await env.WORDUP_DB.prepare("SELECT room_code,mode,player_one_name,player_two_name,winner_name,result,timer_seconds,duration_seconds,created_at FROM games ORDER BY id DESC LIMIT ?").bind(n).all();return json({games:r.results||[]})}
 if(u.pathname.startsWith("/ws/")){const c=u.pathname.split("/")[2]?.toUpperCase();if(!c)return new Response("Missing room code",{status:400});return env.GAME_ROOMS.getByName(c).fetch(req)}
 return env.ASSETS.fetch(req)
}}
