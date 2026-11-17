"""Fetches one city photo per tile from Wikimedia Commons, with license metadata.

One-time tool:
  python tools/fetch_city_photos.py              preview search candidates
  python tools/fetch_city_photos.py --tile 24    preview one tile
  python tools/fetch_city_photos.py --download   fetch PICKS, save to src/client/assets/cities/, write photos.ts

Every pick must be CC0 / Public domain / CC BY / CC BY-SA, must not be a flag/coat-of-arms/map,
and is eyeballed by a human before it ships. The generated src/client/photos.ts carries the
per-file credit; ASSETS.md registers the whole set.
"""

import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = {"User-Agent": "LayUDown-Monopoly/1.0 (contact: wsir114514sketch) python-urllib"}
CTX = ssl.create_default_context()

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "src", "client", "assets", "cities")
PHOTOS_TS = os.path.join(ROOT, "src", "client", "photos.ts")

# tile index -> Commons search term, for the preview mode.
SEARCHES = {
    1: "Rio de Janeiro Sugarloaf mountain",
    2: "Buenos Aires obelisco 9 de Julio",
    5: "Kaohsiung Port Station",
    6: "Sao Paulo Avenida Paulista",
    7: "Lima Peru Miraflores cliff",
    10: "Giza pyramids",
    12: "Cape Town Table Mountain city",
    13: "Marrakesh Jemaa el-Fnaa",
    14: "power lines pylons landscape",
    15: "Mumbai Marine Drive",
    16: "Jakarta National Monument Monas",
    18: "Singapore Marina Bay",
    19: "Bangkok Chao Phraya river",
    20: "metro subway station platform",
    21: "Shanghai Pudong skyline",
    22: "Beijing Forbidden City",
    24: "Tokyo Tower Minato",
    25: "Seoul Gyeongbokgung palace",
    27: "Taipei 101 skyline",
    28: "Taiwan High Speed Rail train",
    29: "Kaohsiung Love River",
    30: "Taichung city skyline",
    32: "Tainan Chihkan Tower",
    34: "Sydney Opera House harbour",
    35: "Auckland Sky Tower",
    36: "water treatment plant reservoir",
    37: "Dubai Burj Khalifa",
    39: "Paris Eiffel Tower",
    40: "London Tower Bridge",
    41: "Zurich Limmat Grossmunster",
    42: "Rome Colosseum",
    44: "Staten Island Ferry Manhattan",
    45: "Los Angeles downtown",
    46: "Manhattan skyline",
    47: "San Francisco Golden Gate fog",
}

