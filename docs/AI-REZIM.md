# Režim AI – špecifikácia (etapa AI‑1)

Tretí hlavný režim panela popri Station a SKP. Michalove tri piliere práce: SketchUp, prehliadač, AI agenti. Mock schválený 17. 9. 2026: `app/public/mock4.html` (fázy a pohľady prepínateľné vpravo dole). **Mock sa už nemení**, poznámky k implementácii sú nižšie.

## Čo režim robí (z pohľadu používateľa)

- **Spúšťač:** v AUTO režime sa panel prepne do AI, keď je na PC aktívne okno Claude (proces `claude.exe`) alebo Codex (`codex.exe`). Ručná voľba (Station / SKP / AI) má prednosť. Prepínanie so slide prechodom ako medzi Station a SKP; AI je „ďalej vľavo“ od SKP alebo vpravo od Station – poradie zvoliť tak, aby ťah po hornej lište dával zmysel (navrhnuté: Station ‑ SKP ‑ AI; ťah doľava = ďalší režim).
- **Rozloženie:** bočný pás vľavo ako v SKP (20 % šírky, bez rámčeka): čas a dátum hore, dva kruhy usage v strede (o niečo väčšie než v SKP, s podtextom: Codex „reset so 14:00“, Claude „5h 8 % · reset o 2 h 34 min“), malý prehrávač dole. Zvyšok obrazovky: sklenená karta **Agenti**.
- **Karta Agenti:** hlavička „Agenti · 2 pracujú · 1 čaká na teba · pred 3 s“. Zoznam kariet, jedna na reláciu. Karta: mini logo (Claude / Codex), názov projektu (priečinok), pod ním názov relácie **len ak existuje** (vlastný názov z Claude Code; u Codexu model a effort), vpravo stavový čip a čas.
  - Stavy: **pracuje** (modrý čip, blikajúca bodka, „4 min · pred 6 s“), **čaká na teba** (jantárový čip, karta zvýraznená, „otázka pred 40 s“), **hotovo** (zelený čip, „pred 2 min · trvalo 14 min“), **nečinný** (stlmená karta, „bez aktivity 25 min“).
  - Poradie: čaká na teba → pracuje → hotovo → nečinný; v skupine podľa poslednej aktivity.
  - Dolný riadok: „dnes: 3 projekty · 41 ťahov · aktívne 2 h 10 min · ⟡ 128 k out · ⬡ 11 k out“.
- **Animované vnútro karty (CSS):** pracuje = pomalé vlnenie zľava doprava (5,5 s) a drobné častice plynúce v toku; čaká = jantárový pulz zo stredu (1,6 s) a častice blúdiace neurčito. **Poznámka Michala k implementácii: častice o niečo menšie než v mocku a s náhodnými polohami/rýchlosťami** (nie pevné ako v mocku). Farby: Claude modré vlnenie, Codex zelenkavé. Pri „obmedziť pohyb“ v nastaveniach animácie vypnúť.
- **Prázdne stavy:** „Žiadny agent nebeží · Naposledy: ⟡ N‑portal, skončil 20:31“; „Stav agentov nedostupný · Claude Code alebo Codex zapisuje stav v inom formáte než panel pozná · Usage a hudba fungujú ďalej“ (panel zošedne na 75 %, nikdy nespadne).
- **Upozornenie naprieč režimami:** keď niektorý agent prejde do „čaká na teba“ alebo „hotovo“, v hornom páse sa v každom režime zobrazí štítok s mini logom a textom („N‑portal čaká na teba“ jantárový a **blikajúci**; „RUBY ENGINE hotovo“ zelený bez blikania) a zabliká LED (`ledLong`). V Station/SKP navyše toast dole „⟡ RUBY ENGINE skončil (14 min)“. Štítok zmizne, keď sa stav zmení (agent znova pracuje) alebo po klepnutí naň. Štítok nesmie vytlačiť stavový text; pri malej šírke skráti text.
- **Mini logá:** vlastné jednofarebné SVG (lúčová hviezda pre Claude, šesťlupeňový uzol pre Codex) z mocku, preberajú farbu textu. Použiť v kruhoch usage (aj v Station a SKP), na kartách, v štítku a toastoch. Michal poskytol zdroj oficiálnych log (logo.dev, aplikácia je len súkromná); zatiaľ ostávajú vlastné ikony (offline, bez tokenu), oficiálne prípadne neskôr.

