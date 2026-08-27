#!/usr/bin/env python3
"""
Korrigiert falsche Gesichtszuordnungen in Immich anhand eines Stichdatums.

Anwendungsfall: Johann ist am 05.06.2024 geboren. Jedes Gesicht, das vor diesem
Datum als Johann getaggt ist, gehoert in Wahrheit Antonio.

Ohne --anwenden passiert nichts: das Skript zeigt nur, was es tun wuerde.
Jede angewandte Aenderung landet in einem Protokoll, mit dem sie sich per
--zuruecknehmen wieder rueckgaengig machen laesst.

Benoetigte Berechtigungen des API-Keys:
    person.read       Personen finden
    asset.read        Bilder der Person suchen
    person.reassign   Gesichter umhaengen (nur mit --anwenden)

Beispiele:
    python3 zuordnung_korrigieren.py                       # Probelauf
    python3 zuordnung_korrigieren.py --liste bilder.csv    # Probelauf + CSV
    python3 zuordnung_korrigieren.py --anwenden
    python3 zuordnung_korrigieren.py --zuruecknehmen protokoll-20260827-1830.jsonl
"""

from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

STAPEL = 50          # Gesichter pro Schreibanfrage
VERSUCHE = 3         # Wiederholungen bei Netz- oder Serverfehlern


# --------------------------------------------------------------------------- #
# Zugang
# --------------------------------------------------------------------------- #

def lade_env(pfad: str) -> dict[str, str]:
    """Liest eine .env-Datei. Echte Umgebungsvariablen haben Vorrang."""
    werte: dict[str, str] = {}
    if os.path.exists(pfad):
        with open(pfad, encoding="utf-8") as datei:
            for zeile in datei:
                zeile = zeile.strip()
                if not zeile or zeile.startswith("#") or "=" not in zeile:
                    continue
                name, _, wert = zeile.partition("=")
                werte[name.strip()] = wert.strip().strip("\"'")
    for name in ("IMMICH_URL", "IMMICH_API_KEY"):
        if os.environ.get(name):
            werte[name] = os.environ[name]
    fehlend = [n for n in ("IMMICH_URL", "IMMICH_API_KEY") if not werte.get(n)]
    if fehlend:
        raise SystemExit(f"In {pfad} fehlt: {', '.join(fehlend)}")
    return werte


class ImmichFehler(Exception):
    def __init__(self, meldung: str, status: int, berechtigung: str | None = None):
        super().__init__(meldung)
        self.status = status
        self.berechtigung = berechtigung


class Immich:
    def __init__(self, basis: str, schluessel: str):
        # Die URL darf mit oder ohne /api enden.
        basis = basis.rstrip("/")
        self.basis = basis if basis.endswith("/api") else basis + "/api"
        self.schluessel = schluessel

    def _anfrage(self, methode: str, pfad: str, rumpf: object | None = None) -> object:
        daten = json.dumps(rumpf).encode() if rumpf is not None else None
        anfrage = urllib.request.Request(
            self.basis + pfad,
            data=daten,
            method=methode,
            headers={"x-api-key": self.schluessel, "Content-Type": "application/json"},
        )
        letzter: Exception | None = None
        for versuch in range(VERSUCHE):
            try:
                with urllib.request.urlopen(anfrage, timeout=120) as antwort:
                    text = antwort.read().decode()
                    return json.loads(text) if text else None
            except urllib.error.HTTPError as fehler:
                text = fehler.read().decode(errors="replace")
                if fehler.code == 403 and "Missing required permission" in text:
                    fehlt = text.split("Missing required permission:")[1].strip(' ."}\n')
                    raise ImmichFehler(
                        f'Dem API-Key fehlt die Berechtigung "{fehlt}". '
                        f"In Immich unter Einstellungen -> API-Keys nachtragen.",
                        403, fehlt,
                    ) from None
                if fehler.code < 500:
                    raise ImmichFehler(
                        f"{methode} {pfad} -> {fehler.code}: {text[:300]}", fehler.code
                    ) from None
                letzter = fehler
            except (urllib.error.URLError, TimeoutError) as fehler:
                letzter = fehler
            if versuch < VERSUCHE - 1:
                time.sleep(2 ** versuch)
        raise ImmichFehler(f"{methode} {pfad} nach {VERSUCHE} Versuchen: {letzter}", 0)

    def personen(self) -> list[dict]:
        d = self._anfrage("GET", "/people?size=1000&withHidden=true")
        return d["people"]

    def assets_von_person(self, person_id: str, mit_papierkorb: bool) -> list[dict]:
        """Alle Bilder und Videos, in denen die Person getaggt ist."""
        alle: list[dict] = []
        seite: int | None = 1
        while seite:
            rumpf = {
                "personIds": [person_id],
                "size": 1000,
                "page": seite,
                "withExif": True,
                "withPeople": True,
            }
            if mit_papierkorb:
                rumpf["withDeleted"] = True
            d = self._anfrage("POST", "/search/metadata", rumpf)["assets"]
            alle.extend(d["items"])
            seite = int(d["nextPage"]) if d["nextPage"] else None
            print(f"\r  {len(alle)} Bilder geladen ...", end="", file=sys.stderr, flush=True)
        print("\r" + " " * 40 + "\r", end="", file=sys.stderr)
        return alle

    def haenge_um(self, ziel_id: str, quelle_id: str, asset_ids: list[str]) -> None:
        """Haengt die Gesichter der Quellperson in diesen Bildern auf die Zielperson."""
        self._anfrage(
            "PUT",
            f"/people/{ziel_id}/reassign",
            {"data": [{"personId": quelle_id, "assetId": a} for a in asset_ids]},
        )


