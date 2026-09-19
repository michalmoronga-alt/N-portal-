# N-portal

Dotykový pracovný panel NOXUN: starší mobil (IIIF150 Air1) ako druhá obrazovka k PC. Ovláda SketchUp jedným dotykom, ukazuje čas, usage Claude/Codex a hudbu, reaguje na to, čo máš práve na PC otvorené.

**Stav k 19. 9. 2026:** V1 je funkčná a denne používaná. Hotové a overené na mobile: E0 až E7 (SketchUp, Station, AUTO, spoľahlivosť spojenia), vizuálny rework, režim AI (agenti Claude Code a Codexu, detail karty, body aktivity na kruhoch usage), hudba 2. kolo (priebeh skladby s posunom, gestá na obale, obrázok z YouTube v plnom rozlíšení, equalizer zo skutočného zvuku), celá obrazovka dvojklikom a ambientný režim po nečinnosti. Podrobnosti a záznamy testov sú v [Postupe](docs/POSTUP.md), plán a nápady v [Pláne](docs/PLAN.md), režim AI v [AI-REZIM.md](docs/AI-REZIM.md), spôsob práce v [CLAUDE.md](CLAUDE.md).

## Ako to funguje

```text
mobil (PWA v Chrome, celá obrazovka)
   │  Wi‑Fi, WebSocket s párovacím kódom
PC služba (Node)  ──  aktívne okno, hudba a hlasitosť (Windows), usage (súbor z NOXUN AI Usage)
   │  súbory v %USERPROFILE%\.n-portal\e0 (povely a stav, na proces)
SketchUp 2026  ──  Ruby prijímač: len povolené akcie, nič iné
```

Mobil nie je monitor Windows (žiadny spacedesk), preto dotyk nikdy neukradne kurzor ani klávesnicu zo SketchUpu.

## Čo panel vie

| Režim | Obsah |
|---|---|
| **Station** | Hodiny s dňom a dátumom, dva usage kruhy (Codex týždeň; Claude týždeň + 5h prstenec) s detailom po potiahnutí (resety, odpočet do resetu 5h, stav účtu), hudba z Windows s obrázkom skladby (pri YouTube v plnom rozlíšení cez malé rozšírenie do Chrome, `chrome-ext/`), prúžok priebehu s posunom ťahom, jemný equalizer reagujúci na skutočný zvuk PC, gestá na obale (ťah = ďalšia/predošlá, klepnutie = pauza), ovládanie prehrávania, hlasitosť PC ťahom po hornom okraji karty. |
| **SKP** | Zúžený Station v bočnom páse a 8 dlaždíc: Zamerať výber, Pohľad (potiahnutie hore/dole/vľavo/vpravo = zhora/spredu/zľava/sprava), ISO, X‑Ray, Predošlý pohľad, Celý model, Izolovať/Obnoviť, Skryté objekty. Výsledok povelu ako toast. |
| **AI** | Pri aktívnom Claude alebo Codex: bočný pás ako v SKP a karta „Agenti“ so živým stavom relácií Claude Code a Codexu (pracuje / čaká na teba / hotovo / nečinný), súhrn dňa; upozornenie štítkom, toastom a LED vo všetkých režimoch. Špecifikácia: [docs/AI-REZIM.md](docs/AI-REZIM.md). |
| **Ambient** | Po 5 min bez dotyku v Station (nastaviteľné): stmavené video pozadie (prvých 30 min, potom snímka; v noci tmavšie), veľké hodiny, malé kruhy usage s bodmi agentov, riadok skladby a equalizer cez celú šírku. Dotyk vráti Station bez akcie; ukončí ho aj agent čakajúci na vstup alebo prepnutie okna na PC. |
| **AUTO** | Aktívny SketchUp na PC → SKP, iná aplikácia → Station, Chrome → väčší prehrávač. Pri dvoch otvorených SketchUpoch idú povely do toho, v ktorom si naposledy klikol. |