## Zdroje dát (lokálne, len čítanie, nikdy obsah rozhovorov)

Všetko číta **služba na PC** (Node), PWA dostane hotový zoznam. Formáty sú interné (Claude Code, Codex) a môžu sa zmeniť: pri chybe parsovania poslať `available: false` s dôvodom, nikdy nezhodiť službu.

### Claude Code

- Živé relácie: `%USERPROFILE%\.claude\sessions\<pid>.json` – `name`, `cwd`, `status` (pozorované `busy`; iné hodnoty brať ako „nečinný“), `startedAt`, `updatedAt`, `statusUpdatedAt`, `entrypoint`, `sessionId`, `version`. Súbor zmizne po skončení procesu; overiť aj, či `pid` beží (inak ignorovať, staré súbory nemusia byť upratané).
- Záznam relácie: `%USERPROFILE%\.claude\projects\<slug>\<sessionId>.jsonl` (slug = cwd s nahradenými znakmi; hľadať podľa `sessionId` v názve súboru, nie odvodzovať slug). Riadky JSON: `type` (`assistant`, `user`, `custom-title`, …), `timestamp`, `cwd`, `gitBranch`, `effort`; `assistant`: `message.model`, `message.usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`), `message.stop_reason` (`tool_use` / `end_turn`), `message.content[]` s `type: tool_use` a `name`; `user` s textom = Michalov ťah, `user` s `tool_result` = výsledok nástroja; `custom-title.customTitle` = názov relácie. Súbory majú MB; čítať len prírastok od poslednej pozície (sledovať veľkosť) a pre detail počítať priebežne.
- **Odvodenie stavu:** `status === 'busy'` → pracuje. Inak: posledný záznam je `assistant` so `stop_reason: end_turn` a od `statusUpdatedAt` uplynulo < 30 min → **čaká na teba** (agent odpovedal, Michal ešte nereagoval); ak posledný záznam je `user` (Michal písal, agent ešte nezačal) → pracuje; bez aktivity > 30 min → nečinný. „Hotovo“ = prechod z pracuje do čaká, zobrazovaný 10 min ako „hotovo“, potom „čaká na teba“ (nápad: „hotovo“ vtedy, keď posledná správa nekončí otázkou – zatiaľ nerozlišovať).
- Zobraziť všetky bežiace relácie; relácie s cwd v `AppData\...\scratch-workspaces` (dočasné pracovné priečinky Claude desktop) pomenovať projektom „scratch“.

### Codex

- Vlákna: `%USERPROFILE%\.codex\state_5.sqlite`, tabuľka `threads` (`id`, `title`, `cwd`, `created_at`, `updated_at` (epoch s), `tokens_used`, `source`, `model_provider`, `archived`). Ťahy: `%USERPROFILE%\.codex\thread_history_1.sqlite`, tabuľka `thread_turns` (`thread_id`, `turn_id`, `status`: `inProgress` / `completed` / `failed` / `interrupted`, `started_at`, `completed_at` (epoch s), `duration_ms`). Otvárať cez `node:sqlite` **read-only** (`DatabaseSync` s `{ readOnly: true }`) a zavrieť po dopyte; databázu drží aplikácia Codex, počítať so zamknutím (WAL) → pri chybe poslať posledný známy stav.
- Záznam (detail): `%USERPROFILE%\.codex\sessions\RRRR\MM\DD\rollout-<čas>-<id>.jsonl` – `session_meta` (cwd, cli_version, originator, source), `turn_context` (model, effort), `event_msg` s `payload.type` `token_count` (`info.total_token_usage`: input/cached/output/reasoning), `task_started`, `task_complete`, `custom_tool_call`. `originator: "Claude Code"` = Codex spustený z Claude Code (zobraziť ako Codex, poznámka „z Claude Code“ v detaile).
- **Odvodenie stavu:** ťah `inProgress` bez `completed_at` → pracuje; posledný ťah `completed` a `updated_at` < 30 min → čaká na teba / hotovo (rovnaké pravidlo 10 min); inak nečinný. Zobraziť len vlákna s aktivitou za posledných 24 h a nearchivované; „názov“ = `title` skrátený na 40 znakov len ak nie je prvá správa (title je často celý prompt → ak je dlhší než 60 znakov alebo obsahuje nový riadok, považovať ho za nevhodný a nezobrazovať).

