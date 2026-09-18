# Plán po malých etapách

Stav k 17. 9. 2026: smer PWA + lokálna služba (pozri [SMER.md](SMER.md)). **Hotové a overené na mobile: E0, E1, E2, E3 (bez tagov), E4, E5, E6, E1b (rework, 1. kolo), E7 (spoľahlivosť spojenia, overené na PC).** Rozpracované: **AI‑1 – režim AI** (špecifikácia v [AI-REZIM.md](AI-REZIM.md), mock schválený). Rozsah každej ďalšej etapy potvrdiť pred začatím; neimplementovať celý backlog naraz.

Doplnené nápady na adaptívne rozhranie podľa aplikácie a výberu. Sú to budúce experimenty, nie rozšírenie V1. Pred implementáciou najprv research hotových riešení a malé diagnostické testy podľa [POSTUP.md](POSTUP.md).

## Etapy

| Etapa | Malý výsledok | Podmienka pokračovania |
|---|---|---|
| **E0 — dôkaz cesty** | PWA s jedným tlačidlom „Zamerať výber“ a ukazovateľom spojenia, lokálna služba na PC, Ruby prijímač. Pôvodné skiny a Engine nemeníme. **Postavené 15. 9. 2026, otestované na PC** (pozri POSTUP.md). | Na reálnom mobile: správny model, odozva, ruka na myši pokračuje bez klikania; chyba/odpojenie zrozumiteľné. |
| **E1 — Station** | Čas, dátum, usage (Claude weekly + 5h, Codex weekly) zo súboru existujúceho skinu, hudba cez Windows Media Session (názov, play/pause, ďalšia/predošlá, obrázok skladby v pozadí karty). Ručný prepínač Station/SKP. Rozloženie podľa odsúhlaseného mocku (`app/public/mock.html`, 15. 9. 2026). | Čitateľnosť a dotyk na skutočnom mobile; stabilné prepínanie; Station funguje bez SketchUpu; displej sa neuspáva. |
| **E1b — rework UI/UX** | Frosted glass nad obrázkom pozadia, Slide prechod 480 ms s paralaxom, hlavička len so stavom, nastavenia pod ⚙, nové rozloženie Station (hodiny, kruhy nad sebou, detail usage roztiahnutím karty), zúžený Station v SKP bez rámčeka, sklenené dlaždice, toasty, vektorové ikony. Rozhodnutia v [REWORK.md](REWORK.md). **1. kolo hotové 15. 9. 2026, overené na mobile.** | Ďalšie kolá podľa postrehov z používania. |
| **E2 — navigácia** | Zhora, spredu, zľava so zameraním výberu (bez výberu celý model); predošlý pohľad z vlastnej histórie kamery (posledných 20 zmien vyvolaných panelom, nie Undo modelu); celý model. Osi modelu, premietanie sa nemení. **Postavené 15. 9. 2026, overené na PC.** | Overenie na mobile a na reálnej zákazke; lokálne osi skrinky a rovnobežné premietanie zostávajú návrhy na neskôr. |
| **E4 — AUTO režim a viac relácií** | Služba sleduje aktívne okno (proces, PID, titulok). PWA má AUTO / Station / SKP: v AUTO aktívny SketchUp s pripraveným prijímačom → SKP, inak Station; Chrome → Station s väčším prehrávačom; oneskorenie 400 ms, neprepína počas dotyku; ručná voľba má prednosť. Každá relácia SketchUpu má vlastný prijímač a stav; povely idú do relácie, ktorej okno bolo naposledy v popredí; pri viacerých bez jasného cieľa sú tlačidlá zablokované s vysvetlením. **Postavené 15. 9. 2026, overené na PC.** | Overenie na mobile: prepínanie SketchUp ↔ plocha ↔ Chrome, dva otvorené modely, rýchly Alt+Tab. |
| **E5 — pohľad jednou dlaždicou, ISO, X‑Ray** | Dlaždica „Pohľad“ s potiahnutím: hore = zhora, dole = spredu, doľava = zľava, doprava = sprava (nový povel `view_right`); klepnutie len ukáže smery. Uvoľnené miesta: **ISO** (`view_iso`, kamera spredu‑sprava‑zhora na výber/model) a **X‑Ray** (`xray_toggle`, priehľadnosť modelu, stav v páse). Mriežka ostáva 4 × 2. **Postavené 15. 9. 2026, overené na PC.** | Overenie na mobile: trafiteľnosť potiahnutia, či klepnutie nespúšťa nič nechcené. |
| **E6 — hlasitosť PC** | Hlasitosť hlavného výstupu PC (Core Audio v hudobnom module). Len v Station: neviditeľný pás na hornom okraji hudobnej karty, potiahnutie doľava = tichšie, doprava = hlasnejšie (celá šírka karty = 100 bodov); počas ťahu a 2 s po ňom odznak s percentami a ikonou. Zmena hlasitosti priamo na PC sa premietne do panela. V SKP skryté. **Postavené 15. 9. 2026, overené na PC.** | Overenie na mobile: citlivosť ťahu, či pás nekoliduje s prehrávacími tlačidlami. |
| **E3 — viditeľnosť** | Izolovať / obnoviť ako jedna prepínacia dlaždica (skryje viditeľné susedy v aktuálnom editačnom kontexte, pamätá si ich, obnoví len tie; jeden krok Undo); zobrazenie skrytých objektov ako prepínač (View > Hidden Objects, nezasahuje do skrytej geometrie ani tagov). **Tagy mimo V1** (rozhodnutie Michala 15. 9. 2026). **Postavené 15. 9. 2026, overené na PC.** | Overenie na mobile; ručný test „čo bolo skryté pred izoláciou, ostane skryté“. |

