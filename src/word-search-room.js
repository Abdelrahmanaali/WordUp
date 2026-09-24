import { DurableObject } from "cloudflare:workers";
const SEARCH_WORDS=["APPLE","BRIDGE","CLOUD","DREAM","FLAME","GRAPE","HEART","LEMON","OCEAN","RIVER","MUSIC","STONE"];
const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const nick=v=>String(v||"").trim().replace(/\s+/g," ").slice(0,18);
const makeCode=()=>{const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";return Array.from({length:6},()=>c[Math.floor(Math.random()*c.length)]).join("")};
function makeGrid(){const g=Array.from({length:144},()=>alphabet[Math.floor(Math.random()*26)]);const words=[...SEARCH_WORDS].sort(()=>Math.random()-.5).slice(0,8);for(const w of words){let placed=false;for(let tries=0;tries<100&&!placed;tries++){const row=Math.floor(Math.random()*12),col=Math.floor(Math.random()*12),dir=Math.floor(Math.random()*8);const dr=[0,0,1,-1,1,1,-1,-1][dir],dc=[1,-1,0,0,1,-1,1,-1][dir];const endR=row+dr*(w.length-1),endC=col+dc*(w.length-1);if(endR<0||endR>=12||endC<0||endC>=12)continue;for(let i=0;i<w.length;i++)g[(row+dr*i)*12+col+dc*i]=w[i];placed=true}}return{grid:g,words}}
export class WordSearchRoom extends DurableObject{
constructor(ctx,env){super(ctx,env)}
async load(){let s=await this.ctx.storage.get("room");if(!s){s={code:null,status:"waiting",timer:120,category:"Classic",grid:[],words:[],players:[],found:{},startedAt:null};await this.ctx.storage.put("room",s)}return s}
async save(s){await this.ctx.storage.put("room",s)}
send(ws,x){try{ws.send(JSON.stringify(x))}catch{}}
broadcast(x){for(const ws of this.ctx.getWebSockets())this.send(ws,x)}
public(s){return{code:s.code,status:s.status,timer:s.timer,category:s.category,grid:s.grid,words:s.words,players:s.players.map(p=>({id:p.id,nickname:p.nickname,ready:p.ready,score:p.score})),found:s.found}}
async fetch(req){const u=new URL(req.url),s=await this.load();
if(u.pathname.endsWith("/init")){if(s.code)return json({ok:true});const b=await req.json().catch(()=>({}));const p=makeGrid();Object.assign(s,{code:b.code,timer:120,grid:p.grid,words:p.words,status:"waiting"});await this.save(s);return json({ok:true})}
if(req.headers.get("Upgrade")==="websocket"){const id=u.searchParams.get("playerId"),name=nick(u.searchParams.get("nickname"));if(!id||!name)return new Response("Missing player information",{status:400});let p=s.players.find(x=>x.id===id);if(!p){if(s.players.length>=2)return new Response("Room is full",{status:409});p={id,nickname:name,ready:false,score:0};s.players.push(p)}else p.nickname=name;await this.save(s);const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.serializeAttachment({id});this.send(server,{type:"state",state:this.public(s),selfId:id});this.broadcast({type:"state",state:this.public(s)});return new Response(null,{status:101,webSocket:client})}
return json({state:this.public(s)})}
async webSocketMessage(ws,msg){const s=await this.load(),a=ws.deserializeAttachment()||{},p=s.players.find(x=>x.id===a.id);if(!p)return;let d;try{d=JSON.parse(msg)}catch{return}
if(d.type==="ready"){p.ready=true;if(s.players.length===2&&s.players.every(x=>x.ready)){s.status="playing";s.startedAt=Date.now();await this.ctx.storage.setAlarm(s.startedAt+s.timer*1000)}await this.save(s);this.broadcast({type:"state",state:this.public(s)});return}
if(d.type==="select"&&s.status==="playing"){const cells=Array.isArray(d.cells)?d.cells.map(Number):[];if(cells.length<2||cells.length>12)return;const picked=cells.map(i=>s.grid[i]||"").join("");const rev=picked.split("").reverse().join("");const hit=s.words.find(w=>w===picked||w===rev);if(!hit||s.found[p.id]?.includes(hit))return;if(!s.found[p.id])s.found[p.id]=[];s.found[p.id].push(hit);p.score++;if(p.score>=s.words.length){s.status="ended";s.winnerName=p.nickname;await this.save(s);this.broadcast({type:"state",state:{...this.public(s),winnerName:p.nickname}});return}await this.save(s);this.broadcast({type:"found",word:hit});this.broadcast({type:"state",state:this.public(s)})}}
async alarm(){const s=await this.load();if(s.status!=="playing")return;s.status="ended";await this.save(s);this.broadcast({type:"state",state:this.public(s)})}
}