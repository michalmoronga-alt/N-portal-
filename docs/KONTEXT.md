# Kontext a zadanie

Zápis úvodnej diskusie, 15. 9. 2026, priebežne dopĺňaný. **Aktuálny stav:** V1 je postavená a používaná (E0–E6 + vizuálny rework, pozri [POSTUP.md](POSTUP.md)). Tento dokument zachytáva pôvodné zadanie, prvé testy a pravidlá, ktoré stále platia; časti o Rainmeteri sú historické.

## Východisko z praktického testu

Používateľ má dva hlavné monitory a starší mobil naležato ako tretí dotykový monitor cez spacedesk. Mobil je pri klávesnici, takže naň dosiahne rýchlo. Na ňom už používa hodiny, NOXUN AI Usage a hudobný widget JaxCore. Pripojenie a dotyk prakticky fungujú.

Prvé problémy: príliš malý widget pri vysokom rozlíšení a Windows panel úloh na mobile. Veľkosť zobrazenia sa už riešila; skrytie lišty iba na mobile zostáva otvorenou úlohou. Model telefónu (IIIF150 Air1), rozlíšenie (1100 × 530) a verzie aplikácií sú zapísané v [POSTUP.md](POSTUP.md), tabuľka Prostredie. Mierka spacedesku ešte nie je zapísaná.

Touch Portal bol odskúšaný; bezplatná verzia používateľovi nestačila. Ďalší generický makropanel nie je cieľom.

## Požadované správanie

| Oblasť | Zadanie |
|---|---|
| Station | Veľký čas, dátum, usage a hudba: prehrávanie/pauza, skladby; neskôr hlasitosť. |
| SKP | Rýchle príkazy na dotyk, zmenšený Station zostáva na okraji. |
| Usage | Hlavné kruhy = spotrebované percentá týždenného limitu. Codex bez 5h kruhu podľa používateľovho účtu; Claude weekly + vnútorný 5h prstenec. Len Codex a Claude. |
| Dáta | Znovu použiť existujúci zber usage. Nezakladať druhý zberač, neprenášať prístupové tokeny do mobilu. |
| Rozhranie | Jedno viditeľné rozhranie, veľké dotykové plochy, stále pozície, ikona + krátky názov, jasný aktívny/neaktívny/nedostupný stav. |
| Postup | Malé samostatne overiteľné etapy, najprv funkčnosť, potom vzhľad a rozširovanie. |

Vysoké rozlíšenie je výhoda pre ostrosť, nie dôvod na malé tlačidlá. Východiskový návrh je približne 8–12 tlačidiel a bočný informačný pás 15–20 % šírky; fyzické rozmery sa ešte otestujú. B a C sú preferované vizuálne smery, nie schválený finálny layout.

## Vývoj technického návrhu

Pôvodný nápad: presunúť SketchUp `HtmlDialog` na mobil a vedľa neho ponechať Rainmeter/JaxCore.

Druhý nápad (dopoludnia 15. 9.): celé UI v jednom Rainmeter skine na spacedesk monitore. Test D0 ukázal, že dotyk presúva kurzor a fokus, preto bol tento smer opustený.

**Platný smer (15. 9. 2026 večer, [SMER.md](SMER.md)):** PWA na mobile ako samostatnom zariadení + lokálna služba na PC. Rainmeter, JaxCore a spacedesk nie sú pre panel potrebné; usage dáta sa ďalej čítajú zo súboru existujúceho skinu.

Cesta povelu:

```text
Dotyk v PWA na mobile → Wi‑Fi/USB → Node služba na PC (WebSocket, token)
                                         ↕ súbory v %USERPROFILE%\.n-portal\e0
                                    Ruby prijímač v SketchUpe
                                         ↕
                              API SketchUpu / existujúce akcie Engine
```

Ruby prijímač by vykonával konkrétne povolené príkazy a vracal výsledok/stav. Skrytý HTML panel sa neplánuje: widget nemá klikať na neviditeľné tlačidlá ani simulovať klikanie na súradnice obrazovky.

Prepojenie je pre E0 vytvorené a otestované na PC (POSTUP.md). Súborová fronta povelov a stavový súbor stačia pre tlačidlá; plynulé gestá budú neskôr potrebovať priame TCP/WebSocket spojenie z Ruby (rovnako ako to robí VBO SkAgent).

Základné ovládanie výberu a kamery má zostať nezávislé od Engine. Materiály, ABS a ďalšie Engine funkcie majú neskôr volať jeho existujúcu logiku, nie jej druhú implementáciu. Možnosti opätovného použitia usage a hudobného widgetu treba pred zásahom načítať z ich skutočného kódu.

## Dôležité pravidlá a riziká

| Téma | Pravidlo / čo overiť |
|---|---|
| Fokus a kurzor | Po dotyku musí byť možné pokračovať v modeli. **D0 (15. 9. 2026) ukázal, že dotyk na Rainmeter skin presunie kurzor na mobil a klávesnicový fokus na okno skinu.** E0 preto musí kurzor aj fokus aktívne vrátiť do SketchUpu; návrat fokusu a návrat kurzora zostávajú dva samostatné testy. |
| Cieľ povelu | E0 ovláda jednu jednoznačne pripojenú reláciu/model. Pri nejasnosti alebo odpojení ovládanie zneaktívniť, nie hádať cieľ. |
| Spätný stav | Rozlišovať odoslaný povel, úspech, chybu a nedostupnosť. Zmeny urobené priamo v SketchUpe nesmú zostať na widgete neaktuálne. |
| Staré povely | Po opätovnom spojení nevykonať oneskorené požiadavky; povely identifikovať, časovo obmedziť a chrániť pred neúmyselným opakovaním. |
| Bezpečnosť | Lokálne spojenie a zoznam povolených akcií. Žiadne vykonávanie ľubovoľného Ruby alebo shell textu z widgetu. |
| Izolovanie | Obnoviť iba zmeny dočasnej izolácie, nie odkryť všetko. Rozsah aktuálneho editačného kontextu sa musí stanoviť pred realizáciou. |
| Pohľady | Rozlíšiť osi modelu a orientáciu vybratej skrinky. „Spredu“ nesmie bez upozornenia meniť význam. |
| Viditeľnosť | Samostatne skryté objekty, skrytá geometria a vypnuté tagy. „Zobraziť skryté“ nie je „odkryť všetko“. |
| Prevádzka | Station funguje aj bez SketchUpu. Po odpojení mobilu musí byť možné panel dostať na hlavný monitor. |

Rozsah repo zostáva dokumentačný. Inštalácie, zmeny systémového nastavenia, zásahy do pôvodných widgetov a Engine nie sú týmto zápisom schválené.