E0 je samostatný technický experiment, nie hotová V1. Kandidát na prvý použiteľný základ je E1; presný obsah vydania sa určí podľa testov. Automatika, adaptívne rozloženie, história objektov a gestá sú mimo V1. Diagnostika ich vstupných signálov nie je ich implementácia.

## Správanie prvých príkazov

| Príkaz | Zamýšľané správanie |
|---|---|
| Zamerať výber | Priblížiť označené objekty s okrajom, nemení výber. Bez výberu bezpečne nevykonať akciu a vysvetliť dôvod. |
| Zhora / Spredu / Zľava | Zamerať výber, nie celý model. Najprv štandardné osi modelu; lokálne osi skrinky až po overení. Rovnobežné premietanie pre technické pohľady je návrh na potvrdenie. |
| Predošlý pohľad | Vrátiť kameru, nie spustiť Undo úprav modelu. |
| Izolovať / Obnoviť | Dočasná izolácia s viditeľným stavom; zachovať veci schované už pred izoláciou. |
| Tagy | Stránka pripnutých tagov a ich skutočného stavu, nie celý miniatúrny správca tagov. |
| Skryté objekty | Prepínať ich zobrazenie. Oddelené od skrytej geometrie, tagov a trvalého odkrytia. |

## Etapa AI‑1 — režim AI (schválené 17. 9. 2026)

Tretí režim popri Station a SKP; spúšťa sa pri aktívnom okne Claude alebo Codex. Bočný pás ako v SKP (čas, usage v strede, malý prehrávač), karta „Agenti“ so živým stavom relácií Claude Code a Codexu (pracuje / čaká na teba / hotovo / nečinný), štítok a LED upozornenie naprieč režimami, mini logá. Celá špecifikácia, zdroje dát a kontrakt: [AI-REZIM.md](AI-REZIM.md). **AI‑2 (detail karty potiahnutím) hotové 18. 9. 2026.** AI‑3 (klepnutie prenesie okno aplikácie Claude/Codex dopredu; konkrétnu reláciu v záložke bezpečne vybrať nevieme) **odložené** rozhodnutím Michala 18. 9. 2026.

## Etapa H2 — hudba, 2. kolo (H2‑1 až H2‑3 **hotové 18. 9. 2026**; H2‑4 odložené; H2‑5 čaká na Michala)

