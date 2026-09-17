# N-portal – pokyny pre Claude Code (projekt)

Dotykový panel na starom telefóne (PWA) + Node služba na PC + Ruby prijímač v SketchUpe. Stav a história sú v `docs/POSTUP.md`, plán a nápady v `docs/PLAN.md`, režim AI v `docs/AI-REZIM.md`. Prečítaj ich pred prácou; sú naše, udržiavame ich aktuálne.

## Režim práce (dohodnuté s Michalom 17. 9. 2026)

- **Orchestrácia:** hlavný agent (ja) píše zadania, rozdeľuje prácu na bloky, kontroluje výsledok a testuje na PC. **Implementáciu robia Opus subagenti** (Agent tool, `model: "opus"`), každý dostane presné zadanie s rozsahom, kontraktom a kritériami hotovosti. Hlavný agent výsledok vždy prečíta a overí (build, test v prehliadači, logy), nespolieha sa na hlásenie subagenta.
- **Worktrees:** zmeny sa robia vo worktree na vlastnej vetve (`git worktree add "C:/APP DEV/N Portal-<názov>" -b feat/<názov>`), nie priamo v `main`. Po dokončení bloku: build + test na PC → Michal spraví smoke test na mobile → po jeho „pass“ môžem **mergnúť do main automaticky** (fast-forward alebo merge commit), potom zostaviť main a reštartovať službu.
- **Commity:** na zvážení hlavného agenta (spravidla jeden commit na blok, správa po slovensky, prefix `feat(...)`, `fix(...)`, `docs:`). Push nerobiť bez pokynu.
- **Otázky:** pri akejkoľvek nejasnosti alebo rozhodnutí, ktoré mení správanie z pohľadu používateľa, napísať Michalovi a počkať. Neriešiť na vlastnú päsť.
- **Nápady Michala:** vždy prebrať, zhodnotiť náročnosť a prínos (aj kriticky), po schválení zapísať do `docs/PLAN.md` do sekcie nápadov; implementovať, keď sa to hodí.
- **Dokumentácia:** po každom bloku aktualizovať stav (`POSTUP.md` záznam s dátumom, kto testoval, výsledok), mazať neaktuálne, zapisovať budúce nápady. Žiadne tokeny, obsah rozhovorov ani súkromné názvy zákaziek do repa.
- **Komunikácia s Michalom:** po slovensky, tykanie, funkčne (čo to robí z pohľadu používateľa), technické detaily len na požiadanie. Pred väčšou zmenou najprv popísať, čo sa zmení.

## Prostredie a spúšťanie

- PC služba beží z `C:\APP DEV\N Portal\service\dist\index.js` cez Plánovač úloh „N-portal service“ (port 8790, reštart do minúty pri páde). Konfigurácia a dáta: `C:\Users\PC\.n-portal` (token v `service\config.json`).
- Mobil: `http://192.168.0.100:8790/?t=<token>` (adresa PC je rezervovaná v routeri). Mock stránky sú v `app/public/*.html` a po builde dostupné na rovnakej adrese.
- Build: `cd app && npm run build` (tsc + vite), `cd service && npm run build`. Služba servuje `app/dist` relatívne k svojmu umiestneniu, takže služba z worktree servuje PWA z toho istého worktree.
- **Test worktree buildu na mobile:** ukončiť úlohu Plánovača (`schtasks /end /tn "N-portal service"` a ukončiť proces na porte 8790), spustiť `node service/dist/index.js` z worktree, po teste vrátiť: `schtasks /run /tn "N-portal service"`. Nikdy nenechať bežať dve služby.
- Node 24 (má vstavané `node:sqlite`, experimentálne, len na čítanie). PowerShell 5.1 číta `.ps1` bez BOM ako ANSI, názvy úloh bez diakritiky.
- Nástroje Claude desktop majú AppData presmerované do súkromnej kópie; dáta patria do `~/.n-portal`, nie do AppData.

## Architektúra v skratke

- `app/` React + Vite PWA: `service.ts` (WebSocket, strážca spojenia), `App.tsx` (režimy AUTO/Station/SKP, slide prechod, stav výpadku), `Station.tsx`, `Skp.tsx`, `Ring.tsx`, `SwipeTile.tsx`, `VolumeStrip.tsx`, `ledPulse.ts` (LED cez nepočuteľný zvuk: `ledTap`, `ledError`, `ledLong`), `styles.css` (vh/vw jednotky, sklo `.glass`, počas prechodu `html.moving` bez blur).
- `service/src/`: `index.ts` (HTTP + WS, témy `sketchup`, `usage`, `media`, `foreground`, povely), `sketchup.ts` (súborový protokol na proces), `usage.ts` (snapshot.txt), `media.ts` (C# media-worker), `foreground.ts` (fg-worker.exe, `kindOf`).
- `sketchup/` Ruby prijímač, `tools/` skripty (autostart, inštalácia), `docs/` dokumentácia a mocky (`docs/assets`).
- Zásady UI: pevný horný pás, ručný režim má prednosť pred AUTO, neprepínať počas dotyku, výsledok povelu ako toast, pri chybe formátu externých dát zošedivieť, nie spadnúť.
