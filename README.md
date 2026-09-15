# N-portal

Dotykový pracovný panel NOXUN pre starší mobil používaný cez spacedesk ako tretí monitor PC.

**Stav k 15. 9. 2026:** smer zmenený na **PWA na mobile + lokálna služba na PC** (dôvod: test D0 ukázal, že dotyk cez spacedesk presúva kurzor a fokus). Hotové a na mobile overené: E0 (Zamerať výber), E1 (Station: čas, usage, hudba), E2 (pohľady), E3 (izolovať/obnoviť, skryté objekty; tagy mimo V1). E4 (AUTO režim podľa aktívneho okna, viac relácií SketchUpu) je postavené a overené na PC. Stav a záznamy testov sú v [Postupe](docs/POSTUP.md). Ďalšie etapy nezačínať bez potvrdenia rozsahu.

## Časti

| Priečinok | Obsah |
|---|---|
| `app/` | PWA pre mobil (Vite + React + TypeScript). `npm run build` → `app/dist`, servuje ju služba. |
| `service/` | Lokálna služba na PC (Node + TypeScript): servuje PWA, WebSocket s tokenom, prepojenie na SketchUp. |
| `sketchup/` | Ruby prijímač povelov pre SketchUp 2026 (zoznam povolených akcií, súborový protokol). |
| `tools/` | `start-service.ps1` (zostaví a spustí službu ručne), `install-autostart.ps1` / `uninstall-autostart.ps1` (automatický štart služby po prihlásení, bez okna, s reštartom pri páde), `install-sketchup.ps1` (skopíruje prijímač do SketchUpu). |
| `docs/` | Dokumentácia. |

Dáta za behu: `C:\Users\<meno>\.n-portal` (povely, stav, logy, konfigurácia služby s tokenom).

## Dva režimy

| Režim | Obsah |
|---|---|
| **Station** | Čas, dátum, usage Codex/Claude a ovládanie hudby. Funguje nezávisle od SketchUpu. |
| **SKP** | Veľké dotykové tlačidlá pre SketchUp; čas, usage a základné hudobné ovládanie zostanú v kompaktnom páse. |

Smer: **PWA na mobile + lokálna služba na PC + Ruby prijímač v SketchUpe** (pozri [Analýzu smeru](docs/SMER.md)). Nie druhý Inspector ani nová Android aplikácia.

## Dokumentácia

| Súbor | Účel |
|---|---|
| [Analýza smeru](docs/SMER.md) | **Zmena smeru 15. 9. 2026:** PWA na mobile + lokálna služba na PC namiesto Rainmeter + spacedesk. Čo použiť, čo vlastnou cestou, etapy nanovo. Na prejdenie. |
| [Kontext](docs/KONTEXT.md) | Doterajšie testy, zadanie, architektúra a otvorené otázky. |
| [Plán](docs/PLAN.md) | Malé etapy a odložené nápady. |
| [Postup a stav](docs/POSTUP.md) | Najbližší test E0, kontrolný zoznam a záznam výsledkov. |
| [Vizuálne návrhy](docs/VIZUALY.md) | A — Classic, B — Modern, C — Hyper Modern. **Preferované sú B a C; finálny výber ešte nepadol.** |

**Najbližší krok:** test E0 na reálnom mobile. Overiť, že po dotyku v PWA ruka na myši a klávesnici pokračuje v SketchUpe bez akéhokoľvek klikania.

Dokumentácia zachytáva úvodnú diskusiu; nápad ani návrh nie je implementovaná funkcia. Do verejného repozitára nepatria prihlasovacie tokeny, skutočná telemetria účtov ani zákaznícke modely.
