# Návrh UI/UX reworku (E1b)

Návrh agenta z 15. 9. 2026 a rozhodnutia Michala (kap. 6). **1. kolo reworku je implementované v paneli** (commit „feat(E1b)“); kapitoly 1–5 ostávajú ako zásady a zásobník nápadov. Mocky: `app/public/mock2.html` (prvý návrh, 3 varianty prechodu) a `mock3.html` (podľa rozhodnutí: sklo, obrázok, slide, zúžený Station).

## 1. Zásady, ktoré by som držal

| Zásada | Prečo |
|---|---|
| **Pohyb má význam.** Každá animácia hovorí, čo sa stalo alebo kam sa niečo presunulo. Žiadne ozdoby bez informácie. | Panel je pracovný nástroj, ktorý sleduješ kútikom oka. Pohyb bez významu rozptyľuje. |
| **Stále pozície.** Dlaždice, pás, prepínač režimov nemenia miesto. Mení sa obsah a stav, nie rozloženie. | Trafiteľnosť bez pozerania. Platí už dnes, rework to nesmie rozbiť. |
| **Rýchle krátke, pomalé dlhé.** Reakcia na dotyk do 100 ms, prechod obrazovky 300–400 ms, dlhšie len pri zmene kontextu. | Panel nesmie pôsobiť lenivo; starší telefón musí stíhať. |
| **Jedna animačná krivka.** `cubic-bezier(.2,.8,.2,1)` (rýchly nábeh, mäkké dobehnutie) všade, kde sa niečo presúva. | Súdržný pocit, aj keď sú animácie z rôznych častí. |
| **Rešpektovať „obmedziť pohyb“.** Prepínač v nastaveniach panela; pri zapnutí len prelínanie. | Keď budeš unavený alebo telefón pomalý. |

## 2. Hlavný prechod Station ↔ SKP

Toto je srdce reworku. Tri varianty sú v mocku, odporúčam **Morph**.

| Variant | Ako vyzerá | Plus | Mínus |
|---|---|---|---|
| **A. Slide** | Obrazovky sa posunú vodorovne (Station vľavo, SKP vpravo), s jemným paralaxom. | Jednoduché, zrozumiteľné, lacné na výkon. | Nehovorí, že bočný pás v SKP je „zmenšený Station“. |
| **B. Morph (odporúčam)** | Karta hodín sa zmenší a odletí na miesto v bočnom páse, kruhy usage tiež, hudobná karta sa zbalí na tri ikony. Dlaždice prichádzajú sprava s odstupňovaním 30 ms. Späť to isté opačne. | Vysvetľuje vzťah medzi režimami: SKP = Station stlačený nabok. Vyzerá prémiovo, presne v duchu návrhu C. | Náročnejšie na implementáciu (FLIP animácia), treba testovať výkon na IIIF150. |
| **C. Fade + scale** | Stará obrazovka sa zmenší na 96 % a zmizne, nová sa vynorí z 104 %. | Pokojné, funguje aj pri „obmedziť pohyb“. | Najmenej informatívne. |

Časy: 380 ms hlavný pohyb, dlaždice 30 ms odstup, celkovo do 600 ms. Pri AUTO prepnutí rovnaký prechod, plus krátky štítok „AUTO → SKP“ v páse na 1,2 s.

## 3. Nápady na drobné funkcie (v poradí, ako by som ich robil)

| # | Funkcia | Popis | Odhad |
|---|---|---|---|
| 1 | **Haptika** | Krátka vibrácia 12 ms pri klepnutí na dlaždicu, 2 × 40 ms pri chybe. Android Chrome to vie bez povolení, funguje okamžite (na rozdiel od LED, ktoré majú 0,5 s oneskorenie). LED ostáva ako „druhá vrstva“. | malý |
| 2 | **Detail usage potiahnutím** | Ťah hore na karte usage (alebo klepnutie na kruh) vysunie panel: týždenné %, presný dátum a čas resetu, 5h okno % a reset, stav účtu (napr. „rate limit“ ako varovanie), vek dát. Ťah dole zavrie. | malý |
| 3 | **Odpočet do resetu** | Pod dátumom v Station: „Claude 5h reset o 1 h 12 min“. Vidíš bez klepnutia, kedy sa uvoľní. | malý |
| 4 | **Toasty namiesto stavového riadku** | Výsledok povelu ako krátka bublina zdola (ikona + text), sama zmizne. Chyba ostane dlhšie a je červená. Stavový riadok ostáva len pre cieľový model. | malý |
| 5 | **Priebeh skladby** | Windows dáva pozíciu a dĺžku skladby. Tenký prúžok pod názvom. Ťah po ňom = posun v skladbe (neskôr). | malý–stredný |
| 6 | **Gestá na obale skladby** | Ťah doľava/doprava na obrázku = ďalšia/predošlá, klepnutie = play/pauza. Tlačidlá ostávajú. | malý |
| 7 | **Výber cieľovej relácie** | Klepnutie na štítok modelu v páse pri dvoch SketchUpoch ukáže zoznam a dovolí vybrať ručne, nie len klikom na PC. | malý |
| 8 | **Ambientný režim** | Po 5 min bez dotyku v Station stmavne panel na 40 % a ostanú len veľké hodiny a kruhy. Dotyk vráti. Šetrí displej starého telefónu a v noci nesvieti do očí. | malý |
| 9 | **Stav spojenia celoplošne** | Pri výpadku služby celý panel zosivie (desaturácia) a hore je pruh „PC neodpovedá“, pri obnovení sa farba vráti s 400 ms prechodom. Nemusíš hľadať malú bodku. | malý |
| 10 | **Dlhé podržanie na Pohľad** | Prepne perspektíva / rovnobežné premietanie (technický pohľad na skrinku). Krátke klepnutie ostáva nápoveda. | malý |
| 11 | **Preusporiadanie dlaždíc** | Dlhé podržanie a ťah presunie dlaždicu; poradie sa uloží. | stredný, neskôr |
| 12 | **Obrázok skladby ako pozadie celého Station** | Rozmazaný a stmavený obal skladby za všetkými kartami (ako JaxCore). Voliteľné. | malý |

