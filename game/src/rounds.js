// Rounds and economy: the match state machine.
//   buy (12 s, teams frozen at spawn, buy menu open)
//   -> live (115 s: elimination, or the Charge gets planted)
//   -> planted (35 s fuse: defuse it, wipe the defenders, or it detonates)
//   -> over (5 s banner, payouts) -> next round, first to 7 takes the match.
// Money: kill $300, plant $300, team win $3,000, loss $1,500, plant bonus
// $800. Dying drops your primary and sniper — the economy bites.
import * as THREE from 'three';
import { WEAPONS, NADE_DEFS, ARMOR_PRICE, START_MONEY, freshWeapon } from './weapons.js';
import { orderMove, orderHold, resetCombatant } from './bots.js';

export const BUY_TIME = 12;
export const ROUND_TIME = 115;
export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 5;
export const BOMB_TIME = 35;
export const WIN_SCORE = 7;
const WIN_PAY = 3000;
const LOSS_PAY = 1500;

export function createRounds(S) {
  const M = S.map;
  const chargeMesh = new THREE.Group();
  const chargeBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.26, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.4 }),
  );
  chargeBody.position.y = 0.13;
  chargeMesh.add(chargeBody);
  const chargeLamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff5030, emissive: 0xff2a18, emissiveIntensity: 3 }),
  );
  chargeLamp.position.y = 0.3;
  chargeMesh.add(chargeLamp);
  chargeMesh.visible = false;
  S.scene.add(chargeMesh);

  const alive = (team) => S.entities.filter((e) => e.team === team && e.alive);
  const player = () => S.entities[0];

  function teamPay(team, amount) {
    for (const e of S.entities) if (e.team === team) e.money += amount;
  }

  function botBuy(e) {
    const buy = (slot, id) => {
      if (e.money < WEAPONS[id].price) return false;
      e.money -= WEAPONS[id].price;
      e.weapons[slot] = freshWeapon(id);
      return true;
    };
    if (!e.weapons.sniper && e.ai && e.ai.sniperRole) buy('sniper', 'sniper');
    if (!e.weapons.primary) {
      if (!buy('primary', 'rifle')) buy('primary', 'smg');
    }
    if (e.armor < 100 && e.money >= ARMOR_PRICE) { e.money -= ARMOR_PRICE; e.armor = 100; }
    if (e.nades.frag === 0 && e.money >= NADE_DEFS.frag.price + 400) { e.money -= NADE_DEFS.frag.price; e.nades.frag = 1; }
    if (e.nades.smoke === 0 && e.money >= NADE_DEFS.smoke.price + 900 && S.rng() > 0.5) { e.money -= NADE_DEFS.smoke.price; e.nades.smoke = 1; }
    // Carry the best gun owned.
    e.current = e.weapons.sniper || e.weapons.primary || e.weapons.pistol;
  }

  function resetLoadouts() {
    for (const e of S.entities) {
      e.money = START_MONEY;
      e.armor = 0;
      e.nades = { frag: 0, smoke: 0 };
      e.weapons.primary = null;
      e.weapons.sniper = null;
      e.weapons.pistol = freshWeapon('pistol');
      e.current = e.weapons.pistol;
      e.stats = { shots: 0, hits: 0, kills: 0 };
    }
    // One designated marksman per team may save for the Ibis.
    const att = S.entities.filter((e) => e.team === 'att' && !e.isPlayer);
    const def = S.entities.filter((e) => e.team === 'def');
    if (att[1]) att[1].ai.sniperRole = true;
    if (def[2]) def[2].ai.sniperRole = true;
  }

  function startMatch() {
    S.scores.att = 0;
    S.scores.def = 0;
    S.round = 0;
    resetLoadouts();
    nextRound();
  }

  function nextRound() {
    S.round += 1;
    S.noise.length = 0;
    S.charge.carrier = null;
    S.charge.planted = false;
    S.charge.site = null;
    S.charge.channel = null;
    S.charge.dropped = null;
    chargeMesh.visible = false;
    // Respawn everyone on their marks, attackers facing north, Wardens south.
    S.entities.forEach((e, i) => {
      const spawn = M.spawns[e.team][e.team === 'att' ? i : i - 5] || M.spawns[e.team][0];
      resetCombatant(e, spawn, e.team === 'att' ? 0 : Math.PI);
    });
    // The Charge goes to the player one round in three, else a random bot.
    const attackers = alive('att');
    const carrier = S.rng() < 0.34 ? player() : attackers[Math.floor(S.rng() * attackers.length)];
    carrier.hasCharge = true;
    S.charge.carrier = carrier;
    S.targetSite = S.rng() > 0.5 ? 'A' : 'B';
    for (const e of S.entities) if (!e.isPlayer) botBuy(e);
    S.phase = 'buy';
    S.phaseT = BUY_TIME;
    S.hud.banner(`ROUND ${S.round}`, carrier.isPlayer ? 'You carry the Charge' : `${carrier.name} carries the Charge`, 2600);
    S.hud.showBuy(true);
  }

  // Movement orders go out when the buy phase ends so the freeze is real.
  function startLive() {
    S.phase = 'live';
    S.phaseT = ROUND_TIME;
    S.hud.showBuy(false);
    const site = S.targetSite;
    const siteNode = site === 'A' ? M.WP.aSite : M.WP.bSite;
    const otherNode = site === 'A' ? M.WP.bSite : M.WP.aSite;
    let pushers = 0;
    for (const e of S.entities) {
      if (e.isPlayer || !e.alive) continue;
      if (e.team === 'att') {
        if (e.hasCharge) { orderMove(S, e, siteNode, 'plant'); continue; }
        pushers += 1;
        if (pushers === 3) orderMove(S, e, M.WP.mid, 'advance'); // the lurker works mid
        else if (pushers === 4) orderMove(S, e, otherNode, 'advance'); // late flank
        else orderMove(S, e, siteNode, 'holdsite');
      } else {
        // Wardens: two hold each site, one watches mid.
        const idx = S.entities.filter((x) => x.team === 'def').indexOf(e);
        if (idx < 2) { e.ai.hold = M.holds.A[idx]; orderMove(S, e, M.WP.aSite, 'hold'); }
        else if (idx < 4) { e.ai.hold = M.holds.B[idx - 2]; orderMove(S, e, M.WP.bSite, 'hold'); }
        else { e.ai.hold = M.holds.mid[0]; orderMove(S, e, M.WP.midN, 'hold'); }
      }
    }
  }

  function botArrived(e) {
    const ai = e.ai;
    if (e.team === 'att' && e.hasCharge && !S.charge.planted) { ai.state = 'plant'; return; }
    if (S.charge.planted && e.team === 'def') {
      const site = S.charge.site;
      const d = Math.hypot(e.pos.x - S.charge.x, e.pos.z - S.charge.z);
      if (d < 2.2) { ai.state = 'defuse'; return; }
    }
    if (ai.then === 'holdsite' || ai.then === 'plant') {
      const holds = M.holds[S.targetSite];
      orderHold(e, holds[Math.floor(S.rng() * holds.length)]);
      return;
    }
    if (ai.then === 'hold' && ai.hold) { ai.state = 'hold'; return; }
    ai.state = 'idle';
  }

  function endRound(winner, reason) {
    if (S.phase === 'over' || S.phase === 'matchover') return;
    S.scores[winner] += 1;
    teamPay(winner, WIN_PAY);
    teamPay(winner === 'att' ? 'def' : 'att', LOSS_PAY);
    if (S.charge.planted) teamPay('att', 800);
    S.phase = 'over';
    S.phaseT = 5;
    S.charge.channel = null;
    const won = (winner === 'att') === (player().team === 'att');
    const label = winner === 'att' ? 'VANGUARD' : 'WARDENS';
    const sub = {
      elim: winner === 'att' ? 'Wardens eliminated' : 'Vanguard eliminated',
      time: 'The clock ran out',
      detonate: 'The Charge detonated',
      defuse: 'The Charge was defused',
    }[reason];
    S.hud.banner(`${label} WIN THE ROUND`, sub, 3600);
    S.audio.sting(won);
    if (S.scores[winner] >= WIN_SCORE) {
      S.phase = 'matchover';
      S.hud.showMatchEnd(winner === 'att' ? 'VANGUARD WIN THE MATCH' : 'WARDENS WIN THE MATCH', S.scores);
    }
  }

  function channelPlant(e, dt) {
    const site = M.sites[S.targetSite];
    const d = Math.hypot(e.pos.x - site.x, e.pos.z - site.z);
    if (d > site.r) {
      S.charge.channel = null;
      // A bot that starts its channel outside the zone walks back in first,
      // rather than standing in the plant state forever.
      if (!e.isPlayer) {
        e.ai.state = 'advance';
        orderMove(S, e, S.targetSite === 'A' ? M.WP.aSite : M.WP.bSite, 'plant');
      }
      return;
    }
    if (!S.charge.channel || S.charge.channel.by !== e) {
      S.charge.channel = { by: e, kind: 'plant', t: 0 };
      S.audio.beep(880);
    }
    const ch = S.charge.channel;
    ch.t += dt;
    if (Math.floor(ch.t * 2) !== Math.floor((ch.t - dt) * 2)) S.audio.beep(1180);
    if (e.isPlayer) S.hud.plantBar(ch.t / PLANT_TIME, 'PLANTING');
    if (ch.t >= PLANT_TIME) {
      S.charge.channel = null;
      if (e.isPlayer) S.hud.plantBar(null);
      S.charge.planted = true;
      S.charge.site = S.targetSite;
      S.charge.x = e.pos.x;
      S.charge.z = e.pos.z;
      e.hasCharge = false;
      S.charge.carrier = null;
      e.money += 300;
      chargeMesh.visible = true;
      chargeMesh.position.set(S.charge.x, 0, S.charge.z);
      S.phase = 'planted';
      S.phaseT = BOMB_TIME;
      S.hud.banner('CHARGE PLANTED', `Site ${S.targetSite} — ${BOMB_TIME} seconds`, 2400);
      S.audio.beep(1560);
      // Wardens rotate: the two nearest go to defuse, the rest cover the site.
      const defs = alive('def').sort((a, b) =>
        Math.hypot(a.pos.x - S.charge.x, a.pos.z - S.charge.z) - Math.hypot(b.pos.x - S.charge.x, b.pos.z - S.charge.z));
      defs.forEach((def, i) => {
        if (def.isPlayer) return;
        if (i < 2) orderMove(S, def, S.targetSite === 'A' ? M.WP.aSite : M.WP.bSite, 'defuse');
        else { def.ai.hold = M.holds[S.targetSite][i % 3]; orderMove(S, def, S.targetSite === 'A' ? M.WP.aSite : M.WP.bSite, 'hold'); }
      });
      // Attackers settle onto the site.
      for (const att of alive('att')) {
        if (att.isPlayer || att === e) continue;
        att.ai.hold = M.holds[S.targetSite][Math.floor(S.rng() * 3)];
        orderMove(S, att, S.targetSite === 'A' ? M.WP.aSite : M.WP.bSite, 'hold');
      }
    }
  }

  function channelDefuse(e, dt) {
    const d = Math.hypot(e.pos.x - S.charge.x, e.pos.z - S.charge.z);
    if (d > 2.2 || !S.charge.planted) { S.charge.channel = null; e.ai.state = 'idle'; return; }
    if (!S.charge.channel || S.charge.channel.by !== e) {
      S.charge.channel = { by: e, kind: 'defuse', t: 0 };
      S.audio.beep(980);
    }
    const ch = S.charge.channel;
    ch.t += dt;
    if (Math.floor(ch.t * 2) !== Math.floor((ch.t - dt) * 2)) S.audio.beep(1320);
    if (ch.t >= DEFUSE_TIME) {
      S.charge.channel = null;
      endRound('def', 'defuse');
    }
  }

  // Death drops the big guns (see the header) and frees the Charge.
  function onDeath(victim, killer) {
    if (S.charge.channel && S.charge.channel.by === victim) {
      S.charge.channel = null;
      if (victim.isPlayer) S.hud.plantBar(null);
    }
    if (killer && killer.alive && killer.team !== victim.team) killer.money += 300;
    victim.weapons.primary = null;
    victim.weapons.sniper = null;
    if (victim.current && victim.current.def.slot !== 1) victim.current = victim.weapons.pistol;
    victim.armor = Math.floor(victim.armor / 2);
    if (victim.hasCharge) {
      victim.hasCharge = false;
      S.charge.carrier = null;
      S.charge.dropped = { x: victim.pos.x, z: victim.pos.z };
      chargeMesh.visible = true;
      chargeMesh.position.set(victim.pos.x, 0, victim.pos.z);
    }
  }

  function buyItem(id) {
    const p = player();
    if (S.phase !== 'buy' || !p.alive) return false;
    if (id === 'armor') {
      if (p.armor >= 100 || p.money < ARMOR_PRICE) return false;
      p.money -= ARMOR_PRICE;
      p.armor = 100;
      return true;
    }
    if (id === 'frag' || id === 'smoke') {
      const def = NADE_DEFS[id];
      if (p.nades[id] >= 2 || p.money < def.price) return false;
      p.money -= def.price;
      p.nades[id] += 1;
      return true;
    }
    const def = WEAPONS[id];
    const slot = def.slot === 3 ? 'sniper' : 'primary';
    if (p.money < def.price) return false;
    p.money -= def.price;
    p.weapons[slot] = freshWeapon(id);
    return true;
  }

  function update(dt) {
    // A dropped Charge is picked up by the first attacker to reach it.
    if (S.charge.dropped && !S.charge.planted) {
      for (const e of alive('att')) {
        if (Math.hypot(e.pos.x - S.charge.dropped.x, e.pos.z - S.charge.dropped.z) < 1.3) {
          e.hasCharge = true;
          S.charge.carrier = e;
          S.charge.dropped = null;
          chargeMesh.visible = false;
          if (!e.isPlayer) orderMove(S, e, S.targetSite === 'A' ? M.WP.aSite : M.WP.bSite, 'plant');
          break;
        }
      }
    }
    if (S.charge.planted) {
      chargeLamp.material.emissiveIntensity = (Math.sin(S.time * 9) > 0 ? 3.4 : 0.4);
      if (S.phaseT < 10) { // the fuse accelerates its beeping under 10 s
        const beat = Math.floor(S.time * (S.phaseT < 5 ? 6 : 3));
        if (beat !== update.lastBeat) { update.lastBeat = beat; S.audio.beep(1420); }
      }
    }
    switch (S.phase) {
      case 'buy':
        S.phaseT -= dt;
        if (S.phaseT <= 0) startLive();
        break;
      case 'live': {
        S.phaseT -= dt;
        if (S.phaseT <= 0) { endRound('def', 'time'); break; }
        if (alive('def').length === 0) endRound('att', 'elim');
        else if (alive('att').length === 0) endRound('def', 'elim');
        break;
      }
      case 'planted': {
        S.phaseT -= dt;
        if (S.phaseT <= 0) {
          S.effects.explosion(new THREE.Vector3(S.charge.x, 1, S.charge.z));
          S.audio.explode();
          endRound('att', 'detonate');
          break;
        }
        if (alive('def').length === 0) endRound('att', 'elim');
        break;
      }
      case 'over':
        S.phaseT -= dt;
        if (S.phaseT <= 0) nextRound();
        break;
      default:
        break;
    }
  }

  return { startMatch, nextRound, update, buyItem, botArrived, channelPlant, channelDefuse, onDeath };
}