### Aktívne okno

`foreground.ts` – `kindOf`: `claude` → `ai`, `codex` → `ai` (nový druh `ai`). AUTO: `ai` → režim AI; `sketchup` s pripraveným prijímačom → SKP; inak Station.

## Kontrakt služba → PWA

Nová téma `agents`, posielaná pri zmene a najmenej každých 5 s:

```json
{ "type": "agents", "ts": 1789680000000, "data": {
  "available": true, "reason": null,
  "updatedAt": 1789680000000,
  "agents": [
    { "id": "claude:113120", "provider": "claude", "project": "N-portal", "cwd": "C:\\APP DEV\\N Portal",
      "title": "N portal ďalšie kroky", "status": "busy", "since": 1789679760000, "lastActivity": 1789679994000,
      "startedAt": 1789667956940, "pid": 113120,
      "detail": { "model": "claude-fable-5-1", "effort": "high", "turns": 11, "tokensIn": 3742, "tokensOut": 128505, "cacheRead": 19452438, "durationMs": 10900000, "tools": { "Bash": 39 }, "branch": "main", "origin": null } }
  ],
  "today": { "projects": 3, "turns": 41, "activeMs": 7800000, "claudeOut": 128505, "codexOut": 11295 }
}}
```

`status`: `busy` | `waiting` | `done` | `idle`. `project` = posledná zložka cwd. `detail` môže byť `null`, kým nie je spočítaný. `today` = súhrn za dnešný deň zo záznamov (projekty s aktivitou, Michalove ťahy, súčet trvania „busy“ úsekov, výstupné tokeny). Pri `available: false` je `reason` krátky text pre používateľa.

## Poznámky k implementácii (mimo mock)

- Karta „čaká na teba“ vždy navrchu.
- Častice menšie a náhodné (poloha, rýchlosť, veľkosť generované pri vykreslení, 5–7 kusov na kartu). Animácie len `transform`/`opacity`, bez JS slučky. Pri `html.reduce` vypnúť.
- **Potiahnutie karty (neskôr, AI‑2):** ťah na karte otvorí detail: model a effort, tokeny (vstup/výstup/cache), Michalove ťahy, trvanie, nástroje, vetva, u Codexu pôvod. **Klepnutie (neskôr, AI‑3):** prenesie okno relácie na PC dopredu (cez fg‑worker / Win32 `SetForegroundWindow`), nikdy nepíše do agenta.
- Kruhy usage v Station a SKP dostanú mini logo pri názve.
- Stav agentov nesmie ovplyvniť povely do SketchUpu ani hudbu.

## Rozhodnutia počas implementácie (17. 9. 2026)

- Relácia Claude bez záznamu (otvorené okno bez prvého ťahu) sa nezobrazuje (šum).
- Codex ťah `inProgress` = pracuje len ak `updated_at` < 5 min (zaseknuté ťahy po páde ostávajú v databáze).
- `today.activeMs` sa počíta od štartu služby; perzistencia cez reštart je nápad na neskôr.
- Ťah po hornej lište cykluje dookola (z AI doľava → Station). Klepnutie na štítok zruší všetky upozornenia.
- V režime AI horný pás ukazuje „Aktívne okno: … · N relácie“ namiesto stavu SketchUpu.
- Prázdny stav „Žiadny agent nebeží“ sa ukáže, keď nie je nikto v stave pracuje/čaká/hotovo; nečinné relácie sa vtedy ako karty nevypisujú (len riadok „Naposledy“).

## Ďalšie nápady (na neskôr, po schválení)

- `today.activeMs` ukladať do `~/.n-portal`, aby prežil reštart služby.

- AI‑2 predpoveď usage: tempo, „týždeň dôjde v piatok“, varovanie „Codex vyčerpaný do soboty 14:00, použi Claude“.
- Dnešná práca podrobne: tri projekty dňa, ťahy, aktívny čas, tokeny.
- Rozlíšiť „hotovo“ od „čaká na otázku“ podľa toho, či posledná odpoveď agenta končí otázkou (heuristika, možno neskôr).