# The picks, chosen by hand from the searches above and eyeballed before shipping.
PICKS = {
    1: "File:Rio de Janeiro skyline and Sugarloaf Mountain at sunset, Brazil 3.jpg",
    2: "File:Buenos Aires-Av. 9 de julio.jpg",
    5: "File:Kaohsiung Port Station front view.jpg",
    6: "File:Parque Avenida Building in Paulista Avenue.jpg",
    7: "File:Lima, Peru City -- Skyline (Miraflores).jpg",
    10: "File:All Gizah Pyramids.jpg",
    12: "File:Cape Town City Bowl and Table Mountain at dawn.jpg",
    13: "File:Jamaa El Fna, Marrakesh, Morocco, 20250124 1804 7017.jpg",
    14: "File:PacifiCorp 345kV Power Lines Near Jim Bridger Power Plant, Wyoming.jpg",
    15: "File:Marine Lines Mumbai 2021.jpg",
    16: "File:Monumen Nasional, Jakarta, Indonesia.jpg",
    18: "File:Puente Helix, museo ArtScience y hotel Marina Bay Sands, Marina Bay, Singapur, 2023-08-17, DD 67-69 HDR.jpg",
    19: "File:Río Chao Phraya, Bangkok, Tailandia, 2013-08-22, DD 05.jpg",
    20: "File:Munich subway station Westfriedhof.jpg",
    21: "File:Shanghai skyline waterfront pudong 5166168 69 70.jpg",
    22: "File:Peking verbotene Stadt-20071018-RM-162411.jpg",
    24: "File:Minato City, Tokyo, Japan.jpg",
    25: "File:Gyeonghoeru (Royal Banquet Hall) at Gyeongbokgung Palace, Seoul.jpg",
    27: "File:Taipei Taiwan Taipei-101-Tower-01.jpg",
    28: "File:Taiwan High Speed Rail train 639 at Tainan HSR station May 2025.jpg",
    29: "File:Kaohsiung-Love-River.jpg",
    30: "File:Taichung City Skyline, Central District 2025-11-06.jpg",
    32: "File:Tainan Taiwan Fort-Provintia-01.jpg",
    34: "File:Sydney Opera House and Harbour Bridge Dusk (3) 2019-06-21.jpg",
    35: "File:Auckland CBD skyline from Waitemata Harbour entrance.jpg",
    36: "File:Water treatment plant below Carsington Water reservoir - geograph.org.uk - 3187180.jpg",
    37: "File:Burj Khalifa Dubai, UAE at Sunset 001 by Eric Chamchoum.jpg",
    39: "File:Tour eiffel at sunrise from the trocadero.jpg",
    40: "File:Tower Bridge London Dusk Feb 2006.jpg",
    41: "File:Grossmünster and Limmat River, Zurich, 20250330 1239 7929.jpg",
    42: "File:Rome Colosseum 001.jpg",
    44: "File:Lower Manhattan from Staten Island Ferry Jan 2006.jpg",
    45: "File:Los Angeles (California, USA), South Olive Street -- 2012 -- 4847.jpg",
    46: "File:Lower Manhattan from Jersey City September 2020 panorama.jpg",
    47: "File:San Francisco with two bridges and the low fog.jpg",
}

# Words that mark a file we must not ship, whatever the search matched.
BAD_TITLE = re.compile(r"flag|coat[_ ]of[_ ]arms|emblem|locator|seal of|logo|stamp", re.I)

OK_LICENSES = {
    "CC0", "Public domain", "PD",
    "CC BY 4.0", "CC BY-SA 4.0", "CC BY 3.0", "CC BY-SA 3.0",
    "CC BY 2.5", "CC BY-SA 2.5", "CC BY 2.0", "CC BY-SA 2.0",
    "CC BY 1.0", "CC BY-SA 1.0",
}


def api(params: dict) -> dict:
    time.sleep(1.2)
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30, context=CTX) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < 2:
                time.sleep(15 * (attempt + 1))
                continue
            raise


def clean(html: str) -> str:
    text = re.sub(r"<[^>]*>", "", html or "")
    return re.sub(r"\s+", " ", text).strip()


def search(term: str) -> list[dict]:
    data = api({
        "action": "query", "format": "json",
        "generator": "search", "gsrsearch": f"filetype:bitmap {term}", "gsrnamespace": 6, "gsrlimit": 12,
        "prop": "imageinfo", "iiprop": "url|extmetadata|size",
        "iiurlwidth": 880,
    })
    pages = data.get("query", {}).get("pages", {})
    results = []
    for page in sorted(pages.values(), key=lambda p: p.get("index", 999)):
        info = page.get("imageinfo")
        if not info:
            continue
        info = info[0]
        meta = info.get("extmetadata", {})
        license_name = clean(meta.get("LicenseShortName", {}).get("value", ""))
        if license_name not in OK_LICENSES:
            continue
        if BAD_TITLE.search(page.get("title", "")):
            continue
        results.append({
            "title": page["title"],
            "license": license_name,
            "artist": clean(meta.get("Artist", {}).get("value", "未知作者")),
            "url": info.get("thumburl") or info.get("url"),
            "page": info.get("descriptionurl", ""),
        })
    return results


