// Campaign: the 6-route ladder, saved progress, coins and hangar upgrades.
// Saved in localStorage under SAVE_KEY so progress survives a reload.
import { ROUTES, SAVE_KEY, UPGRADES } from './config.js';

export function freshSave() {
  return { unlocked: 1, coins: 0, stamps: {}, upgrades: { tank: 0, armor: 0, engine: 0 }, best: {} };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return freshSave();
    const save = JSON.parse(raw);
    if (!save || typeof save.unlocked !== 'number') return freshSave();
    save.coins = save.coins || 0;
    save.stamps = save.stamps || {};
    save.upgrades = { tank: 0, armor: 0, engine: 0, ...(save.upgrades || {}) };
    save.best = save.best || {};
    return save;
  } catch {
    return freshSave();
  }
}

export function storeSave(save) {
  try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
}

/** Award a completed route: stamp, coins, unlock the next route, best score. */
export function awardRoute(save, route, score, timeSec) {
  const first = !save.stamps[route.id];
  save.stamps[route.id] = true;
  save.coins += route.coins + (first ? 50 : 0);
  save.best[route.id] = Math.max(save.best[route.id] || 0, score);
  if (route.id >= save.unlocked && route.id < ROUTES.length) save.unlocked = route.id + 1;
  storeSave(save);
  return { coinsEarned: route.coins + (first ? 50 : 0), first };
}

export function upgradeCost(upgrade, level) {
  return upgrade.cost * (level + 1);
}

/** Buy one level of an upgrade; returns true when the coins covered it. */
export function buyUpgrade(save, upgradeId) {
  const def = UPGRADES.find((u) => u.id === upgradeId);
  if (!def) return false;
  const level = save.upgrades[upgradeId] || 0;
  if (level >= def.max) return false;
  const cost = upgradeCost(def, level);
  if (save.coins < cost) return false;
  save.coins -= cost;
  save.upgrades[upgradeId] = level + 1;
  storeSave(save);
  return true;
}

export function routeById(id) {
  return ROUTES.find((r) => r.id === id) || ROUTES[0];
}
