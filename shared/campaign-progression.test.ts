import { expect, it } from 'vitest';
import baseline from '../tests/fixtures/balance-revision-75.json';
import { CAMPAIGN_MAPS } from './campaign-registry';
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings } from './map-balance';

it('keeps map 1 exactly, and map 15 apart from its health elites, equal to the published baseline', () => {
  const current=defaultBalanceSettings(), old=validateBalanceSettings(baseline);
  for(const version of [1,2] as const){
    expect(resolveMapBalance(CAMPAIGN_MAPS[0].id,current,75,version)).toEqual(resolveMapBalance(CAMPAIGN_MAPS[0].id,old,75,version));
    const next=resolveMapBalance(CAMPAIGN_MAPS[14].id,current,75,version),prior=resolveMapBalance(CAMPAIGN_MAPS[14].id,old,75,version);
    for(const [kind,e] of Object.entries(next.enemies)) if(e.elite&&e.reward.type==='health') next.enemies[kind]=prior.enemies[kind];
    expect(next).toEqual(prior);
  }
  expect(resolveMapBalance(CAMPAIGN_MAPS[0].id,current,75).enemies.Spitter.reward.amount).toBe(1);
});
it('keeps matching enemy HP, damage and rewards nondecreasing throughout the campaign',()=>{
  const previous=new Map<string,{hp:number;damage:number;reward:number}>();
  const settings=defaultBalanceSettings();
  for(const map of CAMPAIGN_MAPS){
    const next=new Map(previous);
    for(const e of Object.values(resolveMapBalance(map.id,settings,75).enemies)){
      const key=`${e.elite?'elite':'regular'}:${e.reward.type}`, p=previous.get(key);
      const values={hp:e.hp,damage:e.damage,reward:e.reward.amount};
      if(p)for(const field of ['hp','damage','reward'] as const)expect(values[field],`${map.id} ${key} ${field}`).toBeGreaterThanOrEqual(p[field]);
      const same=next.get(key);
      next.set(key,{hp:Math.max(same?.hp??0,e.hp),damage:Math.max(same?.damage??0,e.damage),reward:Math.max(same?.reward??0,e.reward.amount)});
    }
    for(const [k,v] of next)previous.set(k,v);
  }
});
it('never buffs any boss reward and preserves Endless through the scaling cap',()=>{
  const current=defaultBalanceSettings(), old=validateBalanceSettings(baseline);
  for(const map of CAMPAIGN_MAPS){
    const a=resolveMapBalance(map.id,current,75),b=resolveMapBalance(map.id,old,75);
    for(const [stat,n] of Object.entries(a.boss!.rewards))expect(n).toBeLessThanOrEqual(b.boss!.rewards[stat]);
  }
  for(let i=1;i<=1002;i++)for(const version of [1,2] as const){
    const a=resolveMapBalance(`endless_${i}`,current,75,version),b=resolveMapBalance(`endless_${i}`,old,75,version);
    for(const [lane,v] of Object.entries(a.lanes)){
      expect(Math.abs(v.reward.amount/b.lanes[lane].reward.amount-1)).toBeLessThan(1e-14);
      v.reward.amount=b.lanes[lane].reward.amount;
    }
    expect(a).toEqual(b);
  }
});
it('keeps archived settings and round-trips the new profile',()=>{
  expect(validateBalanceSettings(baseline).campaignProgressionVersion).toBeUndefined();
  expect(validateBalanceSettings(defaultBalanceSettings())).toEqual(defaultBalanceSettings());
  expect(()=>validateBalanceSettings({...defaultBalanceSettings(),campaignProgressionVersion:2})).toThrow('progression');
});

it('keeps health elites tougher than regulars, and the next map\'s regulars worth more per kill',()=>{
  const settings=defaultBalanceSettings();
  const pick=(mapId:string,key:string)=>Object.values(resolveMapBalance(mapId,settings,75).enemies)
    .filter(e=>`${e.elite?'elite':'regular'}:${e.reward.type}`===key).reduce((a,b)=>b.reward.amount>a.reward.amount?b:a);
  CAMPAIGN_MAPS.forEach((map,i)=>{
    const elite=pick(map.id,'elite:health'),regular=pick(map.id,'regular:health');
    expect(elite.hp/regular.hp,map.id).toBeGreaterThan(2);
    expect(elite.reward.amount/regular.reward.amount,map.id).toBeGreaterThan(1.5);
    if(CAMPAIGN_MAPS[i+1])expect(pick(CAMPAIGN_MAPS[i+1].id,'regular:health').reward.amount,map.id).toBeGreaterThan(elite.reward.amount);
  });
});
