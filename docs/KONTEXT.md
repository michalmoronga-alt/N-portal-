# Kontext a zadanie

Zápis úvodnej diskusie, 15. 9. 2026. Projekt zatiaľ slúži na dokumentáciu, nie na nasadenie.

## Východisko z praktického testu

Používateľ má dva hlavné monitory a starší mobil naležato ako tretí dotykový monitor cez spacedesk. Mobil je pri klávesnici, takže naň dosiahne rýchlo. Na ňom už používa hodiny, NOXUN AI Usage a hudobný widget JaxCore. Pripojenie a dotyk prakticky fungujú.

Prvé problémy: príliš malý widget pri vysokom rozlíšení a Windows panel úloh na mobile. Veľkosť zobrazenia sa už riešila; skrytie lišty iba na mobile zostáva otvorenou úlohou. Presný model telefónu, aktuálne rozlíšenie, mierku a verzie aplikácií zapísať pred E0. Nespoliehať sa na staršie odhady.

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

Nový preferovaný smer: celé UI v jednom Rainmeter skine. JaxCore je možné neskoršie začlenenie, nie povinná závislosť celého projektu. Widget má mať oddelené vnútorné časti pre usage, čas, hudbu, režimy a SKP; jedna obrazovka neznamená jeden monolitický súbor.

Navrhovaná cesta povelu:

```text
Dotyk na mobile → spacedesk → Rainmeter
                              ↕ lokálne prepojenie na PC
                         Ruby prijímač v SketchUpe
                              ↕
                   API SketchUpu / existujúce akcie Engine
```

Ruby prijímač by vykonával konkrétne povolené príkazy a vracal výsledok/stav. Skrytý HTML panel sa neplánuje: widget nemá klikať na neviditeľné tlačidlá ani simulovať klikanie na súradnice obrazovky.

**Toto prepojenie ešte nebolo vytvorené ani odskúšané.** Lokálna fronta povelov a stavový súbor sú kandidát pre E0, nie uzavretá voľba protokolu. Plynulé gestá môžu neskôr potrebovať iný spôsob prenosu. HTML variant zostáva záložná cesta, ak praktický test jednotného widgetu nevyjde.

Základné ovládanie výberu a kamery má zostať nezávislé od Engine. Materiály, ABS a ďalšie Engine funkcie majú neskôr volať jeho existujúcu logiku, nie jej druhú implementáciu. Možnosti opätovného použitia usage a hudobného widgetu treba pred zásahom načítať z ich skutočného kódu.

## Dôležité pravidlá a riziká

| Téma | Pravidlo / čo overiť |
|---|---|
| Fokus a kurzor | Po dotyku musí byť možné pokračovať v modeli. Návrat klávesnicového fokusu a poloha kurzora sú dva samostatné testy; správanie v tejto zostave zatiaľ nepoznáme. |
| Cieľ povelu | E0 ovláda jednu jednoznačne pripojenú reláciu/model. Pri nejasnosti alebo odpojení ovládanie zneaktívniť, nie hádať cieľ. |
| Spätný stav | Rozlišovať odoslaný povel, úspech, chybu a nedostupnosť. Zmeny urobené priamo v SketchUpe nesmú zostať na widgete neaktuálne. |
| Staré povely | Po opätovnom spojení nevykonať oneskorené požiadavky; povely identifikovať, časovo obmedziť a chrániť pred neúmyselným opakovaním. |
| Bezpečnosť | Lokálne spojenie a zoznam povolených akcií. Žiadne vykonávanie ľubovoľného Ruby alebo shell textu z widgetu. |
| Izolovanie | Obnoviť iba zmeny dočasnej izolácie, nie odkryť všetko. Rozsah aktuálneho editačného kontextu sa musí stanoviť pred realizáciou. |
| Pohľady | Rozlíšiť osi modelu a orientáciu vybratej skrinky. „Spredu“ nesmie bez upozornenia meniť význam. |
| Viditeľnosť | Samostatne skryté objekty, skrytá geometria a vypnuté tagy. „Zobraziť skryté“ nie je „odkryť všetko“. |
| Prevádzka | Station funguje aj bez SketchUpu. Po odpojení mobilu musí byť možné panel dostať na hlavný monitor. |

Rozsah repo zostáva dokumentačný. Inštalácie, zmeny systémového nastavenia, zásahy do pôvodných widgetov a Engine nie sú týmto zápisom schválené.