Stav dnes: hudobný modul (C# `media-worker`) hlási názov, interpreta, zdroj, stav, obrázok a hlasitosť PC; ovláda play/pauza/ďalšia/predošlá a hlasitosť. **Nehlási pozíciu ani dĺžku skladby** a nevie posúvať v skladbe. Windows to cez Media Session poskytuje (pozícia, začiatok, koniec, čas poslednej aktualizácie, posun `TryChangePlaybackPosition`), ale len ak to prehrávač hlási: YouTube v Chrome áno, niektoré weby nie, živé streamy nemajú dĺžku.

| Blok | Čo sa zmení z pohľadu používateľa | Technicky | Náročnosť |
|---|---|---|---|
| **H2‑1 Priebeh skladby** | Tenký prúžok priebehu pod názvom skladby v Station (aj vo väčšom prehrávači pri Chrome) a tenká linka v páse SKP/AI; vľavo uplynutý čas, vpravo dĺžka (len v Station). Pri chýbajúcej dĺžke sa prúžok nezobrazí. Plynulý pohyb aj medzi hláseniami. | worker: `GetTimelineProperties()` každú 1 s pri prehrávaní (pozícia, dĺžka, čas hlásenia, rýchlosť); služba: rozšírený `MediaState` (`position`, `duration`, `positionAt`, `rate`); PWA: lokálna interpolácia z `positionAt`. | malá |
| **H2‑2 Posun v skladbe** | Ťah po prúžku posunie skladbu; počas ťahu bublina s cieľovým časom, posun sa odošle až po pustení (jeden povel). Prúžok je pri dolnom okraji karty, hlasitosť ostáva na hornom okraji, gestá sa nebijú. | worker: povel `seek <ms>` → `TryChangePlaybackPositionAsync`; služba `media.seek`; PWA `ProgressBar` s ťahom (ako `VolumeStrip`, ale bez odosielania počas ťahu). | malá–stredná |
| **H2‑3 Gestá na obale** | V Station: ťah doľava na obrázku skladby = ďalšia, doprava = predošlá, klepnutie = play/pauza; tlačidlá ostávajú. Krátky vizuálny ohlas (obal sa mierne posunie v smere ťahu) + LED klepnutie. | PWA: zdieľaná detekcia ťahu (`swipe.ts`), oblasť obalu bez horného pásu hlasitosti a dolného prúžku. | malá |
| **H2‑4 Voliteľné: náhodné poradie a opakovanie** | Dva malé prepínače pri tlačidlách (len ak prehrávač hlási, že ich podporuje). | worker: `IsShuffleActive`, `AutoRepeatMode`, `TryChangeShuffle/AutoRepeat`; veľa prehrávačov ignoruje. | malá, nízka priorita |
| **H2‑5 Equalizer (schválené 19. 9. 2026, mock `mock6.html`, tvar A)** | V Station za textom prehrávača, nad obrázkom a tmavým prechodom, od prúžku smerom hore: mäkké stĺpce „polárna žiara“ (biele jadro, antracitový tieň, v strede vyššie), sila ~50 %, rozmazanie ~7 px, bez ostrých hrán. Reaguje na skutočnú úroveň zvuku PC (špička výstupu z Windows, ~20× za s), v tichu klesá na plochú žiaru, pri pauze zmizne. Neskôr aj v ambient režime. | worker: `IAudioMeterInformation.GetPeakValue` na predvolenom výstupe; služba: správa `audio` (level 0–1) len počas prehrávania; PWA: canvas v hudobnej karte, len keď je Station viditeľný. | malá–stredná |
| **H2‑6 Celá obrazovka dvojklikom (schválené 19. 9. 2026)** | Dvojité klepnutie na horný pás prepne celú obrazovku v Chrome (skryje adresný riadok), ďalšie vypne; funguje v každom režime. Voľba v nastaveniach ostáva. | PWA: dvojklik na `.bar`, Fullscreen API, bez kolízie s ťahom po páse. | malá |
| H2‑7 UI/UX drobnosti Michala | *(doplní Michal)* | | |

Poradie: H2‑1 → H2‑2 → H2‑3 (H2‑4 len ak ostane chuť). Jeden worktree `feat/music-2`, blok A (worker + služba) a blok B (PWA) paralelne ako pri AI‑1, kontrakt `MediaState` dohodnutý vopred. Test na PC s YouTube v Chrome (hlási pozíciu) a s webom bez pozície (prúžok skrytý). Zamietnuté ostáva: obrázok skladby ako pozadie celého Station (nízke rozlíšenie obrázkov).

## Backlog — až po základnom teste

### Automatické režimy — implementované v E4 (15. 9. 2026)

Pôvodne mimo V1; Michal ich vyžiadal po E3. Popis nižšie zostáva ako špecifikácia správania.

Tri nastavenia: a) AUTO, b) Station napevno, c) SKP napevno.

