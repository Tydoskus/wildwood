import { readFileSync, writeFileSync } from 'node:fs';
import { CAMPAIGN_MAPS } from '../shared/campaign-registry';
import { resolveMapBalance } from '../shared/map-balance';
const settings = JSON.parse(readFileSync('tests/fixtures/balance-revision-75.json','utf8'));
const baseline = { snapshots: CAMPAIGN_MAPS.map(m => resolveMapBalance(m.id,settings,75)) };
const roles=['regular:damage','regular:health','regular:armor','elite:damage','elite:health','elite:regen'];
function curve(v:number[], extra=0){
 const a=Math.log(v[0]),span=Math.log(v.at(-1)!)-a;
 let n=0,d=0;v.forEach((y,i)=>{const t=i/(v.length-1),b=t*(1-t);n+=b*(Math.log(y)-a-span*t);d+=b*b;});
 const c=Math.max(0,Math.min(span*.97,n/d+extra));
 return v.map((y,i)=>{if(!i||i===v.length-1)return y;const t=i/(v.length-1);return Math.exp(a+span*t+c*t*(1-t));});
}
const tracks=Object.fromEntries(roles.map(role=>{
 const [rank,type]=role.split(':');
 const rows=baseline.snapshots.map((s,i)=>{
  let found=Object.values(s.enemies).filter(e=>Boolean(e.elite)===(rank==='elite')&&e.reward.type===type);
  if(!found.length&&i===0&&type==='regen')found=Object.values(s.enemies).filter(e=>e.reward.type==='regen');
  return found.reduce((a,b)=>b.reward.amount>a.reward.amount?b:a);
 });
 return [role,{damage:curve(rows.map(e=>e.damage)),reward:curve(rows.map(e=>e.reward.amount),1.8)}];
}));
// Late health elites had less HP than the regular health enemies beside them (a
// sixth by map 15) and hit and paid less than them. From the first map where a
// health elite's HP multiple over regular health falls below the damage elite's
// multiple over regular damage, map 15 included:
//  - the multiple stops falling as fast as the HP curve allows: health elite HP
//    never grows faster from one map to the next than it did the map before;
//  - its hit keeps the ratio to that multiple that maps 1-7 hold (about 0.9);
//  - its reward keeps the damage elite's per-HP premium, but stays under 95% of
//    the next map's regular health reward, so moving on always pays more per kill.
const hpOf=(i:number,role:string)=>{const [rank,type]=role.split(':');const found=Object.values(baseline.snapshots[i].enemies).filter(e=>Boolean(e.elite)===(rank==='elite')&&e.reward.type===type);return found.reduce((a,b)=>b.reward.amount>a.reward.amount?b:a).hp;};
const last=baseline.snapshots.length-1;
const hpScale:number[]=baseline.snapshots.map(()=>1);
let easing=false,hitPerHp=0,multiple=0,eliteGrowth=Infinity;
for(let i=1;i<=last;i++){
 const current=hpOf(i,'elite:health')/hpOf(i,'regular:health');
 const target=hpOf(i,'elite:damage')/hpOf(i,'regular:damage');
 if(!easing&&current>=target){
  hitPerHp=tracks['elite:health'].damage[i]/tracks['regular:health'].damage[i]/current;
  eliteGrowth=hpOf(i,'elite:health')/hpOf(i-1,'elite:health');
  multiple=current;continue;
 }
 easing=true;
 const regularGrowth=hpOf(i,'regular:health')/hpOf(i-1,'regular:health');
 multiple*=Math.min(1,eliteGrowth/regularGrowth);
 eliteGrowth=Math.min(eliteGrowth,regularGrowth);
 hpScale[i]=multiple/current;
 const regularReward=tracks['regular:health'].reward[i];
 const growth=i<last?tracks['regular:health'].reward[i+1]/regularReward:regularReward/tracks['regular:health'].reward[i-1];
 const premium=(tracks['elite:damage'].reward[i]/hpOf(i,'elite:damage'))/(tracks['regular:damage'].reward[i]/hpOf(i,'regular:damage'));
 tracks['elite:health'].reward[i]=regularReward*Math.min(premium*multiple,.95*growth);
 tracks['elite:health'].damage[i]=tracks['regular:health'].damage[i]*multiple*hitPerHp;
}
const enemies=Object.fromEntries(baseline.snapshots.map((s,i)=>[s.mapId,Object.fromEntries(roles.map(r=>[r,{damage:tracks[r].damage[i],reward:tracks[r].reward[i],...(r==='elite:health'&&hpScale[i]!==1?{hp:hpScale[i]}:{})}]))]));
const bosses=curve(baseline.snapshots.map(s=>s.boss!.hp));
const bossFactors=Object.fromEntries(baseline.snapshots.map((s,i)=>[s.mapId,bosses[i]/s.boss!.hp]));
writeFileSync('shared/campaign-progression.ts',`// Unified campaign damage/reward curves. Forest is retained; map 15 differs only in its health elites.\n// Values are relative to no map multiplier; saved revisions opt in explicitly.\nexport const CAMPAIGN_PROGRESSION_ENEMIES: Readonly<Record<string, Readonly<Record<string, {damage:number;reward:number;hp?:number}>>>> = ${JSON.stringify(enemies,null,2)};\nexport const CAMPAIGN_PROGRESSION_BOSS_HEALTH: Readonly<Record<string,number>> = ${JSON.stringify(bossFactors,null,2)};\nexport const CAMPAIGN_PROGRESSION_BOSS_REWARDS: Readonly<Record<string,number>> = {};\n`);
