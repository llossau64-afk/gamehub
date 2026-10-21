# Schnitt-Kit: 169 Video-Assets

Selbst erzeugte Assets für die Videobearbeitung (CapCut, InShot, VN, Premiere …): **82 Animationen** mit eingebautem Sound und **87 Soundeffekte**. Alles ist per Code generiert (Synthese + Vektorgrafik) und frei nutzbar.

## Formate

- **Animationen** (`animationen/`): MP4, H.264 + AAC, 30 fps. Overlays 1080×1080, Übergänge/Banner/Konfetti 1080×1920 (Hochformat).
- `*_greenscreen.mp4` auf Grün (#00FF00) keyen, `*_bluescreen.mp4` auf Blau (#0000FF). Bluescreen wird genutzt, wenn die Animation selbst grüne Elemente hat (Geldscheine, Haken, grünes Licht).
- **Sounds** (`sounds/`): MP3 192 kbit/s, Lautheit angeglichen.
- `vorschau/`: Vorschaubilder.

**CapCut:** Overlay hinzufügen → Ausschneiden → Chroma-Key → Farbe auf den Hintergrund tippen → Intensität hoch.

## Neu erzeugen

```bash
pip install numpy scipy pycairo pillow
cd VideoAssets/generator
python3 render_sounds.py   # zuerst: Animationen nutzen den Sound-Cache
python3 render_anims.py
```

Sounds stehen in `sounds.py`, Animationen in `anims_ui.py` und `anims_fx.py`.

## Animationen

### Pfeile & Markierungen (9)

- `pfeil_rechts_greenscreen.mp4` – Pfeil nach rechts (2.6 s)
- `pfeil_links_greenscreen.mp4` – Pfeil nach links (2.6 s)
- `pfeil_oben_greenscreen.mp4` – Pfeil nach oben (2.6 s)
- `pfeil_unten_greenscreen.mp4` – Pfeil nach unten (2.6 s)
- `pfeil_gezeichnet_greenscreen.mp4` – Pfeil von Hand gezeichnet (2.5 s)
- `kreis_markieren_greenscreen.mp4` – Kreis markieren (Marker) (2.5 s)
- `unterstreichen_greenscreen.mp4` – Unterstreichen (Marker) (2.2 s)
- `chevrons_hoch_greenscreen.mp4` – Swipe-Up Chevrons (3.0 s)
- `chevrons_rechts_greenscreen.mp4` – Chevrons nach rechts (3.0 s)

### Klicks & Gesten (10)

- `maus_klick_greenscreen.mp4` – Mauszeiger klickt (2.4 s)
- `tippen_greenscreen.mp4` – Finger tippt (Touch) (1.8 s)
- `doppelt_tippen_greenscreen.mp4` – Doppelt tippen (2.0 s)
- `lange_druecken_greenscreen.mp4` – Lange drücken (2.4 s)
- `wischen_links_greenscreen.mp4` – Wischen nach links (2.0 s)
- `wischen_rechts_greenscreen.mp4` – Wischen nach rechts (2.0 s)
- `wischen_oben_greenscreen.mp4` – Wischen nach oben (2.0 s)
- `wischen_unten_greenscreen.mp4` – Wischen nach unten (2.0 s)
- `pinch_reinzoomen_greenscreen.mp4` – Pinch: reinzoomen (2.4 s)
- `pinch_rauszoomen_greenscreen.mp4` – Pinch: rauszoomen (2.4 s)

### Dateien & Fenster (12)

- `ordner_oeffnen_greenscreen.mp4` – Ordner öffnen (2.8 s)
- `ordner_schliessen_greenscreen.mp4` – Ordner schließen (2.6 s)
- `datei_fliegt_rein_greenscreen.mp4` – Datei fliegt rein (2.4 s)
- `datei_loeschen_greenscreen.mp4` – Datei in den Papierkorb (3.0 s)
- `fenster_oeffnen_greenscreen.mp4` – Fenster öffnen (2.2 s)
- `fenster_schliessen_greenscreen.mp4` – Fenster schließen (X klicken) (2.4 s)
- `download_greenscreen.mp4` – Download mit Fortschritt (3.2 s)
- `upload_greenscreen.mp4` – Upload mit Fortschritt (3.2 s)
- `ladekreis_greenscreen.mp4` – Lade-Kreis (Loop) (3.0 s)
- `ladebalken_greenscreen.mp4` – Ladebalken 0-100% (3.0 s)
- `haken_erfolg_bluescreen.mp4` – Haken / Erfolg (2.2 s)
- `kreuz_fehler_greenscreen.mp4` – X / Fehler (2.2 s)

### Social & UI (5)

- `benachrichtigung_banner_greenscreen.mp4` – Push-Benachrichtigung (oben) (3.0 s)
- `chat_nachricht_greenscreen.mp4` – Chat-Nachricht (tippt...) (3.0 s)
- `glocke_klingelt_greenscreen.mp4` – Glocke klingelt + Badge (2.6 s)
- `abonnieren_button_greenscreen.mp4` – Abonnieren-Button + Glocke (3.6 s)
- `like_herz_greenscreen.mp4` – Herz / Like Pop (2.0 s)

### Zoom & Übergänge (12)

- `lupe_reinzoomen_greenscreen.mp4` – Lupe + (reinzoomen) (2.5 s)
- `lupe_rauszoomen_greenscreen.mp4` – Lupe − (rauszoomen) (2.5 s)
- `speed_lines_greenscreen.mp4` – Speed Lines (Anime, Loop) (2.0 s)
- `zoom_rein_uebergang_greenscreen.mp4` – Zoom-Rein Übergang (Ringe) (1.2 s)
- `zoom_raus_uebergang_greenscreen.mp4` – Zoom-Raus Übergang (Ringe) (1.2 s)
- `wipe_links_greenscreen.mp4` – Wipe-Übergang nach links (1.1 s)
- `wipe_rechts_greenscreen.mp4` – Wipe-Übergang nach rechts (1.1 s)
- `wipe_oben_greenscreen.mp4` – Wipe-Übergang nach oben (1.1 s)
- `wipe_unten_greenscreen.mp4` – Wipe-Übergang nach unten (1.1 s)
- `kreis_wipe_greenscreen.mp4` – Kreis-Übergang (1.2 s)
- `glitch_overlay_greenscreen.mp4` – Glitch-Überblendung (1.0 s)
- `bauchbinde_greenscreen.mp4` – Bauchbinde / Lower Third (leer) (4.0 s)

### Geld (8)

- `geld_regen_bluescreen.mp4` – Geld-Regen (Scheine) (3.5 s)
- `muenze_pop_greenscreen.mp4` – Münze ploppt + dreht (2.4 s)
- `muenzen_regen_greenscreen.mp4` – Münzen-Regen (3.4 s)
- `geld_explosion_bluescreen.mp4` – Geld-Explosion (2.8 s)
- `plus_geld_greenscreen.mp4` – +100 € ploppt hoch (2.4 s)
- `geldzaehler_euro_greenscreen.mp4` – Geldzähler 0 → 10.000 € (4.0 s)
- `geldzaehler_dollar_greenscreen.mp4` – Geldzähler $0 → $10,000 (4.0 s)
- `geldsack_greenscreen.mp4` – Geldsack ploppt (2.6 s)

### Quiz & Gameshow (11)

- `rotes_licht_greenscreen.mp4` – Rotes Licht (2.5 s)
- `gruenes_licht_bluescreen.mp4` – Grünes Licht (2.5 s)
- `ampel_rot_zu_gruen_bluescreen.mp4` – Ampel: Rot → Grün (3.5 s)
- `ampel_gruen_zu_rot_bluescreen.mp4` – Ampel: Grün → Rot (3.5 s)
- `richtig_gross_bluescreen.mp4` – RICHTIG! (Haken + Text) (2.6 s)
- `falsch_gross_greenscreen.mp4` – FALSCH! (X + Shake) (2.6 s)
- `countdown_3_2_1_greenscreen.mp4` – Countdown 3-2-1-LOS! (4.0 s)
- `timer_10_sekunden_greenscreen.mp4` – Timer 10 Sekunden (11.0 s)
- `fragezeichen_greenscreen.mp4` – Fragezeichen ? (2.4 s)
- `ausrufezeichen_greenscreen.mp4` – Ausrufezeichen ! (2.4 s)
- `buzzer_knopf_greenscreen.mp4` – Buzzer-Knopf gedrückt (2.6 s)

### Effekte & Text (15)

- `konfetti_greenscreen.mp4` – Konfetti-Kanonen (3.5 s)
- `glitzer_greenscreen.mp4` – Glitzer / Sparkles (2.8 s)
- `blitz_greenscreen.mp4` – Blitz-Einschlag (2.4 s)
- `explosion_boom_greenscreen.mp4` – Comic-Explosion BOOM! (2.4 s)
- `geschenk_oeffnen_greenscreen.mp4` – Geschenk öffnen (3.2 s)
- `text_wow_greenscreen.mp4` – Text-Pop „WOW!“ (2.4 s)
- `text_omg_greenscreen.mp4` – Text-Pop „OMG!“ (2.4 s)
- `text_fail_greenscreen.mp4` – Text-Pop „FAIL“ (2.4 s)
- `text_krass_greenscreen.mp4` – Text-Pop „KRASS!“ (2.4 s)
- `text_was_greenscreen.mp4` – Text-Pop „WAS?!“ (2.4 s)
- `text_nein_greenscreen.mp4` – Text-Pop „NEIN!“ (2.4 s)
- `text_lol_greenscreen.mp4` – Text-Pop „LOL“ (2.4 s)
- `text_hammer_greenscreen.mp4` – Text-Pop „HAMMER!“ (2.4 s)
- `text_neu_greenscreen.mp4` – Text-Pop „NEU!“ (2.4 s)
- `text_geheim_greenscreen.mp4` – Text-Pop „GEHEIM“ (2.4 s)

## Sounds

### Klicks & UI (21)

- `klick_maus.mp3` – Mausklick (0.3 s)
- `klick_doppel.mp3` – Doppelklick (0.4 s)
- `klick_soft.mp3` – Weicher Klick (0.1 s)
- `tap_pop.mp3` – Tap / Pop (0.3 s)
- `button_press.mp3` – Button drücken (0.1 s)
- `schalter_an.mp3` – Schalter AN (0.6 s)
- `schalter_aus.mp3` – Schalter AUS (0.6 s)
- `tastatur_tippen.mp3` – Tastatur tippen (2.3 s)
- `enter_taste.mp3` – Enter-Taste (0.4 s)
- `scrollen.mp3` – Mausrad scrollen (0.8 s)
- `kamera_ausloeser.mp3` – Kamera-Auslöser (0.5 s)
- `ui_oeffnen.mp3` – UI öffnen (Blip hoch) (0.7 s)
- `ui_schliessen.mp3` – UI schließen (Blip runter) (0.7 s)
- `benachrichtigung_ding.mp3` – Benachrichtigung Ding (2.3 s)
- `benachrichtigung_chime.mp3` – Benachrichtigung Chime (2.9 s)
- `nachricht_gesendet.mp3` – Nachricht gesendet (Swoop) (0.8 s)
- `nachricht_empfangen.mp3` – Nachricht empfangen (0.8 s)
- `handy_vibration.mp3` – Handy vibriert (2.4 s)
- `fehler_beep.mp3` – Fehler-Beep (0.3 s)
- `erfolg_beep.mp3` – Erfolg-Beep (0.9 s)
- `like_herz_pop.mp3` – Like / Herz Pop (1.1 s)

### Übergänge (19)

- `whoosh_schnell.mp3` – Whoosh schnell (0.8 s)
- `whoosh_langsam.mp3` – Whoosh langsam (1.9 s)
- `swoosh_links.mp3` – Swoosh nach links (0.5 s)
- `swoosh_rechts.mp3` – Swoosh nach rechts (0.5 s)
- `swoosh_hoch.mp3` – Swoosh hoch (0.9 s)
- `swoosh_runter.mp3` – Swoosh runter (0.8 s)
- `wischen.mp3` – Wischer / Swipe (0.2 s)
- `zoom_rein.mp3` – Reinzoomen (1.1 s)
- `zoom_raus.mp3` – Rauszoomen (0.9 s)
- `riser_kurz.mp3` – Riser kurz (Spannung) (2.5 s)
- `riser_lang.mp3` – Riser lang (Spannung) (5.6 s)
- `downer.mp3` – Downer / Abfall (2.7 s)
- `impact_boom.mp3` – Impact / Boom (4.2 s)
- `bass_drop.mp3` – Bass Drop (3.0 s)
- `vine_boom.mp3` – Deep Boom (Meme) (3.9 s)
- `glitch.mp3` – Glitch (0.9 s)
- `tape_stop.mp3` – Tape Stop / Rewind (1.0 s)
- `vinyl_scratch.mp3` – Platten-Scratch (0.6 s)
- `swish_impact.mp3` – Swish + Einschlag (2.7 s)

### Geld (8)

- `kasse_kaching.mp3` – Kasse Ka-Ching (2.9 s)
- `muenze.mp3` – Münze (Retro) (1.0 s)
- `muenze_echt.mp3` – Münze klimpern (1.6 s)
- `muenzen_regen.mp3` – Münzen-Regen (3.2 s)
- `geld_zaehlen.mp3` – Geldscheine zählen (1.9 s)
- `jackpot.mp3` – Jackpot / Slot (3.6 s)
- `geld_plopp.mp3` – Geld ploppt rein (1.6 s)
- `geld_kommt.mp3` – Geld kommt rein (Cha-Ching + Glitzer) (3.0 s)

### Quiz & Gameshow (18)

- `richtige_antwort.mp3` – Richtige Antwort (2.0 s)
- `richtig_ding_ding.mp3` – Richtig Ding-Ding (2.6 s)
- `falsche_antwort.mp3` – Falsche Antwort (1.4 s)
- `buzzer_falsch.mp3` – Buzzer (falsch, laut) (0.9 s)
- `buzzer_gameshow.mp3` – Gameshow Buzzer (Einloggen) (1.1 s)
- `ding_ding_ding.mp3` – Ding Ding Ding (Gewinner) (3.5 s)
- `countdown_tick.mp3` – Uhr tickt (5 Sek) (4.9 s)
- `countdown_3_2_1_los.mp3` – Countdown 3-2-1-LOS (4.1 s)
- `timer_alarm.mp3` – Zeit abgelaufen (Alarm) (1.2 s)
- `trommelwirbel.mp3` – Trommelwirbel + Becken (5.8 s)
- `tada_fanfare.mp3` – Ta-Da Fanfare (3.2 s)
- `level_up.mp3` – Level Up (1.5 s)
- `game_over.mp3` – Game Over (2.2 s)
- `power_up.mp3` – Power Up (1.4 s)
- `trauriges_horn.mp3` – Trauriges Horn (Wah Wah Wah) (3.9 s)
- `spannung_dun_dun.mp3` – Spannung (Dun Dun Duuun) (5.1 s)
- `applaus.mp3` – Applaus (5.2 s)
- `jubel_cheer.mp3` – Kurzer Jubel (Party-Tröte + Applaus) (2.3 s)

### Comedy & Meme (21)

- `boing.mp3` – Boing (1.2 s)
- `pop.mp3` – Pop (0.1 s)
- `blasen_pops.mp3` – Blasen ploppen (1.3 s)
- `pfeife_hoch.mp3` – Lotuspfeife hoch (1.2 s)
- `pfeife_runter.mp3` – Lotuspfeife runter (1.2 s)
- `bombe_faellt.mp3` – Bombe fällt + Explosion (5.8 s)
- `explosion.mp3` – Explosion (4.7 s)
- `schlag_punch.mp3` – Schlag / Punch (0.8 s)
- `grillen_stille.mp3` – Grillen (peinliche Stille) (5.2 s)
- `herzschlag.mp3` – Herzschlag (3.5 s)
- `sirene.mp3` – Sirene / Alarm (4.1 s)
- `zensur_piep.mp3` – Zensur-Piep (0.7 s)
- `magie_glitzer.mp3` – Magie / Glitzer (2.8 s)
- `laser.mp3` – Laser (1.0 s)
- `donner_blitz.mp3` – Blitz + Donner (5.4 s)
- `lufthorn.mp3` – Air Horn (2.6 s)
- `sprung_jump.mp3` – Sprung / Jump (0.2 s)
- `papier_rascheln.mp3` – Papier / Datei-Swish (0.6 s)
- `papier_zerknuellen.mp3` – Papier zerknüllen / Papierkorb (1.4 s)
- `lichtschalter_brumm.mp3` – Licht an (Schalter + Brummen) (1.6 s)
- `ding_glas.mp3` – Glas-Ding (Idee!) (3.4 s)