V AUTO rozhoduje aktívna aplikácia, nie iba bežiaci proces. Pri štarte načítať skutočný stav; aktívny SketchUp + pripravený prijímač → SKP, Chrome/iná aplikácia → Station. Vlastný widget a príslušné SketchUp dialógy nesmú vyvolať nechcené prepnutie. Krátke oneskorenie proti preblikávaniu, neprepínať počas dotyku/gesta. Pri strate spojenia indikovať nedostupnosť; automatický režim sa vráti do Station, ručne uzamknutý SKP môže zostať so zneaktívnenými príkazmi.

### Adaptívny obsah podľa aplikácie a výberu — nový námet, mimo V1

Zachovať dva hlavné režimy Station a SKP. Rozšírený prehrávač je variant Station, nie tretí základný režim. Stavy prázdneho/jedného/viacerých výberov sú podstavy SKP.

| Kontext | Používateľov nápad / návrh správania |
|---|---|
| Aktívny Chrome | Station s väčším prehrávačom, väčšími tlačidlami skladieb a pohodlnejšou hlasitosťou. Voliteľné pravidlo, nie povinnosť pri každom prehliadaní. |
| SketchUp: jeden objekt | Pohľady na konkrétny objekt; neskôr relatívny swipe/orbit kamery okolo neho. |
| SketchUp: viac objektov | Kontext viacnásobného výberu. Návrh: zamerať/izolovať celý výber; prípadný orbit okolo spoločného stredu až po samostatnom overení. |
| SketchUp: nič vybrané | Tri naposledy vybrané objekty; dotyk na kartu objekt vyberie a priblíži. |
| Vlastný panel alebo prechodné systémové okno | Zachovať posledný platný pracovný kontext, nevyvolať slučku prepínania. |
| SketchUp nedostupný alebo zastarané dáta | Výslovne nedostupný stav; neinterpretovať ako prázdny výber. |

Navrhované rozdelenie zodpovednosti: aktívnu aplikáciu sleduje lokálna Windows časť nezávislá od bežiaceho SketchUpu, výber a editačný kontext hlási Ruby prijímač. Rainmeter zobrazuje výsledný stav. Nejde o čítanie obrazovky ani potrebu volaní AI.

**Ergonómia:** pevný informačný pás a stále pozície základných príkazov; meniť len vyhradenú kontextovú oblasť. Počas stlačenia/ťahania nemeniť význam ovládacieho prvku. Pri vyvolaní objektu z histórie aplikovať nový layout až po dokončení dotyku. Explicitný ručný režim má prednosť pred automatikou.

**Chrome nie je hudobný zdroj:** identifikácia aktívnej aplikácie nehovorí, ktorá karta/prehrávač prehráva zvuk. Veľkosť UI možno viazať na Chrome, ale zdroj metadát, play/pause a hlasitosti treba overiť osobitne. Hlasitosť PC verzus konkrétny prehrávač zostáva rozhodnutie na test.

### Tri posledné objekty — návrh malého experimentu po základe