def fetch_meta(titles: list[str]) -> dict[str, dict]:
    entries: dict[str, dict] = {}
    for start in range(0, len(titles), 8):
        batch = titles[start:start + 8]
        data = api({"action": "query", "format": "json", "titles": "|".join(batch),
                    "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": 880})
        for page in data.get("query", {}).get("pages", {}).values():
            info = page.get("imageinfo")
            if not info:
                print(f"  MISSING {page.get('title')}", file=sys.stderr)
                continue
            info = info[0]
            meta = info.get("extmetadata", {})
            entries[page["title"]] = {
                "license": clean(meta.get("LicenseShortName", {}).get("value", "")),
                "artist": clean(meta.get("Artist", {}).get("value", "未知作者")),
                "url": info.get("thumburl") or info.get("url"),
                "page": info.get("descriptionurl", ""),
            }
    return entries


def download() -> None:
    """Fetch each pick at thumbnail width, save it, and write photos.ts with the credits."""
    os.makedirs(OUT_DIR, exist_ok=True)
    entries = fetch_meta(list(PICKS.values()))

    lines = [
        "/**",
        " * The real city photos behind the property cards, downloaded from Wikimedia Commons by",
        " * tools/fetch_city_photos.py, which also wrote this file. Do not edit the table by hand:",
        " * re-run the tool. The images live in assets/cities/<tile>.jpg and are resolved through",
        " * import.meta.glob, so both builds (the standalone dev page and the shared SPA) get hashed URLs.",
        " *",
        " * Every photo is CC0 / Public domain / CC BY / CC BY-SA; the per-file credit is in the table",
        " * and registered in ASSETS.md. The board data layer stays free of image paths.",
        " */",
        "",
        'const FILES = import.meta.glob("./assets/cities/*.jpg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;',
        "",
        "export interface TilePhoto {",
        "  src: string;",
        "  /** The Commons file title; its description page is the canonical source link. */",
        "  file: string;",
        "  license: string;",
        "  artist: string;",
        "}",
        "",
        "export const TILE_PHOTOS: Record<number, TilePhoto> = {",
    ]
    saved = 0
    for index, title in sorted(PICKS.items()):
        entry = entries.get(title)
        if not entry:
            print(f"  NO META for {title}", file=sys.stderr)
            continue
        target = os.path.join(OUT_DIR, f"{index}.jpg")
        request = urllib.request.Request(entry["url"], headers=UA)
        with urllib.request.urlopen(request, timeout=60, context=CTX) as response:
            body = response.read()
        with open(target, "wb") as handle:
            handle.write(body)
        saved += 1
        artist = entry["artist"].replace("\\", "").replace('"', "'")
        print(f"{index:3d}  {len(body) // 1024:4d} KB  {title}")
        lines.append(
            '  %d: { src: FILES["./assets/cities/%d.jpg"] ?? "", file: %s, license: %s, artist: %s },' % (
                index, index, json.dumps(title, ensure_ascii=False),
                json.dumps(entry["license"], ensure_ascii=False), json.dumps(artist, ensure_ascii=False),
            )
        )
        time.sleep(0.6)
    lines.append("};")
    lines.append("")
    lines.append("export const tilePhoto = (index: number): TilePhoto | undefined => TILE_PHOTOS[index];")
    lines.append("")
    with open(PHOTOS_TS, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines))
    print(f"saved {saved} photos; wrote {PHOTOS_TS}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tile", type=int, action="append", help="only this tile")
    parser.add_argument("--show", type=int, default=4, help="candidates per tile to preview")
    parser.add_argument("--download", action="store_true", help="fetch the picks and write photos.ts")
    args = parser.parse_args()

    if args.download:
        download()
        return

    for index, term in SEARCHES.items():
        if args.tile and index != args.tile:
            continue
        try:
            found = search(term)
        except Exception as error:  # noqa: BLE001 - report and keep going
            print(f"{index:3d}  ERROR {error}", file=sys.stderr)
            continue
        print(f"== tile {index}: {term}")
        for candidate in found[:args.show]:
            print(f"   {candidate['license']:<14} {candidate['title']}")
            print(f"                 {candidate['artist']}  {candidate['url']}")


if __name__ == "__main__":
    main()
