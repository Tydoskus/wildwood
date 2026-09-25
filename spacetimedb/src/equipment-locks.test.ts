import { createAutoEquip } from "./auto-equip";
import { keepBestCopies } from "./equipment-copies";
import { expect, it, vi } from 'vitest';
import { crystalFixture, server, identity } from '../../tests/helpers/crystal-hollows-fixture';
import { IRON_BOW } from '../../shared/items';
import { equipmentLocked, mergeEquipmentLocks } from './equipment-locks';
vi.mock('spacetimedb/server', () => import('../../tests/helpers/spacetime-module'));
it('requires ownership and prevents deletion until unlocked', () => {
  const f = crystalFixture();
  expect(() => f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: 0n, locked: true })).toThrow('not owned');
  f.patch('playerProgress', { inventoryJson: JSON.stringify([IRON_BOW]), equippedRightHand: IRON_BOW });
  f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: 0n, locked: true });
  expect(equipmentLocked(f.ctx as any, f.ctx.sender, IRON_BOW)).toBe(true);
  expect(() => f.run(server.destroyEquipment, { itemId: IRON_BOW })).toThrow('Unlock');
  const copy = f.seed('playerEquipmentCopy', { id: 0n, identity: f.ctx.sender, itemId: IRON_BOW, arrowStorm: 1, ricochet: 0, piercingShot: 0, acquiredAt: f.ctx.timestamp });
  f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: copy.id, locked: true });
  expect(() => f.run(server.destroyEquipmentCopy, { itemId: IRON_BOW, copyId: copy.id })).toThrow('Unlock');
  f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: copy.id, locked: false });
  f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: 0n, locked: false });
  f.run(server.destroyEquipmentCopy, { itemId: IRON_BOW, copyId: copy.id });
  expect(f.db.playerEquipmentCopy.id.find(copy.id)).toBeNull();
});
it('keeps locks across account linking without giving them to other players', () => {
  const f = crystalFixture(), account = identity('2');
  f.patch('playerProgress', { inventoryJson: JSON.stringify([IRON_BOW]) });
  f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: 0n, locked: true });
  expect(equipmentLocked(f.ctx as any, account, IRON_BOW)).toBe(false);
  mergeEquipmentLocks(f.ctx as any, f.ctx.sender, account);
  expect(equipmentLocked(f.ctx as any, account, IRON_BOW)).toBe(true);
  expect(equipmentLocked(f.ctx as any, f.ctx.sender, IRON_BOW)).toBe(false);
});

it('prevents auto equip and duplicate bow rolls from replacing locked gear', () => {
  const f = crystalFixture();
  f.patch('playerProgress', { inventoryJson: JSON.stringify([IRON_BOW]), equippedRightHand: IRON_BOW });
  f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: 0n, locked: true });
  const key = `${f.ctx.sender.toHexString()}:${IRON_BOW}`;
  f.seed('playerBowSkill', { key, identity: f.ctx.sender, itemId: IRON_BOW, arrowStorm: 0, ricochet: 0, piercingShot: 0 });
  keepBestCopies(f.ctx as any, f.ctx.sender, IRON_BOW, 10);
  expect(f.db.playerBowSkill.key.find(key)).toMatchObject({ arrowStorm: 0, ricochet: 0, piercingShot: 0 });
  const before = f.db.playerProgress.identity.find(f.ctx.sender);
  f.patch('playerProgress', { inventoryJson: JSON.stringify([IRON_BOW, 'ion_bow']), ionCitadelUnlocked: true });
  const write = vi.fn();
  createAutoEquip({ inventoryForProgress: p => JSON.parse(p.inventoryJson), itemUpgradeLevelFor: () => 0, writeProgressAndPresentation: write }).equipNewUpgrades(f.ctx as any, f.ctx.sender, before);
  expect(write).not.toHaveBeenCalled();
});

it('locks only one duplicate and carries its lock when selected or promoted', () => {
  const f = crystalFixture();
  f.patch('playerProgress', { inventoryJson: JSON.stringify([IRON_BOW]) });
  const seed = () => f.seed('playerEquipmentCopy', { id: 0n, identity: f.ctx.sender, itemId: IRON_BOW, arrowStorm: 1, ricochet: 0, piercingShot: 0, acquiredAt: f.ctx.timestamp });
  const a = seed(), b = seed();
  f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: a.id, locked: true });
  expect(equipmentLocked(f.ctx as any, f.ctx.sender, IRON_BOW)).toBe(false);
  expect(equipmentLocked(f.ctx as any, f.ctx.sender, IRON_BOW, b.id)).toBe(false);
  f.run(server.destroyEquipmentCopy, { itemId: IRON_BOW, copyId: b.id });
  f.run(server.selectEquipmentCopy, { copyId: a.id });
  expect(equipmentLocked(f.ctx as any, f.ctx.sender, IRON_BOW)).toBe(true);
  expect(equipmentLocked(f.ctx as any, f.ctx.sender, IRON_BOW, a.id)).toBe(false);
  f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: 0n, locked: false });
  f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: a.id, locked: true });
  f.run(server.destroyEquipmentCopy, { itemId: IRON_BOW, copyId: 0n });
  expect(equipmentLocked(f.ctx as any, f.ctx.sender, IRON_BOW)).toBe(true);
  expect(equipmentLocked(f.ctx as any, f.ctx.sender, IRON_BOW, a.id)).toBe(false);
});

it.each([false, true])('equips a locked duplicate while preserving the bag copy lock (%s)', firstLocked => {
  const f = crystalFixture();
  f.patch('playerProgress', { inventoryJson: JSON.stringify([IRON_BOW]), equippedRightHand: '' });
  const copy = f.seed('playerEquipmentCopy', { id: 0n, identity: f.ctx.sender, itemId: IRON_BOW, arrowStorm: 7, ricochet: 0, piercingShot: 0, acquiredAt: f.ctx.timestamp });
  f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: copy.id, locked: true });
  if (firstLocked) f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: 0n, locked: true });
  f.run(server.selectEquipmentCopy, { copyId: copy.id });
  expect(equipmentLocked(f.ctx as any, f.ctx.sender, IRON_BOW)).toBe(true);
  expect(equipmentLocked(f.ctx as any, f.ctx.sender, IRON_BOW, copy.id)).toBe(firstLocked);
  expect(f.db.playerBowSkill.key.find(`${f.ctx.sender.toHexString()}:${IRON_BOW}`).arrowStorm).toBe(7);
});

it('allows manually replacing a locked equipped copy and keeps its lock in the bag', () => {
  const f = crystalFixture();
  f.patch('playerProgress', { inventoryJson: JSON.stringify([IRON_BOW]), equippedRightHand: IRON_BOW });
  const copy = f.seed('playerEquipmentCopy', { id: 0n, identity: f.ctx.sender, itemId: IRON_BOW, arrowStorm: 8, ricochet: 0, piercingShot: 0, acquiredAt: f.ctx.timestamp });
  f.run(server.setEquipmentLocked, { itemId: IRON_BOW, copyId: 0n, locked: true });
  f.run(server.selectEquipmentCopy, { copyId: copy.id });
  expect(equipmentLocked(f.ctx as any, f.ctx.sender, IRON_BOW)).toBe(false);
  expect(equipmentLocked(f.ctx as any, f.ctx.sender, IRON_BOW, copy.id)).toBe(true);
  expect(() => f.run(server.destroyEquipmentCopy, { itemId: IRON_BOW, copyId: copy.id })).toThrow('Unlock');
});
