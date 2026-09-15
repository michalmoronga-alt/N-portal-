# Postup a aktuálny stav

**Aktuálne (15. 9. 2026 večer):** smer zmenený na PWA + lokálna služba ([SMER.md](SMER.md)). **E0 je hotové a prešlo na reálnom mobile** (služba `service/`, PWA `app/`, prijímač `sketchup/`): zameranie výberu, prázdny výber, viac objektov, a hlavne klávesnica aj myš zostávajú v SketchUpe bez klikania. **E1 (Station + SKP s pásom) je postavené a overené na PC; čaká na test na mobile.** Návod na spustenie je rovnaký ako pre E0 (nižšie); po zmene kódu stačí na mobile obnoviť stránku.

## Ako spustiť test E0 (Michal)

1. **Služba na PC:** v priečinku repa spusti `powershell -ExecutionPolicy Bypass -File tools\start-service.ps1`. Vypíše adresu pre mobil v tvare `http://192.168.0.101:8790/?t=KÓD`. Okno nechaj otvorené (alebo služba už beží z testu agenta).
2. **SketchUp:** prijímač sa načíta pri štarte SketchUpu 2026 (Extensions > N-portal E0). Ak SketchUp už beží a prijímač nie, Ruby konzola: `load 'C:/Users/PC/AppData/Roaming/SketchUp/SketchUp 2026/SketchUp/Plugins/nportal_e0/main.rb'`.
3. **Mobil, jednorazovo (cesta A):** v Chrome otvor `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, do poľa napíš `http://192.168.0.101:8790`, nastav Enabled, reštartuj Chrome. Bez toho funguje tlačidlo tiež, ale nie celá obrazovka bez lišty a držanie displeja.
4. **Mobil:** otvor adresu z bodu 1 (s `?t=KÓD`). Ikonou ⛶ vpravo hore prepni na celú obrazovku. Voliteľne Chrome menu > „Pridať na plochu“.
5. Prejdi kontrolný zoznam E0 a zapíš výsledky do tabuľky nižšie.