Používateľ požaduje pri prázdnom výbere návrat k trom naposledy vybraným objektom jedným dotykom: označiť a priblížiť.

Navrhované zúženie prvého experimentu, ešte na potvrdenie:

- Najviac tri rôzne skupiny/komponentové inštancie z aktuálneho modelu a relácie; začať v tom istom editačnom kontexte. Nekopírovať geometriu a nezakladať scény.
- Jednoduchá karta: názov a typ/rozlišovací údaj. Obrázkové náhľady a perzistencia medzi spusteniami nie sú podmienkou.
- Históriu zostavovať zo zaznamenaných udalostí. Pri hromadnom výbere nevymýšľať poradie kliknutí; v prvom experimente možno históriu aktualizovať iba pri výbere jedného podporovaného objektu. Skupiny výberov sú neskoršie rozhodnutie.
- Prevnorené objekty nespoliehať sa iba na meno/definíciu. Potrebná identita modelu/relácie a konkrétnej inštancie vrátane cesty vnorenia. Prechod do iného editačného kontextu je samostatné rozšírenie, nie tichý vedľajší účinok kliknutia.
- Pred vyvolaním overiť platnosť cieľa, viditeľnosť a kontext. Zmazaný alebo prestavaný objekt bezpečne zneaktívniť/odstrániť z histórie; nevyberať náhradu podľa podobného mena. Neodhaľovať automaticky objekty na vypnutom tagu.
- Výber cez históriu nesmie generovať duplicitné karty ani spätnú slučku. Počet zmien kamery nemá meniť poradie histórie.

### Pohľady jedným tlačidlom so swipe — mimo V1

Nápad Michala (15. 9. 2026, po teste E2): namiesto samostatných dlaždíc Zhora / Spredu / Zľava jedna dlaždica „Pohľad“. Dotyk a potiahnutie hore = zhora, doľava = zľava, doprava = sprava, dole = spredu; krátke klepnutie = zamerať výber (alebo predošlý pohľad, na rozhodnutie). Uvoľní tri miesta v mriežke pre E3 a ďalšie. Otvorené: ako naznačiť smery na dlaždici, čo s „predošlým pohľadom“ a „celým modelom“, ochrana proti náhodnému potiahnutiu. Implementovať až po E3, keď budú známe všetky príkazy, ktoré sa do mriežky majú zmestiť.

### Gestá — mimo V1

Hlasitosť cez jasne označený posuvník (PC vs. prehrávač treba vybrať). Orbit kamery cez vyhradený relatívny pás: potiahnutie otáča kameru okolo výberu, nie samotný objekt. Začať zvislou osou, bez zotrvačnosti a bez skoku pri prvom dotyku; presné kroky ±15°/±45°/90° sú návrhy, nie finálna zostava.

Nehromadiť staré povely; po pustení prsta pohyb zastaviť. Viacprstové gestá a dlhé podržanie až po overení kolízií so spacedesk. Swipe medzi stránkami môže dopĺňať viditeľné záložky, nie byť jediná navigácia. Pri zmene výberu počas gesta ho bezpečne ukončiť, nie prepnúť cieľ uprostred pohybu.

### Ďalšie zachytené nápady

