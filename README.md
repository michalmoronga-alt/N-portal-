# N-portal

Dotykový pracovný panel NOXUN pre starší mobil používaný cez spacedesk ako tretí monitor PC.

**Stav k 15. 9. 2026:** iba dokumentácia a vizuálne návrhy. Spacedesk a dotyk používateľ odskúšal; vlastné ovládanie SketchUpu zatiaľ nie. Implementáciu nezačínať bez zadania konkrétnej malej etapy.

## Dva režimy

| Režim | Obsah |
|---|---|
| **Station** | Čas, dátum, usage Codex/Claude a ovládanie hudby. Funguje nezávisle od SketchUpu. |
| **SKP** | Veľké dotykové tlačidlá pre SketchUp; čas, usage a základné hudobné ovládanie zostanú v kompaktnom páse. |

Preferovaný smer na overenie: **jeden Rainmeter widget + lokálne prepojenie + Ruby prijímač v SketchUpe**, bez skrytého HTML panelu. Nie druhý Inspector ani nová Android aplikácia.

## Dokumentácia

| Súbor | Účel |
|---|---|
| [Kontext](docs/KONTEXT.md) | Doterajšie testy, zadanie, architektúra a otvorené otázky. |
| [Plán](docs/PLAN.md) | Malé etapy a odložené nápady. |
| [Postup a stav](docs/POSTUP.md) | Najbližší test E0, kontrolný zoznam a záznam výsledkov. |
| [Vizuálne návrhy](docs/VIZUALY.md) | A — Classic, B — Modern, C — Hyper Modern. **Preferované sú B a C; finálny výber ešte nepadol.** |

**Najbližší krok:** jedno tlačidlo „Zamerať výber“ z Rainmetera. Overiť prenos povelu, odpoveď, správny model a pokračovanie myšou/klávesnicou bez dodatočného klikania.

Dokumentácia zachytáva úvodnú diskusiu; nápad ani návrh nie je implementovaná funkcia. Do verejného repozitára nepatria prihlasovacie tokeny, skutočná telemetria účtov ani zákaznícke modely.
