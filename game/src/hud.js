// HUD: every readout the player needs, updated from the one state object.
// DOM lives in index.html; this module caches last-written values so a frame
// only touches the document when something actually changed. It also owns
// the buy menu, the round banner, the killfeed and the minimap.
import { PALETTE as P } from './palette.js';
import { WEAPONS, NADE_DEFS, ARMOR_PRICE } from './weapons.js';

const $ = (id) => document.getElementById(id);
const BUY_ITEMS = [
  { id: 'rifle', key: '1' },
  { id: 'smg', key: '2' },
  { id: 'sniper', key: '3' },
  { id: 'armor', key: '4' },
  { id: 'frag', key: '5' },
  { id: 'smoke', key: '6' },
];

export function createHud(S) {
  const el = {
    health: $('health-num'), healthBar: $('health-bar'),
    armor: $('armor-num'), armorBar: $('armor-bar'),
    ammoMag: $('ammo-mag'), ammoRes: $('ammo-reserve'), weapon: $('weapon-name'),
    money: $('money'), timer: $('timer'), phase: $('phase-label'),
    scoreAtt: $('score-att'), scoreDef: $('score-def'), round: $('round-num'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    killfeed: $('killfeed'), hitmarker: $('hitmarker'), crosshair: $('crosshair'),
    buy: $('buy-menu'), buyItems: $('buy-items'), buyMoney: $('buy-money'),
    plantWrap: $('plant-wrap'), plantFill: $('plant-fill'), plantLabel: $('plant-label'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    playBtn: $('play-btn'), note: $('charge-note'), scope: $('scope'), dmg: $('dmg'),
    minimap: $('minimap'),
  };
  const cache = new Map();
  const setText = (node, key, text) => {
    if (cache.get(key) !== text) { cache.set(key, text); node.textContent = text; }
  };
  const setWidth = (node, key, frac) => {
    const v = `${Math.round(frac * 100)}%`;
    if (cache.get(key) !== v) { cache.set(key, v); node.style.width = v; }
  };
  let bannerTimer = 0;
  let hitTimer = 0;
  let dmgTimer = 0;
  let mapTimer = 0;
  const mapCtx = el.minimap ? el.minimap.getContext('2d') : null;

  const hud = {
    restartHandler: null,

    refresh(dt) {
      const p = S.entities[0];
      if (bannerTimer > 0) { bannerTimer -= dt * 1000; if (bannerTimer <= 0) el.banner.classList.remove('on'); }
      if (hitTimer > 0) { hitTimer -= dt * 1000; if (hitTimer <= 0) el.hitmarker.classList.remove('on'); }
      if (dmgTimer > 0) { dmgTimer -= dt * 1000; if (dmgTimer <= 0) el.dmg.classList.remove('on'); }
      setText(el.health, 'hp', `${Math.max(0, Math.ceil(p.hp))}`);
      setWidth(el.healthBar, 'hpb', Math.max(0, p.hp) / 100);
      setText(el.armor, 'ar', `${Math.ceil(p.armor)}`);
      setWidth(el.armorBar, 'arb', Math.max(0, p.armor) / 100);
      const w = p.current;
      if (p.weaponSlot === 'nade') {
        setText(el.weapon, 'wn', p.nadeType === 'frag' ? 'Frag Grenade' : 'Smoke Grenade');
        setText(el.ammoMag, 'am', `${p.nades[p.nadeType]}`);
        setText(el.ammoRes, 'ar2', '');
      } else if (w) {
        setText(el.weapon, 'wn', w.def.name);
        setText(el.ammoMag, 'am', `${w.mag}`);
        setText(el.ammoRes, 'ar2', `/ ${w.reserve}`);
      }
      setText(el.money, 'mo', `$${p.money}`);
      const t = Math.max(0, Math.ceil(S.phaseT));
      setText(el.timer, 'ti', S.phase === 'buy' ? `BUY ${t}` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      el.timer.classList.toggle('danger', S.phase === 'planted' || (S.phase === 'live' && t <= 10));
      setText(el.phase, 'ph', { buy: 'BUY PHASE', live: `SITE ${S.targetSite} PUSH`, planted: 'CHARGE PLANTED', over: 'ROUND OVER', matchover: 'MATCH OVER', idle: '' }[S.phase] || '');
      setText(el.scoreAtt, 'sa', `${S.scores.att}`);
      setText(el.scoreDef, 'sd', `${S.scores.def}`);
      setText(el.round, 'rn', `ROUND ${S.round}`);
      // Context note: charge prompts.
      let note = '';
      if (p.hasCharge && S.phase === 'live') {
        const site = S.map.sites[S.targetSite];
        note = Math.hypot(p.pos.x - site.x, p.pos.z - site.z) < site.r ? 'HOLD E TO PLANT THE CHARGE' : `CARRY THE CHARGE TO SITE ${S.targetSite}`;
      } else if (S.charge.dropped && p.alive) note = 'THE CHARGE IS DOWN — RECOVER IT';
      else if (S.phase === 'buy') note = 'BUY WITH 1–6 OR CLICK · B CLOSES';
      setText(el.note, 'nt', note);
      mapTimer -= dt;
      if (mapCtx && mapTimer <= 0) { mapTimer = 0.12; drawMinimap(); }
    },

    banner(title, sub, ms = 2400) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.classList.add('on');
      bannerTimer = ms;
    },

    killfeed(killerName, victimName, head, killerTeam) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      row.innerHTML = `<b class="${killerTeam}">${killerName}</b> <span>▸ ${head ? 'HEADSHOT ' : ''}</span>${victimName}`;
      el.killfeed.appendChild(row);
      while (el.killfeed.children.length > 5) el.killfeed.firstChild.remove();
      setTimeout(() => row.classList.add('out'), 3400);
      setTimeout(() => row.remove(), 4100);
    },

    hitmark(head) {
      el.hitmarker.classList.toggle('head', !!head);
      el.hitmarker.classList.add('on');
      hitTimer = head ? 160 : 110;
    },

    damageFlash() {
      el.dmg.classList.add('on');
      dmgTimer = 130;
    },

    plantBar(frac, label) {
      if (frac === null || frac === undefined) { el.plantWrap.classList.remove('on'); return; }
      el.plantWrap.classList.add('on');
      el.plantLabel.textContent = label;
      el.plantFill.style.width = `${Math.round(frac * 100)}%`;
    },

    setScope(on) { el.scope.classList.toggle('on', !!on); },
    setCrosshairSpread(px) { el.crosshair.style.setProperty('--sp', `${px}px`); },

    showBuy(open) {
      el.buy.classList.toggle('on', !!open);
      if (open) hud.refreshBuy();
    },
    refreshBuy() {
      const p = S.entities[0];
      el.buyMoney.textContent = `$${p.money}`;
      el.buyItems.innerHTML = '';
      for (const item of BUY_ITEMS) {
        const def = item.id === 'armor' ? { name: 'Kevlar Vest', price: ARMOR_PRICE } : (WEAPONS[item.id] || NADE_DEFS[item.id]);
        const owned = (item.id === 'armor' && p.armor >= 100)
          || (WEAPONS[item.id] && ((item.id === 'sniper' ? p.weapons.sniper : p.weapons.primary)?.def.id === item.id))
          || (NADE_DEFS[item.id] && p.nades[item.id] >= 2);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'buy-item';
        btn.disabled = owned || p.money < def.price;
        btn.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${def.name}</span><span class="buy-price">${owned ? 'OWNED' : `$${def.price}`}</span>`;
        btn.addEventListener('click', () => {
          if (S.rounds.buyItem(item.id)) { S.audio.buy(); hud.refreshBuy(); hud.refresh(0); }
          else S.audio.denied();
        });
        el.buyItems.appendChild(btn);
      }
    },
    buyByIndex(i) {
      const item = BUY_ITEMS[i];
      if (!item) return;
      if (S.rounds.buyItem(item.id)) { S.audio.buy(); hud.refreshBuy(); }
      else S.audio.denied();
    },

    overlay(title, copy, button) {
      el.overlayTitle.textContent = title;
      el.overlayCopy.innerHTML = copy;
      el.playBtn.textContent = button || '';
      el.playBtn.style.display = button ? '' : 'none';
      el.overlay.classList.add('on');
    },
    hideOverlay() { el.overlay.classList.remove('on'); },
    onPlay(cb) { el.playBtn.addEventListener('click', cb); },
    showMatchEnd(title, scores) {
      hud.overlay(title, `Final score — Vanguard ${scores.att} · Wardens ${scores.def}.<br>Click below to play another match.`, 'PLAY AGAIN');
      if (document.pointerLockElement) document.exitPointerLock();
    },
  };

  function drawMinimap() {
    const g = mapCtx;
    const W = el.minimap.width;
    const toX = (x) => ((x + 32) / 64) * W;
    const toY = (z) => ((z + 32) / 64) * W;
    g.fillStyle = '#20242b';
    g.fillRect(0, 0, W, W);
    g.fillStyle = '#3c4149';
    for (const b of S.map.boxes) g.fillRect(toX(b.x - b.hx), toY(b.z - b.hz), (b.hx * 2 / 64) * W, (b.hz * 2 / 64) * W);
    for (const key of ['A', 'B']) {
      const s = S.map.sites[key];
      g.strokeStyle = s.color;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(toX(s.x), toY(s.z), (s.r / 64) * W, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = s.color;
      g.font = `700 ${W * 0.09}px system-ui`;
      g.textAlign = 'center';
      g.fillText(key, toX(s.x), toY(s.z) + W * 0.03);
    }
    for (const e of S.entities) {
      if (!e.alive) continue;
      g.fillStyle = e.isPlayer ? '#ffffff' : e.team === 'att' ? '#f0a830' : '#37b6a8';
      g.beginPath();
      g.arc(toX(e.pos.x), toY(e.pos.z), e.isPlayer ? 3.4 : 2.6, 0, Math.PI * 2);
      g.fill();
      if (e.isPlayer) { // view wedge
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        g.beginPath();
        g.moveTo(toX(e.pos.x), toY(e.pos.z));
        g.arc(toX(e.pos.x), toY(e.pos.z), 11, Math.atan2(-Math.cos(e.yaw), -Math.sin(e.yaw)) - 0.5, Math.atan2(-Math.cos(e.yaw), -Math.sin(e.yaw)) + 0.5);
        g.closePath();
        g.stroke();
      }
    }
    if (S.charge.planted || S.charge.dropped) {
      const cx = S.charge.planted ? S.charge.x : S.charge.dropped.x;
      const cz = S.charge.planted ? S.charge.z : S.charge.dropped.z;
      g.fillStyle = '#ff5030';
      g.fillRect(toX(cx) - 3, toY(cz) - 3, 6, 6);
    }
  }

  return hud;
}