# --------------------------------------------------------------------------- #
# Auswahl
# --------------------------------------------------------------------------- #

def finde_person(personen: list[dict], name: str) -> dict:
    treffer = [p for p in personen if (p.get("name") or "").lower() == name.lower()]
    if not treffer:
        aehnlich = [p["name"] for p in personen if name.lower() in (p.get("name") or "").lower()]
        hinweis = f" Meintest du: {', '.join(aehnlich[:5])}?" if aehnlich else ""
        raise SystemExit(f'Keine Person namens "{name}" gefunden.{hinweis}')
    if len(treffer) > 1:
        zeilen = "\n".join(f"  {p['id']}  {p['name']}  {p.get('birthDate') or '?'}" for p in treffer)
        raise SystemExit(f'Mehrere Personen heissen "{name}":\n{zeilen}\nBitte --von-id / --zu-id benutzen.')
    return treffer[0]


def aufnahmetag(asset: dict) -> str:
    """Der Kalendertag der Aufnahme in Ortszeit, als YYYY-MM-DD."""
    return (asset.get("localDateTime") or asset["fileCreatedAt"])[:10]


def waehle_aus(assets: list[dict], vor: str, nicht_vor: str | None,
               ziel_id: str, nur_bilder: bool) -> tuple[list[dict], dict[str, list[dict]]]:
    """Teilt die Bilder in zu aendernde und zurueckgestellte auf."""
    betroffen: list[dict] = []
    zurueck: dict[str, list[dict]] = collections.defaultdict(list)
    for asset in assets:
        tag = aufnahmetag(asset)
        if tag >= vor:
            continue
        if nur_bilder and asset.get("type") != "IMAGE":
            zurueck["Video (--nur-bilder)"].append(asset)
        elif nicht_vor and tag < nicht_vor:
            zurueck[f"aelter als {nicht_vor}"].append(asset)
        elif any(p.get("id") == ziel_id for p in asset.get("people") or []):
            zurueck["Zielperson ist hier schon getaggt"].append(asset)
        else:
            betroffen.append(asset)
    betroffen.sort(key=aufnahmetag)
    return betroffen, dict(zurueck)


# --------------------------------------------------------------------------- #
# Bericht
# --------------------------------------------------------------------------- #

