# Postup a aktuálny stav

**Aktuálne:** dokumentácia pripravená; vlastný panel ani prepojenie neexistujú. **Najprv research hotových možností a malé diagnostické testy, potom E0. Nič z toho zatiaľ nie je spustené.**

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
| **D0 — dotyk a kurzor** | Dotyk na existujúci widget, následne pohyb fyzickej myši a klávesnica. Zopakovať na budúcom skúšobnom skine, keď bude pripravený. | Poloha a správanie kurzora pred/po dotyku a pri ďalšom pohybe; kam smeruje klávesnica. | Neotestované |
| **D1 — okná** | Prechody SketchUp ↔ Chrome ↔ vlastný panel, príslušné dialógy, minimalizácia, rýchle Alt+Tab. | Záznam času, okna/procesu a vyhodnoteného kontextu; vlastný panel zachová pracovný kontext. | Neotestované |
| **D2 — výber** | 0 → 1 → viac → 0; výber obdĺžnikom, klik do prázdna; skupina/komponent aj hrana/plocha. | Počet, typ, identita modelu a editačný kontext. Vyčistenie výberu nesmie zostať nezachytené. | Neotestované |
| **D2 — životný cyklus** | Zmena editačnej úrovne, otvorenie/zatvorenie modelu, viac relácií, prerušenie zdroja dát. | Žiadni zdvojení observeri ani zamieňanie nedostupnosti za prázdny výber. | Neotestované |

Používateľov predbežný dojem je, že kurzor zostáva na pôvodnom mieste. **Zatiaľ hypotéza, nie potvrdený problém ani potvrdené splnenie testu.** Ak ju test potvrdí, automatické vracanie kurzora netreba pridávať preventívne. Klávesnicový fokus sa overí samostatne.

Rozsah D1/D2 držať minimálny: len potrebné signály. Implementácia adaptívneho rozloženia, histórie troch objektov ani swipe orbitu nie je podmienkou E0 a zostáva v neskoršom backlogu.

## Rozdelenie testov

| Kto | Čo môže dostať na starosť |
|---|---|
| **Agent — research a logika** | Načítať skutočné zdroje; porovnať reuse; pripraviť minimálne sondy, protokol a testy pravidiel na simulovaných udalostiach. Neskôr otestovať deduplikáciu histórie, zastarané dáta a chybové stavy. |
| **Lokálny agent s udeleným prístupom k Windows/SketchUpu** | Po samostatnom schválení spustiť diagnostiku/integráciu na testovacom modeli a zozbierať reálne logy. Bez dostupného runtime túto časť označiť ako neotestovanú. |
| **Michal — reálny mobil a pracovný postup** | Dotyk, kurzor, klávesnica po dotyku, trafiteľnosť, oneskorenie a nežiaduce prepínanie pri skutočnej práci. Potvrdiť, či ovládanie reálne pomáha. |

Simulácia nie je test spacedesk; test na PC bez mobilu nie je potvrdenie dotykovej ergonómie. Netreba, aby agent a Michal oba opakovali všetky skúšky — zdieľať konkrétne logy a výsledky.

## Pred testom E0

- [ ] Zapísať verziu Windows, SketchUpu, Rainmetera/JaxCore a spacedesk; model telefónu, pripojenie, rozlíšenie a mierku.
- [ ] Dokončiť krátky R0 a vyhodnotiť minimum D0/D1/D2; neimplementovať pri tom budúce adaptívne funkcie.
- [ ] Načítať skutočné nastavenie/widgetové zdroje, ktoré budú potrebné; nekopírovať prístupy k účtom.
- [ ] Použiť samostatný testovací skin a kópiu/testovací SketchUp model. Existujúci Station a produkčný Engine nemeníme.
- [ ] Dohodnúť minimum prepojenia, jednoznačný cieľ a spôsob vypnutia/odstránenia experimentu.

## Kontrolný zoznam E0

| Skúška | Očakávanie | Stav |
|---|---|---|
| Vybrať skrinku → dotyk „Zamerať výber“ | Zameria správny výber v správnom modeli; widget dostane výsledok. | Neotestované |
| Bez výberu | Žiadny neočakávaný zoom/úprava; zrozumiteľná odpoveď. | Neotestované |
| Viac označených objektov | Zameria celý výber a zachová ho. | Neotestované |
| Opakované/rýchle dotyky | Predvídateľné správanie bez oneskorených prekvapení. | Neotestované |
| Dotyk → kláves M → pokračovať v modeli | Zistiť potrebu dodatočného kliku a správanie fokusu; neoznačiť za splnené bez reálneho testu. | Neotestované |
| Pokračovanie myšou | Zapísať polohu kurzora a či ho treba ťahať späť z mobilu. | Neotestované |
| SketchUp nepripravený/zatvorený | Nedostupný stav, žiadne kliky do inej aplikácie. | Neotestované |
| Viac relácií alebo zmena modelu | Jednoznačný cieľ, inak bezpečné odmietnutie. | Neotestované |
| Prerušenie a obnovenie spojenia | Žiadne vykonanie starých povelov. | Neotestované |
| Ukončenie testu | Možnosť odstrániť skúšobný skin/prijímač, pôvodné prostredie funguje. | Neotestované |

**Brána E0:** pokračovať až po praktickom vyhodnotení prenosu, fokusu a kurzora. Ak niečo narúša modelovanie, najprv upraviť riešenie alebo zvoliť záložnú cestu; nerozširovať počet tlačidiel.

## Záznamy

| Dátum | Čo je skutočne známe | Ďalší krok |
|---|---|---|
| 15. 9. 2026 | Používateľ potvrdil fungujúci spacedesk a dotyk. Zapísaný kontext, etapy a návrhy A/B/C; B a C sú preferované. Vlastné ovládanie SketchUpu sa netestovalo. | Po návrate používateľa začať dohodnutým researchom a diagnostikou. |
| 15. 9. 2026 — doplnenie | Zapísané: väčší prehrávač pri Chrome, podstavy SKP podľa výberu, tri posledné objekty, research pred vývojom a rozdelenie testov agent/Michal. Overená existencia základných API, nie lokálna integrácia. | R0 → minimálne D0/D1/D2 → potvrdenie E0. |

Po každom teste doplniť dátum, prostredie/verzie, rozsah, kto a kde test vykonal, pozorovaný výsledok, chyby a rozhodnutie. Nevyplňovať úspechy odhadom. Do verejného repozitára nedávať tokeny, obsah webových stránok, súkromné názvy zákaziek ani plné produkčné logy.