Dátový priečinok (povely, stav, logy): `C:\Users\PC\.n-portal`. Odstránenie experimentu: zmazať tento priečinok, `nportal_e0.rb` + `nportal_e0\` z Plugins SketchUpu 2026 a ukončiť službu.

## Prostredie (zapísané 15. 9. 2026)

| Položka | Hodnota |
|---|---|
| Windows | 11 Home 25H2, build 26200 |
| SketchUp | 2026 (26.0.429) — pracovná verzia; nainštalované aj 2022 a 2024 |
| Rainmeter | 4.5.26 (64-bit); skiny v `C:\Users\PC\Documents\Rainmeter\Skins` |
| JaxCore / ModularPlayers | ModularPlayers 2.64 (hudba), ModularClocks (čas) |
| spacedesk | Server 1.1.1770.100 (`C:\Program Files\datronicsoft`), beží ako služba |
| Telefón | IIIF150 Air1, naležato; vo Windows displej `\\.\DISPLAY5`, 1100 × 530 px (v Rainmeter.ini index `@5`) |
| Mierka | Neoverená v tomto zápise; rozlíšenie 1100 × 530 už zohľadňuje zväčšenie v spacedesku |
| Usage dáta | Skin `NOXUN AI Usage DEMO` (mode LIVE) zapisuje `@Resources\State\snapshot.txt` (key=value, každých 180 s) — čítať tento súbor, nezakladať druhý zberač |
| SketchUp pluginy | `%APPDATA%\SketchUp\SketchUp 2026\SketchUp\Plugins`: `noxun_engine` (Engine), `noxun_telemetry`, `cmd_select_n_isolate` (cudzí isolate plugin, referencia pre E3). `noxun_bridge` je GPT export, **nie** lokálne prepojenie |

Na telefóne (displej @5) aktuálne bežia skiny: NOXUN AI Usage DEMO, ModularClocks, ModularPlayers, Win10WeatherMultilingual.

## Pravidlo práce

Vždy jedna malá etapa: potvrdiť rozsah → načítať potrebné zdroje → navrhnúť minimum → vykonať až po zadaní → prakticky otestovať → zapísať výsledok. Až potom rozhodnúť o ďalšej etape. Nevydávať plánované funkcie za hotové.

Používateľ plánuje doma najprv research: čo už existuje, čo možno znovu použiť a čo treba vytvoriť. Časť následných testov pridelí agentom; fyzický dotyk a pracovnú ergonómiu overí sám. Tento dokument nie je pokyn na okamžité spustenie agentov alebo inštalácií.

## R0 — research pred implementáciou

Cieľom je krátky prehľad podkladov a najmenšieho technického experimentu, nie nový rozsiahly framework.

| Oblasť | Čo preveriť | Výstup |
|---|---|---|
| Rainmeter / JaxCore | Existujúci skin, prepínanie skupín prvkov, škálovanie, dostupné moduly na aktívne okno a gestá. | Použiť existujúce / malá úprava / vytvoriť. |
| Usage a hudba | Skutočný formát už zbieraných usage dát; ovládanie a metadata aktuálneho prehrávača; hlasitosť PC vs. konkrétny prehrávač. | Reuse bez druhého zberača; presne určený hudobný zdroj. |
| Aktívna aplikácia | Hotové komponenty a Windows API; okno/proces vs. titulok, vlastný widget, dialógy a rýchle prechody. | Minimálny pozorovací test. Nečítať históriu Chrome ani obsah stránok. |
| SketchUp kontext | Výber 0/1/viac, typ entít, aktuálny model/editačný kontext, dostupnosť observerov vo verzii používateľa. | Minimálny pozorovací test bez zmien modelu. |
| Lokálne prepojenie | Jednoduchý prenos stavov a potvrdených povelov; identita relácie, časová platnosť, odpojenie a opakovanie. | Jedna zvolená cesta pre E0, ostatné odložiť. |

Pri kandidátovi zapísať zdroj, podporované verzie, licenciu pre pracovné použitie/prevzatie kódu, údržbu a obmedzenia. Podklad v dokumentácii nie je dôkaz, že funguje v miestnej zostave. Primárne API odkazy sú v [PLAN.md](PLAN.md).

## Malé diagnostické testy — bez adaptívneho UI

Najprv iba zobrazovať/zaznamenávať stav; ešte neprepínať skutočný layout ani neposielať povely. Tým oddelíme chybu detekcie od chyby reakcie panela.

| Test | Čo spraviť / sledovať | Očakávaný dôkaz | Stav |
|---|---|---|---|
| **D0 — dotyk a kurzor** | Dotyk na existujúci widget, následne pohyb fyzickej myši a klávesnica. Zopakovať na budúcom skúšobnom skine, keď bude pripravený. | Poloha a správanie kurzora pred/po dotyku a pri ďalšom pohybe; kam smeruje klávesnica. | **Otestované 15. 9. 2026 (Michal, existujúci widget):** kurzor po dotyku zostane na widgete na mobile, mimo okna SketchUpu; klávesnica reaguje na okno widgetu, nie na SketchUp. |
| **D1 — okná** | Prechody SketchUp ↔ Chrome ↔ vlastný panel, príslušné dialógy, minimalizácia, rýchle Alt+Tab. | Záznam času, okna/procesu a vyhodnoteného kontextu; vlastný panel zachová pracovný kontext. | Neotestované |
| **D2 — výber** | 0 → 1 → viac → 0; výber obdĺžnikom, klik do prázdna; skupina/komponent aj hrana/plocha. | Počet, typ, identita modelu a editačný kontext. Vyčistenie výberu nesmie zostať nezachytené. | Neotestované |
| **D2 — životný cyklus** | Zmena editačnej úrovne, otvorenie/zatvorenie modelu, viac relácií, prerušenie zdroja dát. | Žiadni zdvojení observeri ani zamieňanie nedostupnosti za prázdny výber. | Neotestované |

**Výsledok D0:** pôvodná hypotéza (kurzor zostáva na mieste) sa nepotvrdila. Dotyk na Rainmeter skin presunie kurzor na mobil a prenesie klávesnicový fokus na okno skinu. E0 preto musí po každom poveli **vrátiť kurzor na hlavný monitor a fokus do SketchUpu** ako súčasť samotného povelu, nie ako neskoršie vylepšenie. Návrat kurzora a návrat fokusu zostávajú dve samostatné položky checklistu E0. Test zopakovať na testovacom skine E0, lebo správanie môže závisieť od nastavení skinu.

Rozsah D1/D2 držať minimálny: len potrebné signály. Implementácia adaptívneho rozloženia, histórie troch objektov ani swipe orbitu nie je podmienkou E0 a zostáva v neskoršom backlogu.

## Rozdelenie testov

| Kto | Čo môže dostať na starosť |
|---|---|
| **Agent — research a logika** | Načítať skutočné zdroje; porovnať reuse; pripraviť minimálne sondy, protokol a testy pravidiel na simulovaných udalostiach. Neskôr otestovať deduplikáciu histórie, zastarané dáta a chybové stavy. |
| **Lokálny agent s udeleným prístupom k Windows/SketchUpu** | Po samostatnom schválení spustiť diagnostiku/integráciu na testovacom modeli a zozbierať reálne logy. Bez dostupného runtime túto časť označiť ako neotestovanú. |
| **Michal — reálny mobil a pracovný postup** | Dotyk, kurzor, klávesnica po dotyku, trafiteľnosť, oneskorenie a nežiaduce prepínanie pri skutočnej práci. Potvrdiť, či ovládanie reálne pomáha. |

Simulácia nie je test spacedesk; test na PC bez mobilu nie je potvrdenie dotykovej ergonómie. Netreba, aby agent a Michal oba opakovali všetky skúšky — zdieľať konkrétne logy a výsledky.

## Pred testom E0

- [x] Zapísať verziu Windows, SketchUpu, Rainmetera/JaxCore a spacedesk; model telefónu, pripojenie, rozlíšenie a mierku. *(15. 9. 2026, tabuľka Prostredie; mierka spacedesku ešte nezapísaná)*
- [ ] Dokončiť krátky R0 a vyhodnotiť minimum D0/D1/D2; neimplementovať pri tom budúce adaptívne funkcie. *(R0 lokálne prostredie a D0 hotové; D1/D2 nie sú podmienkou E0, odložené za E0)*
- [x] Načítať skutočné nastavenie/widgetové zdroje, ktoré budú potrebné; nekopírovať prístupy k účtom. *(usage: snapshot.txt; hudba: ModularPlayers 2.64; ovládanie prehrávača z cudzieho skinu ešte neoverené)*
- [ ] Použiť samostatný testovací skin a kópiu/testovací SketchUp model. Existujúci Station a produkčný Engine nemeníme.
- [ ] Dohodnúť minimum prepojenia, jednoznačný cieľ a spôsob vypnutia/odstránenia experimentu.

## Kontrolný zoznam E0

| Skúška | Očakávanie | Stav |
|---|---|---|
| Vybrať skrinku → dotyk „Zamerať výber“ | Zameria správny výber v správnom modeli; panel dostane výsledok. | **PC (agent, 15. 9.):** OK, ~230 ms, kamera s okrajom. **Mobil (Michal, 15. 9. 17:30):** OK, po dotyku sa kamera presunie na vybraný korpus. |
| Bez výberu | Žiadny neočakávaný zoom/úprava; zrozumiteľná odpoveď. | **PC (agent):** OK. **Mobil (Michal):** OK, výpis „Nič nie je vybrané“. |
| Viac označených objektov | Zameria celý výber a zachová ho. | **Mobil (Michal):** OK, zameria všetky a vypíše správny počet objektov. |
| Opakované/rýchle dotyky | Predvídateľné správanie bez oneskorených prekvapení. | Čiastočne: PWA neposiela ďalší povel, kým nepríde výsledok (max 3 s). Mobil: neotestované |
| Dotyk → kláves M → pokračovať v modeli | S PWA nemá Windows o dotyku vedieť; overiť, že klávesnica ide do SketchUpu. | **Mobil (Michal, 15. 9.):** OK, klávesnica zostáva aktívna v SketchUpe, bez kliknutia. |
| Pokračovanie myšou | Kurzor sa nesmie pohnúť. | **Mobil (Michal, 15. 9.):** OK, kurzor zostáva v okne SketchUpu. Problém z D0 je týmto vyriešený. |
| SketchUp nepripravený/zatvorený | Nedostupný stav, žiadne kliky do inej aplikácie. | **PC (agent):** OK, služba povel odmietne, tlačidlo šedé, po obnovení prijímača opäť dostupné. |
| Viac relácií alebo zmena modelu | Jednoznačný cieľ, inak bezpečné odmietnutie. | Čiastočne: lock prijímača existuje, netestované s dvoma reláciami. |
| Prerušenie a obnovenie spojenia | Žiadne vykonanie starých povelov. | **PC (agent):** povel starší než 2 s prijímač zahodí („expired“); nepovolená akcia odmietnutá („rejected“). Výpadok Wi‑Fi: neotestované |
| Ukončenie testu | Možnosť odstrániť prijímač a službu, pôvodné prostredie funguje. | Odinštalovanie popísané vyššie; neoverené. |

**Brána E0:** pokračovať až po praktickom vyhodnotení prenosu, fokusu a kurzora. Ak niečo narúša modelovanie, najprv upraviť riešenie alebo zvoliť záložnú cestu; nerozširovať počet tlačidiel.

## Záznamy

| Dátum | Čo je skutočne známe | Ďalší krok |
|---|---|---|
| 15. 9. 2026 | Používateľ potvrdil fungujúci spacedesk a dotyk. Zapísaný kontext, etapy a návrhy A/B/C; B a C sú preferované. Vlastné ovládanie SketchUpu sa netestovalo. | Po návrate používateľa začať dohodnutým researchom a diagnostikou. |
| 15. 9. 2026 — doplnenie | Zapísané: väčší prehrávač pri Chrome, podstavy SKP podľa výberu, tri posledné objekty, research pred vývojom a rozdelenie testov agent/Michal. Overená existencia základných API, nie lokálna integrácia. | R0 → minimálne D0/D1/D2 → potvrdenie E0. |
| 15. 9. 2026 — R0 + D0 | Agent načítal lokálne prostredie (tabuľka Prostredie): usage dáta sú v `snapshot.txt` a dajú sa čítať bez druhého zberača; `noxun_bridge` nie je lokálne prepojenie, prijímač pre E0 treba vytvoriť nanovo. Michal vykonal D0 na existujúcom widgete: kurzor zostáva na mobile, klávesnica ide do okna skinu. | Dohodnúť protokol prepojenia vrátane návratu kurzora a fokusu → postaviť testovací skin + Ruby prijímač pre E0 → checklist E0 na reálnom mobile. |
| 15. 9. 2026 — zmena smeru | Michal navrhol PWA namiesto spacedesk; agent v [SMER.md](SMER.md) potvrdil, že to odstraňuje problém kurzora/fokusu. Rozhodnuté: PWA + Node služba, spojenie cesta A (Wi‑Fi + Chrome príznak), port 8790, usage do PWA v E1, štruktúra repa app/service/sketchup/tools/docs. Rainmeter skin a pomocný program zrušené. | Postaviť E0 v novom smere. |
| 15. 9. 2026 — E0 na PC | Postavené: služba (Node, WebSocket, token), PWA (React, jedno tlačidlo, stavy), prijímač (Ruby, súborový protokol). Agent otestoval cez SkAgent MCP a WebSocket: zameranie OK (~230 ms), prázdny výber → chyba, starý povel → zahodený, nepovolená akcia → odmietnutá, SketchUp nedostupný → tlačidlo šedé. Zistenie: nástroje Claude desktop majú AppData presmerované do súkromnej kópie, preto dátový priečinok je `%USERPROFILE%\.n-portal` (mimo AppData). Windows Media Session vidí prehrávanie v Chrome (základ pre E1). | Michal: test E0 na mobile podľa návodu (kľúčové: klávesnica a myš po dotyku). Potom E1 Station. |
| 15. 9. 2026 — E0 na mobile | Michal otvoril PWA na IIIF150 Air1 cez Wi‑Fi (cesta A), spojenie so službou funguje. Dotyk „Zamerať výber“ presunul kameru na vybraný korpus. Medzitým opravená chyba: pri dvoch reláciách SketchUpu sa po zatvorení prvej druhá nepreberala (prijímač 0.1.2 to rieši sám do 2 s). | Overiť klávesnicu a myš po dotyku, prázdny výber a viac objektov na mobile. Potom potvrdiť rozsah E1. |
| 15. 9. 2026 — E1 na PC | Postavené podľa odsúhlaseného mocku: prepínač Station/SKP, čas a dátum, usage kruhy zo `snapshot.txt` (Claude weekly + 5h, Codex weekly, čas resetu, označenie zastaraných dát), hudba cez Windows Media Session (názov, interpret, zdroj, obrázok skladby v pozadí, predošlá/play-pauza/ďalšia). Hudobný modul je C# program (`service/helper/media-worker.cs`) kompilovaný systémovým csc bez Windows SDK; PowerShell verzia zostala ako záloha bez obrázka. Agent overil na PC: usage správne, play/pauza z PWA do 300 ms, obrázok skladby 18 kB, SKP dlaždica „Zamerať výber“ funguje ako v E0. | Michal: test E1 na mobile (čitateľnosť, hudba, prepínanie, uspávanie displeja). Potom E1b (animácie) alebo E2 (pohľady). |
| 15. 9. 2026 — E1 na mobile | Michal potvrdil, že E1 na mobile funguje. Vizuál sa doladí priebežne. | Rozhodnúť ďalšiu etapu: E1b (animácie a prechody) alebo E2 (pohľady zhora/spredu/zľava, predošlý pohľad, celý model). |
| 15. 9. 2026 — E2 na PC | Michal zvolil E2 (vzhľad neskôr). Prijímač 0.2.0: `view_top`, `view_front`, `view_left` (kamera na osi modelu, zameranie výberu, bez výberu celý model, premietanie nemenené), `view_previous` (vlastná história kamery, max 20, len zmeny vyvolané panelom), `view_all`. Dlaždice v SKP aktívne. Agent overil na PC: smery kamery presne (0,0,−1), (0,1,0), (1,0,0); výber zachovaný; predošlý pohľad vrátil pôvodnú kameru presne; prázdna história → „Žiadny predošlý pohľad“; bez výberu → „celý model“; odozva 80–350 ms. | Michal: test E2 na mobile na reálnom modeli (či „Spredu“ zodpovedá jeho zvyku pri skrinkách). Potom E3 (viditeľnosť) alebo E1b (vzhľad). |
| 15. 9. 2026 — E2 na mobile | Michal potvrdil: všetky pridané funkcie fungujú podľa očakávania. Nový nápad do backlogu: pohľady ako jedna dlaždica so swipe (PLAN.md). | Rozhodnúť: E3 (viditeľnosť) alebo E1b (vzhľad). |
| 15. 9. 2026 — E3 na PC | Michal: tagy mimo V1, zvyšok E3 implementovať. Prijímač 0.3.0: `isolate_toggle` (skryje viditeľné susedy v aktuálnom kontexte, zoznam persistent ID, obnoví len tie; ak izolácia patrí inému modelu, zruší sa s chybou), `hidden_objects_toggle`. Stav v `state.txt`: isolation.active/count, view.hidden_objects → dlaždica „Izolovať“/„Obnoviť (skrytých N)“ a „Skryté objekty: zobrazené/skryté“. Agent overil na PC: 8 objektov, 1 vybraný → skrytých 7, obnovené 7 z 7; prepínač skrytých objektov oboma smermi; bez výberu chyba. Test „ručne skryté ostane skryté“ nebol jednoznačný, lebo Michal počas testu menil editačný kontext. | Michal na mobile: izolovať/obnoviť na reálnej skrinke; ručne skryť objekt, izolovať, obnoviť → má ostať skrytý; skryté objekty prepínač. Potom E1b (vzhľad). |
| 15. 9. 2026 — E4 na PC | Michal: vzhľad neskôr, overiť AUTO režim podľa aktívneho okna a prácu v dvoch SketchUpoch. Sonda D1 potvrdila detekciu aktívneho okna (a odhalila, že povely išli do iného SketchUpu, než v ktorom Michal pracoval). Postavené: `fg-worker.exe` (aktívne okno každých 200 ms), prijímač 0.4.0 so stavom a povelmi na proces (`state-<pid>.txt`, `cmd\<pid>\`), bez zámku; služba smeruje povely do relácie naposledy v popredí, inak do jedinej, inak zablokuje s hláškou; PWA záložky AUTO / Station / SKP, oneskorenie 400 ms, neprepína počas dotyku, väčší prehrávač pri Chrome, v páse názov aktívneho okna a cieľový model. Overené na PC: povel do správnej relácie, simulovaná druhá relácia, logika výberu cieľa (5 prípadov), zánik relácie do 3 s. | Michal na mobile: AUTO pri prepínaní SketchUp ↔ plocha ↔ Chrome, rýchly Alt+Tab, dva otvorené modely (klik do jedného → cieľ v páse), ručná voľba Station/SKP má prednosť. |
| 15. 9. 2026 — E4 na mobile | Michal potvrdil, že E4 funguje. Vzhľad (E1b) odložený, kým si naň nesadne. | Vybrať ďalšiu užitočnú etapu z backlogu. |
| 15. 9. 2026 — automatický štart | Úloha Plánovača „N-portal service“ (`tools/install-autostart.ps1`): 15 s po prihlásení spustí službu bez okna cez `tools/service-hidden.vbs`, ktorý čaká na beh služby; pri páde reštart do minúty (max 5×), bez časového limitu. Služba sa pri obsadenom porte ticho ukončí (druhá kópia). Overené: úloha v stave Running, služba odpovedá, žiadne okno; druhá kópia skončila s kódom 0. Pozor: názov úlohy bez diakritiky, PowerShell 5.1 číta .ps1 bez BOM v ANSI. | Ďalšia etapa z backlogu (Engine kontext výberu, pohľady so swipe + ISO/X‑Ray, usage bez Rainmetera…). |
| 15. 9. 2026 — LED spätná väzba | Michal: Engine kontext mimo V1 (po dokončení Engine). Otázka: zadné RGB LED telefónu (IIIF150 Lights: Breathing LED pri upozorneniach, Rhythm Lights pri prehrávaní médií). Priame API neexistuje. Test `app/public/led.html`: tóny cez Web Audio LED **nespustia** (ani nahlas); zvuk cez `<audio>` prehrávač (mediálna relácia ako YouTube) LED **spustí aj pri najnižšej hlasitosti a nie je počuť** (30/50 Hz tón aj beat 45/120 Hz). Krátke pulzy: 200 ms len občas, **400 ms spoľahlivo**, dlhšie pulzujú; oneskorenie 0,5–1 s. Zabudované: `app/src/ledPulse.ts` – 400 ms pulz pri klepnutí na dlaždicu/hudbu, 800 ms dvojpulz pri chybe, prepínač 💡 v páse (pamätá si). Vedľajší efekt: v lište upozornení sa mihne ovládanie „N-portal“. | Michal vyskúša v bežnej práci, či mu lišta neprekáža. |
| 15. 9. 2026 — E5 na PC | Michal: USB mimo V1; poradie ďalej: pohľady ako dlaždica + ISO/X‑Ray → hlasitosť → UI/UX rework. Prijímač 0.5.0: `view_right`, `view_iso`, `xray_toggle` (+ `view.xray` v stave). PWA: `SwipeTile` (prah 36 px, dominantná os 1,4×, šípky so smermi počas ťahu, klepnutie = len nápoveda 1,5 s), dlaždice ISO a X‑Ray (zapnutý = zvýraznená). Overené na PC: Sprava dir (−1,0,0), ISO dir (−0.58,0.58,−0.58), X‑Ray oboma smermi so stavom v službe, potiahnutie hore v prehliadači poslalo `view_top`. | Michal na mobile: potiahnutie všetkými štyrmi smermi, klepnutie bez akcie, ISO, X‑Ray. Potom hlasitosť. |
| 15. 9. 2026 — E0 uzavreté | Michal na mobile potvrdil: klávesnica aj kurzor zostávajú aktívne v SketchUpe bez kliknutia; prázdny výber dáva výpis „Nič nie je vybrané“; viac objektov sa zameria so správnym počtom. **Brána E0 splnená.** | Dohodnúť rozsah E1 (Station: čas, dátum, usage, hudba; ručný prepínač Station/SKP). |

Po každom teste doplniť dátum, prostredie/verzie, rozsah, kto a kde test vykonal, pozorovaný výsledok, chyby a rozhodnutie. Nevyplňovať úspechy odhadom. Do verejného repozitára nedávať tokeny, obsah webových stránok, súkromné názvy zákaziek ani plné produkčné logy.