def bericht(betroffen: list[dict], zurueck: dict[str, list[dict]],
            von: dict, zu: dict, vor: str) -> None:
    print(f"\nQuelle : {von['name']}  ({von['id']}, Geburtstag laut Immich: {von.get('birthDate') or '-'})")
    print(f"Ziel   : {zu['name']}  ({zu['id']}, Geburtstag laut Immich: {zu.get('birthDate') or '-'})")
    print(f"Stichtag: alles vor {vor}\n")

    if not betroffen:
        print("Nichts zu tun.")
    else:
        jahre = collections.Counter(aufnahmetag(a)[:4] for a in betroffen)
        typen = collections.Counter(a.get("type", "?") for a in betroffen)
        print(f"{len(betroffen)} Gesichter werden umgehaengt "
              f"({aufnahmetag(betroffen[0])} bis {aufnahmetag(betroffen[-1])})")
        print("  nach Jahr: " + ", ".join(f"{j}: {n}" for j, n in sorted(jahre.items())))
        print("  nach Typ : " + ", ".join(f"{t}: {n}" for t, n in sorted(typen.items())))
        print("\n  Die ersten fuenf:")
        for asset in betroffen[:5]:
            print(f"    {aufnahmetag(asset)}  {asset.get('originalFileName', asset['id'])}")

    for grund, liste in sorted(zurueck.items()):
        print(f"\n  uebersprungen, {grund}: {len(liste)}")
        for asset in liste[:3]:
            print(f"    {aufnahmetag(asset)}  {asset.get('originalFileName', asset['id'])}")

    geburt = zu.get("birthDate")
    if geburt and betroffen and aufnahmetag(betroffen[0]) < geburt:
        frueh = sum(1 for a in betroffen if aufnahmetag(a) < geburt)
        print(f"\n  ACHTUNG: {frueh} Bilder sind aelter als {zu['name']}s Geburtstag ({geburt}).")
        print(f"           Dort ist wohl weder {von['name']} noch {zu['name']} zu sehen.")
        print(f"           Mit --nicht-vor {geburt} bleiben sie unberuehrt.")


def schreibe_csv(pfad: str, betroffen: list[dict]) -> None:
    with open(pfad, "w", newline="", encoding="utf-8") as datei:
        schreiber = csv.writer(datei)
        schreiber.writerow(["aufnahmetag", "assetId", "dateiname", "typ"])
        for asset in betroffen:
            schreiber.writerow([aufnahmetag(asset), asset["id"],
                                asset.get("originalFileName", ""), asset.get("type", "")])
    print(f"\nListe geschrieben: {pfad}")


# --------------------------------------------------------------------------- #
# Ausfuehren
# --------------------------------------------------------------------------- #

def haenge_alle_um(immich: Immich, ziel_id: str, quelle_id: str,
                   asset_ids: list[str], protokoll_pfad: str) -> int:
    """Haengt in Stapeln um und protokolliert jedes Bild einzeln, sobald es sass."""
    erledigt = 0
    with open(protokoll_pfad, "a", encoding="utf-8") as protokoll:
        for anfang in range(0, len(asset_ids), STAPEL):
            stapel = asset_ids[anfang:anfang + STAPEL]
            try:
                immich.haenge_um(ziel_id, quelle_id, stapel)
                gelungen = stapel
            except ImmichFehler as fehler:
                if fehler.berechtigung:
                    raise
                # Ein Stapel kann an einem einzigen Bild scheitern - dann einzeln.
                print(f"\n  Stapel fehlgeschlagen ({fehler}), versuche einzeln ...")
                gelungen = []
                for asset_id in stapel:
                    try:
                        immich.haenge_um(ziel_id, quelle_id, [asset_id])
                        gelungen.append(asset_id)
                    except ImmichFehler as einzeln:
                        print(f"    {asset_id}: {einzeln}")
            for asset_id in gelungen:
                protokoll.write(json.dumps({
                    "zeit": dt.datetime.now().isoformat(timespec="seconds"),
                    "assetId": asset_id, "von": quelle_id, "zu": ziel_id,
                }) + "\n")
            protokoll.flush()
            erledigt += len(gelungen)
            print(f"\r  {erledigt}/{len(asset_ids)} umgehaengt ...", end="", flush=True)
    print()
    return erledigt


def zuruecknehmen(immich: Immich, pfad: str) -> None:
    """Liest ein Protokoll und dreht jede Umhaengung wieder um."""
    with open(pfad, encoding="utf-8") as datei:
        eintraege = [json.loads(z) for z in datei if z.strip()]
    if not eintraege:
        raise SystemExit(f"{pfad} enthaelt keine Eintraege.")
    nach_paar: dict[tuple[str, str], list[str]] = collections.defaultdict(list)
    for eintrag in eintraege:
        nach_paar[(eintrag["zu"], eintrag["von"])].append(eintrag["assetId"])
    print(f"{len(eintraege)} Umhaengungen aus {pfad} werden zurueckgenommen.")
    gegenprotokoll = pfad.replace(".jsonl", "") + "-zurueck.jsonl"
    for (jetzt, vorher), asset_ids in nach_paar.items():
        haenge_alle_um(immich, vorher, jetzt, asset_ids, gegenprotokoll)
    print("Fertig.")