| Oblasť | Nápady |
|---|---|
| Kamera a kontrola | ISO/perspektíva, X-Ray, dočasné pohľady A/B, skrytie okolia pri editácii skupiny. |
| Engine kontext | Názov, rozmery a materiál výberu zo skutočných dát Engine; otočenie textúry o 90°, zobrazenie/ovládanie ABS. Nie celý Inspector. |
| Dogfooding | Uložiť snímku viewportu s názvom modelu a časom. Snímka viewportu nezachytí UI Inspectora. |
| Prispôsobenie | Veľkosť, farby a priehľadnosť, detail usage/resetov po dotyku, neskôr integrácia nastavení JaxCore. |
| Spätná väzba LED (hotové 15. 9. 2026) | Zadné LED telefónu cez nepočuteľný 45 Hz „beat“ prehraný ako médium (jediná cesta, ktorá Rhythm Lights spustí). 400 ms pri klepnutí, 800 ms dvojpulz pri chybe, prepínač v páse. Neskôr: dlhší pulz pri dokončení dlhých akcií, rozlíšenie režimov. |
| Prevádzka | Lišta Windows iba na vybraných monitoroch; obnova polohy pri odpojení mobilu. |
| Režim AI (po AI‑1) | Detail karty potiahnutím (model, effort, tokeny, ťahy, trvanie, nástroje); klepnutie = okno relácie dopredu na PC; predpoveď usage (tempo, kedy dôjde týždeň, odporúčanie Claude/Codex); dnešná práca po projektoch; rozlíšenie „hotovo“ vs. „čaká na otázku“. Zdroj oficiálnych log: logo.dev (aplikácia je súkromná), zatiaľ vlastné ikony. |
| Aktivita agentov na kruhoch usage (**hotové 18. 9. 2026**, mock `mock5.html`) | Mimo režimu AI ukazujú kruhy usage (Station veľké, SKP/AI mini) aktivitu daného providera obiehajúcimi bodmi: vždy 2–3 body, vznikajú na hornej hrane z veľkosti 0, po obehu sa hore zmenšia a zmiznú, mierne pulzujú a menia veľkosť, každý má inú rýchlosť. Pracuje = pomalé obiehanie, každý bod drží svoju rýchlosť. Čaká na vstup = body občas plynulo menia smer a rýchlosť (zámerne „chaotické“, nie cirkus) + jemná fialová žiara kruhu. Hotovo = zelené body dobehnú a už sa neobnovia. Pri „obmedziť pohyb“ body stoja, mení sa len farba. Malá etapa, JS animácia len cez transform. |
| Blokovanie SKP pri neaktívnom SketchUpe (**hotové 18. 9. 2026**) | V ručne uzamknutom SKP: ak sledovanie okna beží a hlási inú aplikáciu než SketchUp, dlaždice zošednú s hláškou „SketchUp nie je aktívne okno“; po kliknutí do SketchUpu sa hneď odomknú. Blokovať len pri preukázateľne bežiacom sledovaní okna (pri výpadku fg‑workera neblokovať). V AUTO režime bez zmeny. Malá etapa. |
| Ambientný režim (odložené 17. 9.) | Po 5 min bez dotyku stmavnúť, ostanú hodiny a kruhy. |
| Hudba, 2. kolo | Rozpracované ako etapa H2 vyššie. |

Neplánovať zatiaľ editor ľubovoľných makier, druhý zber usage, presné formuláre rozmerov ani gestá upravujúce geometriu. Funkcie pridávať podľa reálnej potreby.

## Overené stavebné prvky — nie výsledky testov N-portal

Primárne podklady skontrolované 15. 9. 2026; research existujúcich pluginov a lokálneho prostredia ešte neprebehol.

- [Windows GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow) a [GetWindowThreadProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowthreadprocessid): identifikácia okna v popredí a jeho procesu. Voľbu hotového modulu alebo vlastného malého prijímača rozhodne research.
- [SketchUp SelectionObserver](https://ruby.sketchup.com/Sketchup/SelectionObserver.html): udalosti zmeny výberu. `onSelectionBulkChange` nepokrýva vyčistenie klikom do prázdna; treba aj `onSelectionCleared`. Samotné `onSelectionAdded`/`onSelectionRemoved` nie sú dostatočný základ.
- [SketchUp Selection](https://ruby.sketchup.com/Sketchup/Selection.html): počet, obsah, vyprázdnenie a pridanie do výberu. Poradie položiek nie je poradím používateľových kliknutí.
- [SketchUp InstancePath](https://ruby.sketchup.com/Sketchup/InstancePath.html) a [Model](https://ruby.sketchup.com/Sketchup/Model.html): cesta konkrétnou hierarchiou, `persistent_id_path`, vyhľadanie a editačný kontext. Pri testoch používať iba metódy dostupné v skutočne nainštalovanej verzii.
