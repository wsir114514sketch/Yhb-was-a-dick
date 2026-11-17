/**
 * The real city photos behind the property cards, downloaded from Wikimedia Commons by
 * tools/fetch_city_photos.py, which also wrote this file. Do not edit the table by hand:
 * re-run the tool. The images live in assets/cities/<tile>.jpg and are resolved through
 * import.meta.glob, so both builds (the standalone dev page and the shared SPA) get hashed URLs.
 *
 * Every photo is CC0 / Public domain / CC BY / CC BY-SA; the per-file credit is in the table
 * and registered in ASSETS.md. The board data layer stays free of image paths.
 */

const FILES = import.meta.glob("./assets/cities/*.jpg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export interface TilePhoto {
  src: string;
  /** The Commons file title; its description page is the canonical source link. */
  file: string;
  license: string;
  artist: string;
}

export const TILE_PHOTOS: Record<number, TilePhoto> = {
  1: { src: FILES["./assets/cities/1.jpg"] ?? "", file: "File:Rio de Janeiro skyline and Sugarloaf Mountain at sunset, Brazil 3.jpg", license: "CC0", artist: "Wilfredor" },
  2: { src: FILES["./assets/cities/2.jpg"] ?? "", file: "File:Buenos Aires-Av. 9 de julio.jpg", license: "CC BY-SA 2.0", artist: "jennifrog" },
  5: { src: FILES["./assets/cities/5.jpg"] ?? "", file: "File:Kaohsiung Port Station front view.jpg", license: "CC BY 2.5", artist: "KasugaHuang" },
  6: { src: FILES["./assets/cities/6.jpg"] ?? "", file: "File:Parque Avenida Building in Paulista Avenue.jpg", license: "CC0", artist: "Wilfredor" },
  7: { src: FILES["./assets/cities/7.jpg"] ?? "", file: "File:Lima, Peru City -- Skyline (Miraflores).jpg", license: "CC BY-SA 3.0", artist: "Donairesunovi" },
  10: { src: FILES["./assets/cities/10.jpg"] ?? "", file: "File:All Gizah Pyramids.jpg", license: "CC BY-SA 2.0", artist: "Ricardo Liberato" },
  12: { src: FILES["./assets/cities/12.jpg"] ?? "", file: "File:Cape Town City Bowl and Table Mountain at dawn.jpg", license: "CC BY-SA 3.0", artist: "Daniel Case" },
  13: { src: FILES["./assets/cities/13.jpg"] ?? "", file: "File:Jamaa El Fna, Marrakesh, Morocco, 20250124 1804 7017.jpg", license: "CC BY 4.0", artist: "Jakub Hałun" },
  14: { src: FILES["./assets/cities/14.jpg"] ?? "", file: "File:PacifiCorp 345kV Power Lines Near Jim Bridger Power Plant, Wyoming.jpg", license: "CC BY 4.0", artist: "Tony Webster" },
  15: { src: FILES["./assets/cities/15.jpg"] ?? "", file: "File:Marine Lines Mumbai 2021.jpg", license: "CC BY-SA 4.0", artist: "Dr Vikramjit Kakati" },
  16: { src: FILES["./assets/cities/16.jpg"] ?? "", file: "File:Monumen Nasional, Jakarta, Indonesia.jpg", license: "CC BY-SA 4.0", artist: "Ramayoni" },
  18: { src: FILES["./assets/cities/18.jpg"] ?? "", file: "File:Puente Helix, museo ArtScience y hotel Marina Bay Sands, Marina Bay, Singapur, 2023-08-17, DD 67-69 HDR.jpg", license: "CC BY-SA 4.0", artist: "Diego Delso" },
  19: { src: FILES["./assets/cities/19.jpg"] ?? "", file: "File:Río Chao Phraya, Bangkok, Tailandia, 2013-08-22, DD 05.jpg", license: "CC BY-SA 3.0", artist: "Diego Delso" },
  20: { src: FILES["./assets/cities/20.jpg"] ?? "", file: "File:Munich subway station Westfriedhof.jpg", license: "CC BY-SA 3.0", artist: "Martin Falbisoner" },
  21: { src: FILES["./assets/cities/21.jpg"] ?? "", file: "File:Shanghai skyline waterfront pudong 5166168 69 70.jpg", license: "CC0", artist: "Ermell" },
  22: { src: FILES["./assets/cities/22.jpg"] ?? "", file: "File:Peking verbotene Stadt-20071018-RM-162411.jpg", license: "CC BY-SA 4.0", artist: "Ermell" },
  24: { src: FILES["./assets/cities/24.jpg"] ?? "", file: "File:Minato City, Tokyo, Japan.jpg", license: "CC BY 4.0", artist: "David Kernan" },
  25: { src: FILES["./assets/cities/25.jpg"] ?? "", file: "File:Gyeonghoeru (Royal Banquet Hall) at Gyeongbokgung Palace, Seoul.jpg", license: "CC BY-SA 4.0", artist: "Frank Schulenburg" },
  27: { src: FILES["./assets/cities/27.jpg"] ?? "", file: "File:Taipei Taiwan Taipei-101-Tower-01.jpg", license: "CC BY-SA 3.0", artist: "CEphoto, Uwe Aranas" },
  28: { src: FILES["./assets/cities/28.jpg"] ?? "", file: "File:Taiwan High Speed Rail train 639 at Tainan HSR station May 2025.jpg", license: "CC BY 4.0", artist: "4300streetcar" },
  29: { src: FILES["./assets/cities/29.jpg"] ?? "", file: "File:Kaohsiung-Love-River.jpg", license: "Public domain", artist: "Taken by Henry Trotter" },
  30: { src: FILES["./assets/cities/30.jpg"] ?? "", file: "File:Taichung City Skyline, Central District 2025-11-06.jpg", license: "CC BY-SA 4.0", artist: "Foxy1219" },
  32: { src: FILES["./assets/cities/32.jpg"] ?? "", file: "File:Tainan Taiwan Fort-Provintia-01.jpg", license: "CC BY-SA 3.0", artist: "CEphoto, Uwe Aranas" },
  34: { src: FILES["./assets/cities/34.jpg"] ?? "", file: "File:Sydney Opera House and Harbour Bridge Dusk (3) 2019-06-21.jpg", license: "CC BY-SA 4.0", artist: "Benh LIEU SONG (Flickr)" },
  35: { src: FILES["./assets/cities/35.jpg"] ?? "", file: "File:Auckland CBD skyline from Waitemata Harbour entrance.jpg", license: "Public domain", artist: "Pseudopanax at English Wikipedia" },
  36: { src: FILES["./assets/cities/36.jpg"] ?? "", file: "File:Water treatment plant below Carsington Water reservoir - geograph.org.uk - 3187180.jpg", license: "CC BY-SA 2.0", artist: "Chris Morgan" },
  37: { src: FILES["./assets/cities/37.jpg"] ?? "", file: "File:Burj Khalifa Dubai, UAE at Sunset 001 by Eric Chamchoum.jpg", license: "CC BY 4.0", artist: "ECWiki1" },
  39: { src: FILES["./assets/cities/39.jpg"] ?? "", file: "File:Tour eiffel at sunrise from the trocadero.jpg", license: "CC BY-SA 3.0", artist: "Tristan Nitot" },
  40: { src: FILES["./assets/cities/40.jpg"] ?? "", file: "File:Tower Bridge London Dusk Feb 2006.jpg", license: "CC BY-SA 3.0", artist: "Diliff" },
  41: { src: FILES["./assets/cities/41.jpg"] ?? "", file: "File:Grossmünster and Limmat River, Zurich, 20250330 1239 7929.jpg", license: "CC BY 4.0", artist: "Jakub Hałun" },
  42: { src: FILES["./assets/cities/42.jpg"] ?? "", file: "File:Rome Colosseum 001.jpg", license: "CC0", artist: "Wilfredor" },
  44: { src: FILES["./assets/cities/44.jpg"] ?? "", file: "File:Lower Manhattan from Staten Island Ferry Jan 2006.jpg", license: "CC BY 2.5", artist: "Diliff" },
  45: { src: FILES["./assets/cities/45.jpg"] ?? "", file: "File:Los Angeles (California, USA), South Olive Street -- 2012 -- 4847.jpg", license: "CC BY-SA 4.0", artist: "Dietmar Rabich" },
  46: { src: FILES["./assets/cities/46.jpg"] ?? "", file: "File:Lower Manhattan from Jersey City September 2020 panorama.jpg", license: "CC BY-SA 4.0", artist: "King of Hearts" },
  47: { src: FILES["./assets/cities/47.jpg"] ?? "", file: "File:San Francisco with two bridges and the low fog.jpg", license: "CC BY-SA 3.0", artist: "Brocken Inaglory" },
};

export const tilePhoto = (index: number): TilePhoto | undefined => TILE_PHOTOS[index];