Mimo V1 ostáva, čo si už rozhodol: tagy, Engine kontext, USB.

## 4. Katalóg animácií

| Kde | Čo | Čas | Poznámka |
|---|---|---|---|
| Dlaždica, stlačenie | scale 0.96 + zvýraznený okraj | 80 ms | Reakcia pod prstom, nie po odpovedi. |
| Dlaždica, výsledok | prelínanie farby (zelená/červená) a späť | 150 ms tam, 400 ms späť | Dnes skokom. |
| Dlaždica, odoslané | jemné „dýchanie“ okraja, kým nepríde odpoveď | 900 ms cyklus | Max 3 s. |
| Kruhy usage | dokreslenie oblúka od 0 a číslo „nabieha“ | 800 ms | Pri načítaní a pri zmene hodnoty. |
| Obal skladby | prelínanie starého a nového obrázka | 500 ms | Dnes skokom. |
| Názov skladby | pri zmene sa starý posunie hore a zmizne, nový príde zdola | 250 ms | |
| Prepnutie režimu | podľa kap. 2 | 380 ms + odstupy | |
| AUTO štítok | „AUTO → SKP“ vyjde z prepínača a zmizne | 1,2 s | |
| Toast | zdola hore, zmizne dole | 250 ms / 200 ms | |
| Odznak hlasitosti | zhora, s prúžkom | 200 ms | Už je. |
| Bodka spojenia | pulz pri pripájaní | 1 s cyklus | |
| Ambientný režim | stmavenie a zväčšenie hodín | 1,5 s | |
| Hodiny | zmena minúty: stará číslica hore, nová zdola | 300 ms | Drobnosť, ale robí dojem. |

## 5. Vizuálny štýl

Držať smer B/C: tmavá navy plocha s jemným radiálnym prechodom, karty so svetlou hornou hranou, modrý akcent pre aktívne, zelenomodrý pre „zapnuté“ (izolácia, X‑Ray). V mocku je prepínač **B (Modern)** a **C (Hyper, svietiace hrany)**. Odporúčam B ako základ a z C prevziať len svetelný okraj aktívnej dlaždice, aby to nebolo prehnané.

## 6. Rozhodnutia Michala (15. 9. 2026 večer)

- **Prechod:** Morph, o niečo pomalší ako v prvom mocku (480 ms namiesto 380).
- **Štýl:** B, ale posunúť do **frosted glass**; pozadie mierne pohyblivý prechod antracit → tmavá oceľ.
- **Haptika nie, toasty áno.** Z drobných funkcií: 2 (detail usage) a 3 (odpočet) v detaile; 4 toasty; 5, 6, 11 neskôr; 12 zamietnuté (obrázky skladieb majú príliš nízke rozlíšenie).
- **Station:** hodiny užšie, čas na stred, pod ním väčší deň, pod ním dátum. Kruhy usage nad sebou a väčšie, časy resetov len v detaile; detail lepšie graficky usporiadať a nech **roztiahne kartu usage** (prehrávač sa zmenší alebo sa na chvíľu zakryjú hodiny). Prehrávač bez farebných (emoji) ikon, všetko rovnako jemne svetlé.
- **SKP:** bočný pás preusporiadať, navrhnúť varianty zúženého Station panela; sprehľadniť výplne dlaždíc.

Druhý mock s týmito zmenami: `app/public/mock3.html` (varianty pásu prepínateľné v nastaveniach).

## 7. Pôvodné otázky (zodpovedané v kap. 6)

1. Prechod: Morph, Slide alebo Fade? (Vyskúšaj v mocku, aj s „obmedziť pohyb“.)
2. Haptika: chceš ju popri LED?
3. Toasty namiesto stavového riadku: áno?
4. Ambientný režim po nečinnosti: áno, a po koľkých minútach?
5. Z drobných funkcií 1–12 vyber, ktoré idú do reworku, a poradie.