def main() -> None:
    heute = dt.datetime.now().strftime("%Y%m%d-%H%M")
    parser = argparse.ArgumentParser(
        description="Haengt falsch zugeordnete Gesichter vor einem Stichtag auf die richtige Person um.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Ohne --anwenden aendert das Skript nichts.",
    )
    parser.add_argument("--von", default="Johann", help="Person, die faelschlich getaggt ist")
    parser.add_argument("--zu", default="Antonio", help="Person, die es wirklich ist")
    parser.add_argument("--von-id", help="statt --von: Personen-ID direkt")
    parser.add_argument("--zu-id", help="statt --zu: Personen-ID direkt")
    parser.add_argument("--vor", default="2024-06-05", metavar="YYYY-MM-DD",
                        help="Stichtag; betroffen ist alles davor (Vorgabe: 2024-06-05)")
    parser.add_argument("--nicht-vor", metavar="YYYY-MM-DD",
                        help="untere Grenze, z.B. der Geburtstag der Zielperson")
    parser.add_argument("--nur-bilder", action="store_true", help="Videos auslassen")
    parser.add_argument("--grenze", type=int, metavar="N",
                        help="hoechstens N Bilder anfassen - zum Ausprobieren im Kleinen")
    parser.add_argument("--mit-papierkorb", action="store_true", help="auch geloeschte Bilder einbeziehen")
    parser.add_argument("--anwenden", action="store_true", help="Aenderungen wirklich schreiben")
    parser.add_argument("--liste", metavar="DATEI.csv", help="betroffene Bilder als CSV ablegen")
    parser.add_argument("--protokoll", default=f"protokoll-{heute}.jsonl",
                        help="Protokolldatei fuer die Ruecknahme")
    parser.add_argument("--zuruecknehmen", metavar="PROTOKOLL.jsonl",
                        help="ein frueheres Protokoll rueckgaengig machen")
    parser.add_argument("--env", default=".env", help="Pfad zur .env-Datei")
    args = parser.parse_args()

    for feld in ("vor", "nicht_vor"):
        wert = getattr(args, feld)
        if wert:
            try:
                dt.date.fromisoformat(wert)
            except ValueError:
                raise SystemExit(f"--{feld.replace('_', '-')} braucht das Format YYYY-MM-DD, nicht {wert!r}")

    umgebung = lade_env(args.env)
    immich = Immich(umgebung["IMMICH_URL"], umgebung["IMMICH_API_KEY"])

    try:
        if args.zuruecknehmen:
            zuruecknehmen(immich, args.zuruecknehmen)
            return

        personen = immich.personen()
        von = ({"id": args.von_id, "name": args.von_id, "birthDate": None} if args.von_id
               else finde_person(personen, args.von))
        zu = ({"id": args.zu_id, "name": args.zu_id, "birthDate": None} if args.zu_id
              else finde_person(personen, args.zu))
        if von["id"] == zu["id"]:
            raise SystemExit("Quelle und Ziel sind dieselbe Person.")

        print(f"Suche Bilder von {von['name']} ...", file=sys.stderr)
        assets = immich.assets_von_person(von["id"], args.mit_papierkorb)
        betroffen, zurueck = waehle_aus(assets, args.vor, args.nicht_vor, zu["id"], args.nur_bilder)
        if args.grenze is not None and len(betroffen) > args.grenze:
            print(f"--grenze {args.grenze}: von {len(betroffen)} betroffenen Bildern "
                  f"werden nur die {args.grenze} aeltesten angefasst.")
            betroffen = betroffen[:args.grenze]

        print(f"{len(assets)} Bilder sind insgesamt als {von['name']} getaggt.")
        bericht(betroffen, zurueck, von, zu, args.vor)
        if args.liste:
            schreibe_csv(args.liste, betroffen)

        if not betroffen:
            return
        if not args.anwenden:
            print("\nProbelauf - es wurde nichts geaendert. Mit --anwenden ausfuehren.")
            return

        print(f"\nHaenge {len(betroffen)} Gesichter von {von['name']} auf {zu['name']} um ...")
        anzahl = haenge_alle_um(immich, zu["id"], von["id"],
                                [a["id"] for a in betroffen], args.protokoll)
        print(f"\n{anzahl} von {len(betroffen)} Gesichtern umgehaengt.")
        print(f"Protokoll: {args.protokoll}")
        print(f"Ruecknahme: python3 {os.path.basename(__file__)} --zuruecknehmen {args.protokoll}")
    except ImmichFehler as fehler:
        raise SystemExit(f"\nFehler: {fehler}")


if __name__ == "__main__":
    main()
