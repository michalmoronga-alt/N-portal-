# Postup a aktuálny stav

**Aktuálne:** dokumentácia pripravená; vlastný panel ani prepojenie neexistujú. **Nasleduje E0, zatiaľ nespustené.**

## Pravidlo práce

Vždy jedna malá etapa: potvrdiť rozsah → načítať potrebné zdroje → navrhnúť minimum → vykonať až po zadaní → prakticky otestovať → zapísať výsledok. Až potom rozhodnúť o ďalšej etape. Nevydávať plánované funkcie za hotové.

## Pred testom E0

- [ ] Zapísať verziu Windows, SketchUpu, Rainmetera/JaxCore a spacedesk; model telefónu, pripojenie, rozlíšenie a mierku.
- [ ] Zistiť, či dotyk na existujúcom hudobnom widgete presunie kurzor na mobil a kam potom smeruje klávesnica.
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
| 15. 9. 2026 | Používateľ potvrdil fungujúci spacedesk a dotyk. Zapísaný kontext, etapy a návrhy A/B/C; B a C sú preferované. Vlastné ovládanie SketchUpu sa netestovalo. | Po návrate používateľa potvrdiť E0. |

Po každom teste doplniť dátum, prostredie/verzie, rozsah, pozorovaný výsledok, chyby a rozhodnutie. Nevyplňovať úspechy odhadom.
