import { expect, it } from 'vitest';
import baseline from '../tests/fixtures/balance-revision-75.json';
import { CAMPAIGN_MAPS } from './campaign-registry';
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings } from './map-balance';

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
it('keeps archived settings and round-trips the new profile',()=>{
  expect(validateBalanceSettings(baseline).campaignProgressionVersion).toBeUndefined();
  expect(validateBalanceSettings(defaultBalanceSettings())).toEqual(defaultBalanceSettings());
  expect(()=>validateBalanceSettings({...defaultBalanceSettings(),campaignProgressionVersion:2})).toThrow('progression');
});