Ďalšie: kruhy usage ukazujú aktivitu agentov obiehajúcimi bodmi (modré pracuje, fialové čaká na teba, zelené hotovo), v ručnom SKP sú povely zablokované, keď SketchUp nie je aktívne okno, pri výpadku spojenia celý panel zosivie s pruhom „PC neodpovedá“ a sám sa pripojí späť (aj po spánku telefónu či výpadku Wi‑Fi), spätná väzba zadnými LED telefónu (nepočuteľný tón cez prehrávač), automatický štart služby po prihlásení do Windows, nastavenia pod ozubeným kolieskom (režim, LED, animácie, celá obrazovka), rýchle prepnutie potiahnutím po hornej lište, celá obrazovka dvojklikom na hornú lištu.

**Mimo V1 (rozhodnuté):** tagy, kontext výberu z NOXUN Engine (po jeho dokončení), USB spojenie. Odložené: priebeh skladby, gestá na obale, preusporiadanie dlaždíc.

## Spustenie

1. **PC služba:** po prihlásení sa spúšťa sama (Plánovač úloh „N-portal service“, `tools/install-autostart.ps1`). Ručne: `powershell -ExecutionPolicy Bypass -File tools\start-service.ps1` – zostaví PWA, službu aj C# pomocníkov a vypíše adresu pre mobil.
2. **SketchUp:** prijímač sa načíta pri štarte (Extensions > N-portal E0). Inštalácia: `tools/install-sketchup.ps1`.
3. **Mobil:** v Chrome jednorazovo `chrome://flags/#unsafely-treat-insecure-origin-as-secure` = adresa PC (bezpečný kontext pre celú obrazovku a držanie displeja), potom otvoriť adresu z konzoly služby (`http://<IP PC>:8790/?t=<kód>`), voliteľne „Pridať na plochu“.

Dáta za behu: `C:\Users\<meno>\.n-portal` (povely, stav, logy, konfigurácia služby s párovacím kódom). Odstránenie: zmazať tento priečinok, `nportal_e0.rb` + `nportal_e0\` z Plugins SketchUpu, `tools/uninstall-autostart.ps1`.

## Časti repozitára

| Priečinok | Obsah |
|---|---|
| `app/` | PWA pre mobil (Vite + React + TypeScript). `npm run build` → `app/dist`, servuje ju služba. V `public/` aj mocky (`mock*.html`, `led.html`) a pozadie `bg.jpg`. |
| `service/` | Lokálna služba na PC (Node + TypeScript): servuje PWA, WebSocket s tokenom, témy sketchup / usage / media / foreground. `helper/` – C# pomocníci (hudba a hlasitosť cez Windows Media Session a Core Audio, aktívne okno), kompilované systémovým csc bez SDK. |
| `sketchup/` | Ruby prijímač povelov pre SketchUp 2026 (zoznam povolených akcií, stav a povely na proces, história kamery, izolácia). |
| `tools/` | Štart služby, automatický štart (Plánovač), inštalácia prijímača. |
| `docs/` | Dokumentácia (nižšie). |

## Dokumentácia

| Súbor | Účel |
|---|---|
| [Postup a stav](docs/POSTUP.md) | Aktuálny stav, návod na spustenie testu, kontrolné zoznamy a záznamy všetkých testov po etapách. |
| [Plán](docs/PLAN.md) | Etapy E0–E6 a E1b so stavom, správanie príkazov, backlog a nápady mimo V1. |
| [Analýza smeru](docs/SMER.md) | Prečo PWA + lokálna služba (a nie Rainmeter + spacedesk), čo použiť hotové a čo vlastné, spojenie mobil ↔ PC. |
| [Návrh reworku UI/UX](docs/REWORK.md) | Zásady, prechody, drobné funkcie, katalóg animácií a rozhodnutia Michala k vzhľadu. |
| [Kontext](docs/KONTEXT.md) | Pôvodné zadanie, prvé testy (D0), pravidlá a riziká. |
| [Vizuálne návrhy](docs/VIZUALY.md) | Úvodné koncepty A/B/C; zvolený smer B posunutý do frosted glass. |

Do verejného repozitára nepatria prihlasovacie tokeny, skutočná telemetria účtov ani zákaznícke modely. Párovací kód služby je len v lokálnej konfigurácii.
