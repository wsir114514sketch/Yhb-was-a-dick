/**
 * Full city scenes for the property detail card, where there is actually room for one.
 *
 * Each scene is a single flat drawing at 320×180: sky, the city's one identifying landmark, a ground or water plane, and a
 * little foreground to give depth. They share a palette recipe — a pale sky, mid-tone masses, a dark foreground — so 29
 * drawings by one hand look like one series instead of 29 pictures from 29 places.
 *
 * The colour comes from the region, passed in as `tint`. Nothing here is a photograph, a trademark or a national symbol:
 * these are invented skylines and landscapes that merely *suggest* a place, and the city's name is what names it.
 *
 * Original artwork. Registered in ASSETS.md.
 */

import type { JSX } from "react";

export const SCENE_W = 320;
export const SCENE_H = 180;

/**
 * One scene. `tint` is the region colour; it only ever lights the sky and a few accent faces, so the drawing stays legible
 * in both themes and the region is still recognisable.
 */
function scene(children: (tint: string, sky: string, mid: string, dark: string) => JSX.Element): (tint: string) => JSX.Element {
  return (tint: string) => {
    // Three tones derived from the tint: a very pale sky, a mid mass, and a near-black foreground. Deriving them keeps one
    // knob (the region colour) in charge of the whole picture.
    const sky = mix(tint, "#ffffff", 0.86);
    const mid = mix(tint, "#1b1f26", 0.42);
    const dark = mix(tint, "#14171c", 0.72);
    return children(tint, sky, mid, dark);
  };
}

/** Blends two hex colours; `amount` is how much of the second to take. */
function mix(a: string, b: string, amount: number): string {
  const parse = (hex: string): [number, number, number] => {
    const value = hex.replace("#", "");
    const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const channel = (x: number, y: number): string => Math.round(x + (y - x) * amount).toString(16).padStart(2, "0");
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
}

/** A cloud: two or three overlapping lobes, drawn flat. */
const Cloud = ({ x, y, s = 1 }: { x: number; y: number; s?: number }): JSX.Element => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="#ffffff" opacity=".38">
    <ellipse cx="0" cy="0" rx="16" ry="7" />
    <ellipse cx="11" cy="-4" rx="10" ry="7" />
    <ellipse cx="-11" cy="1" rx="9" ry="5.5" />
  </g>
);

/**
 * A rank of buildings receding along a baseline: a row of simple blocks with windows, which is what gives a skyline depth
 * without drawing each building by hand. `seed` varies the heights so two calls look different.
 */
const Skyline = ({ y, tone, from = 0, to = 320, count = 9, seed = 1, minH = 18, maxH = 54, opacity = 1 }: {
  y: number; tone: string; from?: number; to?: number; count?: number; seed?: number; minH?: number; maxH?: number; opacity?: number;
}): JSX.Element => {
  const span = (to - from) / count;
  return (
    <g fill={tone} opacity={opacity}>
      {Array.from({ length: count }, (_, index) => {
        // A cheap deterministic jitter: no Math.random, so the drawing is stable between renders.
        const jitter = ((index * 37 + seed * 13) % 7) / 7;
        const h = minH + jitter * (maxH - minH);
        const w = span * 0.82;
        const x = from + index * span;
        return <rect key={index} x={x} y={y - h} width={w} height={h} />;
      })}
    </g>
  );
};

/** A row of small dark windows on a lit façade, so a block reads as a building rather than a rectangle. */
const Windows = ({ x, y, cols, rows, w, h, gap = 3, fill = "#ffffff", opacity = 0.22 }: {
  x: number; y: number; cols: number; rows: number; w: number; h: number; gap?: number; fill?: string; opacity?: number;
}): JSX.Element => (
  <g fill={fill} opacity={opacity}>
    {Array.from({ length: rows }, (_, row) => (
      Array.from({ length: cols }, (_, col) => (
        <rect key={`${row}-${col}`} x={x + col * (w + gap)} y={y + row * (h + gap)} width={w} height={h} />
      ))
    ))}
  </g>
);

/** A stylised tree: a trunk and one rounded canopy. Two are enough for a foreground. */
const Tree = ({ x, y, s = 1, tone }: { x: number; y: number; s?: number; tone: string }): JSX.Element => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={tone}>
    <rect x="-1.4" y="-10" width="2.8" height="10" />
    <ellipse cx="0" cy="-18" rx="9" ry="10" />
    <ellipse cx="-6" cy="-13" rx="6" ry="7" />
    <ellipse cx="6" cy="-13" rx="6" ry="7" />
  </g>
);

/** Birds: three small strokes, the cheapest way to say "outdoors". */
const Birds = ({ x, y, tone }: { x: number; y: number; tone: string }): JSX.Element => (
  <g stroke={tone} strokeWidth="1.2" fill="none" opacity=".45">
    <path d={`M${x} ${y}q3-3 6 0M${x + 10} ${y - 4}q3-3 6 0M${x + 5} ${y + 6}q2.4-2.4 4.8 0`} />
  </g>
);

/** The scenes, keyed by tile index. */
const SCENES: Record<number, (tint: string) => JSX.Element> = {
  // ---- 南美洲 ----
  1: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={44} y={26} s={0.9} /><Cloud x={264} y={20} s={0.6} />
      <Birds x={168} y={30} tone={dark} />
      {/* A far ridge and the low skirt of the city along the far shore. */}
      <path d="M0 120 30 96l26 12 30-22 32 22 28-12 34 20 40-22 46 26 54-14v24H0Z" fill={mid} opacity=".24" />
      <Skyline y={126} tone={mid} count={13} seed={4} minH={8} maxH={19} opacity={0.36} />
      {/* Two granite domes: a round-shouldered one at the left, a steep pointed one at the right. */}
      <path d="M4 128C18 98 38 76 56 68c7-3 13 1 16 9 10 20 20 40 26 51Z" fill={mid} />
      <path d="M178 128c12-32 30-58 48-68 7-4 13 0 16 8 12 22 22 44 26 60Z" fill={dark} />
      <path d="M196 128c12-28 26-52 40-63" stroke={sky} strokeWidth="1.6" fill="none" opacity=".22" />
      <path d="M226 60c-14 16-26 42-34 68" stroke={dark} strokeWidth="1" fill="none" opacity=".45" />
      {/* The cable car: a station planted on the far summit, the span, a gondola halfway across. */}
      <rect x="62" y="64" width="20" height="12" rx="2" fill={dark} />
      <path d="M66 64v-4h12v4" stroke={dark} strokeWidth="2" fill="none" />
      <path d="M72 60 226 58" stroke={dark} strokeWidth="1.5" opacity=".7" />
      <rect x="220" y="52" width="12" height="8" rx="2" fill={dark} />
      <path d="M149 59v5" stroke={dark} strokeWidth="1.6" />
      <rect x="140" y="64" width="15" height="12" rx="2" fill={dark} />
      <rect x="143" y="67" width="9" height="4" fill={sky} opacity=".55" />
      {/* The bay: a lit waterline, then soft swell, and a boat. */}
      <rect y="128" width="320" height="52" fill={mid} opacity=".55" />
      <rect y="128" width="320" height="4" fill="#ffffff" opacity=".22" />
      {[0, 1, 2, 3].map((index) => (
        <path key={index} d={`M${14 + index * 80} ${140 + index * 8}q18-5 36 0`} stroke="#ffffff" strokeWidth="2" fill="none" opacity=".28" />
      ))}
      <path d="M204 152h26l-4 8h-18Z" fill={dark} opacity=".7" />
      <path d="M217 152v-9" stroke={dark} strokeWidth="1.6" opacity=".7" />
      {/* The near shore, with trees for scale. */}
      <rect y="172" width="320" height="8" fill={dark} opacity=".6" />
      <Tree x={24} y={173} s={1.1} tone={dark} />
      <Tree x={296} y={175} s={0.9} tone={dark} />
    </g>
  )),
  2: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={52} y={22} s={0.85} /><Cloud x={256} y={30} s={0.6} />
      <Birds x={240} y={48} tone={dark} />
      {/* Ranks of blocks down both sides of the avenue, pale far off, darker nearer. */}
      <Skyline y={118} tone={mid} count={11} seed={2} minH={26} maxH={52} opacity={0.5} />
      <Skyline y={124} tone={dark} count={8} seed={5} minH={14} maxH={28} opacity={0.24} />
      {/* The obelisk: a tapered shaft, a pyramid cap, a base set in the pavement. */}
      <path d="M153 124 157 44h7l4 80Z" fill={dark} />
      <path d="M157 44 160.5 32l3.5 12Z" fill={dark} />
      <path d="M158 124 160 46" stroke={sky} strokeWidth="1.4" opacity=".32" />
      <path d="M159 58h4M159 76h4M159 94h4" stroke={sky} strokeWidth="1.4" opacity=".28" />
      <rect x="148" y="124" width="25" height="4" fill={dark} />
      {/* The avenue: a pale band receding to a point under the obelisk, its lane dashes foreshortened. */}
      <rect y="128" width="320" height="52" fill={mid} opacity=".42" />
      <path d="M160 130 118 180h84l-42-50Z" fill={mid} opacity=".75" />
      <path d="M160 130 124 180M160 130 196 180" stroke="#ffffff" strokeWidth="2" opacity=".2" />
      <path d="M160 136v5M160 148v8M160 162v12" stroke="#ffffff" strokeWidth="2.6" opacity=".36" />
      {/* Low blocks framing the avenue at each edge, and two trees. */}
      <path d="M0 132h58v-20h20v20h26v48H0ZM254 132v-20h22v20h44v48h-66Z" fill={dark} opacity=".32" />
      <path d="M0 132h58M254 132h66" stroke={dark} strokeWidth="2" opacity=".3" />
      <rect y="174" width="320" height="6" fill={dark} opacity=".5" />
      <Tree x={26} y={176} s={0.9} tone={dark} />
      <Tree x={296} y={177} s={0.8} tone={dark} />
    </g>
  )),
  5: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={60} y={24} s={0.85} /><Cloud x={244} y={30} s={0.6} />
      <Birds x={116} y={40} tone={dark} />
      {/* The far shore and its low sheds, then the port's own warehouse rooftop. */}
      <Skyline y={118} tone={mid} count={12} seed={7} minH={10} maxH={26} opacity={0.3} />
      <path d="M0 130V102l38-14 38 14v28Z" fill={mid} opacity=".72" />
      <path d="M0 102l38-14 38 14Z" fill={dark} opacity=".3" />
      <Windows x={12} y={112} cols={4} rows={1} w={9} h={8} gap={7} fill={sky} opacity={0.4} />
      <rect x="184" y="112" width="58" height="18" fill={mid} opacity=".6" />
      {/* A container crane: mast, boom, and the box swinging under it. */}
      <path d="M246 130V58h7v72Z" fill={dark} />
      <path d="M198 64h96v5h-96Z" fill={dark} />
      <path d="M249 66 208 62M250 66l40-4" stroke={dark} strokeWidth="2" opacity=".7" />
      <path d="M212 66v42" stroke={dark} strokeWidth="1.8" opacity=".8" />
      <rect x="204" y="108" width="17" height="11" rx="1" fill={dark} opacity=".85" />
      {/* Containers stacked along the quay, stepping back towards the crane. */}
      {[[266, 118], [266, 130], [290, 124], [290, 136], [12, 134], [36, 138]].map(([x, y], index) => (
        <rect key={index} x={x} y={y} width="22" height="12" rx="1" fill={dark} opacity={index % 2 ? 0.45 : 0.6} />
      ))}
      {/* The permanent way: ballast, sleepers, two rails. */}
      <rect y="140" width="320" height="40" fill={mid} opacity=".4" />
      {Array.from({ length: 12 }, (_, index) => (
        <rect key={index} x={6 + index * 27} y="146" width="9" height="26" fill={dark} opacity=".38" />
      ))}
      <path d="M0 149h320M0 171h320" stroke={dark} strokeWidth="3" opacity=".75" />
      {/* The locomotive: cab, boiler, funnel, three coupled wheels. */}
      <path d="M96 144V110a6 6 0 0 1 6-6h22v40Z" fill={dark} />
      <rect x="126" y="114" width="68" height="30" rx="4" fill={dark} />
      <path d="M186 122h8v22h-8Z" fill={dark} opacity=".85" />
      <path d="M158 114V98h12v16Z" fill={dark} />
      <path d="M155 98h18v4h-18Z" fill={dark} />
      <rect x="136" y="106" width="12" height="8" rx="3" fill={dark} opacity=".8" />
      <rect x="103" y="115" width="16" height="14" rx="2" fill={sky} opacity=".5" />
      <path d="M96 144h-6v6h6Z" fill={dark} opacity=".7" />
      {[108, 140, 172].map((cx) => (
        <circle key={cx} cx={cx} cy={142} r="8" fill={dark} />
      ))}
      <path d="M108 142h64" stroke={sky} strokeWidth="2" opacity=".4" />
      {/* Steam trailing off to the right, which is what says the thing is moving. */}
      {[[178, 92, 9], [196, 84, 11], [218, 90, 8]].map(([cx, cy, r], index) => (
        <circle key={index} cx={cx} cy={cy} r={r} fill="#ffffff" opacity={0.34 - index * 0.07} />
      ))}
      {/* A lineside signal and the dark near edge of the yard. */}
      <path d="M310 146v-24" stroke={dark} strokeWidth="2.4" opacity=".7" />
      <rect x="306" y="118" width="8" height="6" rx="1" fill={dark} opacity=".7" />
      <rect y="172" width="320" height="8" fill={dark} opacity=".6" />
    </g>
  )),
  6: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={54} y={24} s={0.9} /><Cloud x={252} y={18} s={0.6} />
      <Birds x={200} y={36} tone={dark} />
      {/* The uphill wall of the city: a far rank, then a nearer, darker one. */}
      <Skyline y={132} tone={mid} count={12} seed={9} minH={44} maxH={78} opacity={0.4} />
      <Skyline y={138} tone={dark} count={8} seed={2} minH={26} maxH={58} opacity={0.24} />
      {/* Two slabs straddling the avenue, tall and sheer, with their window grids. */}
      <rect x="98" y="34" width="34" height="104" fill={dark} opacity=".9" />
      <rect x="98" y="34" width="34" height="8" fill={dark} />
      <Windows x={103} y={48} cols={4} rows={11} w={5} h={4} gap={3} fill={sky} opacity={0.35} />
      <rect x="170" y="58" width="28" height="80" fill={dark} opacity=".78" />
      <Windows x={175} y={68} cols={3} rows={9} w={5} h={4} gap={3} fill={sky} opacity={0.28} />
      {/* A third, pale tower behind them and a stepped one further left. */}
      <rect x="140" y="52" width="20" height="86" fill={mid} opacity=".8" />
      <rect x="60" y="66" width="26" height="72" fill={mid} opacity=".7" />
      <path d="M60 66h26v6H60Z" fill={dark} opacity=".4" />
      <rect x="214" y="72" width="30" height="66" fill={mid} opacity=".62" />
      <rect x="256" y="88" width="26" height="50" fill={mid} opacity=".5" />
      {/* The avenue between them, running to the horizon, its lane markings foreshortened. */}
      <rect y="138" width="320" height="42" fill={dark} opacity=".34" />
      <path d="M140 138 96 180h128l-44-42Z" fill={mid} opacity=".55" />
      <path d="M140 138 104 180M180 138 216 180" stroke="#ffffff" strokeWidth="2" opacity=".2" />
      <path d="M160 146v7M160 162v10M160 178v2" stroke="#ffffff" strokeWidth="2.6" opacity=".3" />
      {/* Traffic: three small cars on the near stretch, and a bus. */}
      <rect x="126" y="160" width="16" height="7" rx="2" fill={dark} />
      <rect x="182" y="152" width="16" height="7" rx="2" fill={dark} opacity=".8" />
      <rect x="150" y="172" width="20" height="8" rx="2" fill={dark} />
      <rect y="176" width="320" height="4" fill={dark} opacity=".6" />
    </g>
  )),
  7: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={212} y={18} s={0.8} /><Cloud x={288} y={44} s={0.55} />
      <Birds x={178} y={40} tone={dark} />
      {/* The bay fills the lower right; the far shore sits on its horizon. */}
      <rect y="94" width="320" height="86" fill={mid} opacity=".55" />
      <rect y="94" width="320" height="2.5" fill="#ffffff" opacity=".26" />
      <Skyline y={94} tone={mid} from={182} to={320} count={6} seed={5} minH={7} maxH={20} opacity={0.36} />
      {/* The cliff: a ragged crest high on the left, then a layered face falling into the bay. */}
      <path d="M0 52 28 48l30 6 34-6 34 8 32-6 40 26 22 46 18 60H0Z" fill={mid} opacity=".95" />
      <path d="M0 52 28 48l30 6 34-6 34 8 32-6" stroke="#ffffff" strokeWidth="2.4" fill="none" opacity=".4" />
      {/* The face is cut by short gullies, not bands — bands would read as water. Its foot is in shadow. */}
      <path d="M158 50 198 76l22 46 18 60h-14l-14-56-22-50-32-24Z" fill={dark} opacity=".22" />
      <path d="M0 162 174 154l12 26H0Z" fill={dark} opacity=".26" />
      {[[18, 62, 26], [52, 58, 34], [84, 66, 22], [112, 60, 30], [140, 68, 18]].map(([x, y, h]) => (
        <path key={x} d={`M${x} ${y}q3 ${h! / 2} 0 ${h}`} stroke={dark} strokeWidth="2" fill="none" opacity=".2" />
      ))}
      {/* The city standing along the crest, above the road. */}
      <Skyline y={52} tone={mid} from={0} to={172} count={7} seed={3} minH={18} maxH={38} opacity={0.62} />
      <rect x="46" y="16" width="19" height="36" fill={mid} opacity=".88" />
      <Windows x={50} y={22} cols={3} rows={6} w={3} h={2.6} gap={2.4} fill={sky} opacity={0.42} />
      <rect x="124" y="26" width="15" height="26" fill={mid} opacity=".72" />
      {/* The coast road along the brink: a dark ribbon, a bright rail above it, two cars on it. */}
      <path d="M-4 66 28 62l30 6 34-6 34 8 32-6 32 8" stroke={dark} strokeWidth="7.5" fill="none" opacity=".7" />
      <path d="M-4 61 28 57l30 6 34-6 34 8 32-6 32 8" stroke="#ffffff" strokeWidth="1.6" fill="none" opacity=".34" />
      <rect x="36" y="57" width="14" height="7" rx="1.5" fill={mid} opacity=".95" />
      <rect x="118" y="59" width="14" height="7" rx="1.5" fill={mid} opacity=".95" />
      {/* Surf breaking at the foot of the cliff, then the bay's long swell. */}
      <path d="M150 172q16-6 32 0M176 180q16-6 32 0" stroke="#ffffff" strokeWidth="2.2" fill="none" opacity=".46" />
      {[0, 1, 2, 3].map((index) => (
        <path key={index} d={`M${188 + index * 36} ${116 + index * 16}q16-4 32 0`} stroke="#ffffff" strokeWidth="2" fill="none" opacity=".3" />
      ))}
      {/* A fishing boat out on the bay, and trees on the crest for scale. */}
      <path d="M236 140h30l-5 10h-21Z" fill={dark} opacity=".78" />
      <path d="M251 140v-11" stroke={dark} strokeWidth="1.8" opacity=".78" />
      <path d="M251 131l8 9h-8Z" fill={dark} opacity=".55" />
      <Tree x={30} y={54} s={0.62} tone={dark} />
      <Tree x={104} y={54} s={0.55} tone={dark} />
      <path d="M0 178q22-5 44 0t44 0 44 0 44 0 44 0 44 0v2H0Z" fill="#ffffff" opacity=".14" />
    </g>
  )),

  // ---- 非洲 ----
  10: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={58} y={26} s={0.9} /><Cloud x={246} y={20} s={0.6} />
      <Birds x={214} y={44} tone={dark} />
      {/* Dunes in three receding bands, so the desert has depth rather than being a flat plateau. */}
      <path d="M0 118q54-22 108-6t106-4 106 12v60H0Z" fill={mid} opacity=".28" />
      <path d="M0 132q60-16 118-2t98-6 104 14v42H0Z" fill={mid} opacity=".42" />
      {/* Three pyramids: the nearest large and lit on one face, the far two smaller and hazier. */}
      <path d="M14 148 86 52l78 96Z" fill={dark} />
      <path d="M86 52l78 96h-40Z" fill="#000000" opacity=".2" />
      <path d="M138 148l40-52 42 52Z" fill={dark} opacity=".8" />
      <path d="M138 148l40-52 12 15-28 37Z" fill="#ffffff" opacity=".07" />
      <path d="M228 148l26-34 28 34Z" fill={mid} opacity=".55" />
      {/* The river: one bright band across the middle distance, with a felucca sail on it. */}
      <rect y="120" width="320" height="9" fill="#ffffff" opacity=".24" />
      <path d="M52 120v-9l11 9Z" fill={dark} opacity=".55" />
      <path d="M44 120h30l-4 3H48Z" fill={dark} opacity=".45" />
      {/* The near ground, in shade, with a caravan crossing it. */}
      <rect y="148" width="320" height="32" fill={mid} opacity=".5" />
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <path key={index} d={`M${index * 62} ${158 + (index % 2) * 5}q28-7 56 0`} stroke={dark} strokeWidth="1.4" fill="none" opacity=".22" />
      ))}
      {/* A camel train: three humped silhouettes, the cheapest way to say where this is. */}
      {[0, 1, 2].map((index) => {
        const x = 78 + index * 26;
        return (
          <g key={index} fill={dark} opacity=".62">
            <ellipse cx={x} cy={168} rx="7" ry="3.4" />
            <path d={`M${x - 6} 168l1 6h1.6l1-6M${x + 4} 168l1 6h1.6l1-6`} />
            <path d={`M${x + 7} 167q3-1 3-4`} stroke={dark} strokeWidth="1.4" fill="none" />
          </g>
        );
      })}
      <rect y="174" width="320" height="6" fill={dark} opacity=".4" />
      <Tree x={292} y={174} s={0.85} tone={dark} />
    </g>
  )),
  12: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={74} y={28} s={0.85} /><Cloud x={252} y={20} s={0.6} />
      <Birds x={206} y={44} tone={dark} />
      {/* The two seas either side, seen between the mountain and the shore. */}
      <rect y="116" width="320" height="14" fill="#ffffff" opacity=".26" />
      {/* The flat-topped mountain, with its banded strata and the cableway running to the summit. */}
      <path d="M34 152 84 46h116l48 106Z" fill={mid} opacity=".92" />
      <path d="M84 46h116v16H84Z" fill={dark} opacity=".3" />
      <path d="M84 62h116v5H84ZM84 82h116v4H84Z" fill={dark} opacity=".16" />
      <path d="M118 46l10-22 12 22Z" fill={dark} opacity=".45" />
      {/* The cable car: a line up the face and one cabin on it. */}
      <path d="M140 44 96 132" stroke={dark} strokeWidth="1.2" opacity=".45" />
      <rect x="110" y="88" width="13" height="9" rx="2" fill={dark} />
      {/* The city skirt along the foot, in two ranks, with the harbour works. */}
      <Skyline y={152} tone={dark} count={12} seed={8} minH={10} maxH={26} opacity={0.5} />
      <rect y="152" width="320" height="28" fill={mid} opacity=".55" />
      {[0, 1, 2, 3].map((index) => (
        <rect key={index} x={18 + index * 78} y={140 + (index % 2) * 4} width="34" height="18" fill={dark} opacity=".4" />
      ))}
      <path d="M0 162q40-5 80 0t80 0 80 0 80 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".26" />
      <rect y="172" width="320" height="8" fill={dark} opacity=".45" />
      <Tree x={300} y={176} s={0.7} tone={dark} />
    </g>
  )),
  13: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={246} y={28} s={0.8} />
      {/* The square minaret, the mud-brick walls, awnings across the foreground. */}
      <path d="M0 66h320v84H0Z" fill={mid} opacity=".32" />
      <path d="M132 46h40v104h-40Z" fill={dark} />
      <path d="M128 46l24-26 24 26Z" fill={dark} />
      <rect x="140" y="60" width="24" height="24" rx="3" fill={sky} opacity=".45" />
      <rect x="140" y="96" width="24" height="18" rx="3" fill={sky} opacity=".35" />
      <path d="M0 118h320v10H0Z" fill={mid} opacity=".5" />
      {/* Awnings: alternating triangles, the market front. */}
      {Array.from({ length: 8 }, (_, index) => (
        <g key={index}>
          <path d={`M${index * 40} 128h40v20h-40Z`} fill={index % 2 ? mid : dark} opacity=".75" />
          <path d={`M${index * 40} 128l20 14 20-14Z`} fill="#ffffff" opacity=".14" />
        </g>
      ))}
      <rect y="148" width="320" height="32" fill={dark} opacity=".55" />
    </g>
  )),
  14: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={64} y={34} s={0.75} /><Cloud x={258} y={26} s={0.6} />
      <Birds x={36} y={54} tone={dark} />
      {/* A town behind: the thing the power is for. */}
      <Skyline y={140} tone={mid} count={10} seed={7} minH={18} maxH={44} opacity={0.4} />
      {/* Two pylons, a tall one near and a shorter one far, with the lines strung between and away. */}
      <path d="M96 142 82 62h7l10 68 10-68h7l-14 80Z" fill={dark} opacity=".7" />
      <path d="M86 84h20M88 104h16" stroke={dark} strokeWidth="1.8" opacity=".55" />
      <path d="M172 150 150 34h10l18 96 20-96h10l-24 116Z" fill={dark} />
      <path d="M154 68h56M158 96h48M162 122h42" stroke={dark} strokeWidth="2.6" opacity=".85" />
      {/* The conductors: four long catenaries sweeping out of frame on both sides. */}
      <path d="M0 74q80-16 152-38M0 90q80-14 152-32M320 74q-80-16-196-38M320 90q-80-14-196-32"
        stroke={dark} strokeWidth="1.4" fill="none" opacity=".42" />
      {/* Insulator strings hanging off the crossarms, the detail that makes it read as a pylon. */}
      {[0, 1, 2, 3].map((index) => (
        <g key={index} stroke={dark} strokeWidth="1.2" opacity=".5">
          <path d={`M${164 + index * 12} 68v6M${164 + index * 12} 96v5`} />
        </g>
      ))}
      {/* The substation at the base: a transformer block, a fenced yard, a warning lamp. */}
      <rect y="142" width="320" height="38" fill={mid} opacity=".5" />
      <rect x="240" y="118" width="46" height="24" fill={dark} opacity=".55" />
      <path d="M240 118h46v4h-46Z" fill={dark} opacity=".7" />
      <circle cx="263" cy="112" r="2.4" fill="#ffffff" opacity=".5" />
      <rect x="26" y="122" width="34" height="20" fill={dark} opacity=".45" />
      <path d="M26 122h34v3H26Z" fill={dark} opacity=".6" />
      <path d="M18 142h274" stroke={dark} strokeWidth="1.4" opacity=".3" />
      <rect y="172" width="320" height="8" fill={dark} opacity=".35" />
    </g>
  )),

  // ---- 南亚与东南亚 ----
  15: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={54} y={26} s={0.9} /><Cloud x={252} y={20} s={0.65} />
      <Birds x={212} y={44} tone={dark} />
      {/* The bay city behind, in two ranks, so the gateway has something to stand against. */}
      <Skyline y={122} tone={mid} count={12} seed={2} minH={20} maxH={40} opacity={0.48} />
      <Skyline y={128} tone={dark} count={9} seed={5} minH={12} maxH={26} opacity={0.28} />
      {/* The gateway: a crenellated stone body, a tall central arch between two smaller ones, corner turrets
          with domed caps and finials, and a small dome over the middle. */}
      <path d="M88 130V80h144v50Z" fill={dark} />
      <path d="M144 130v-24a16 16 0 0 1 32 0v24Z" fill={sky} opacity=".5" />
      <path d="M108 130v-12a7 7 0 0 1 14 0v12ZM198 130v-12a7 7 0 0 1 14 0v12Z" fill={sky} opacity=".38" />
      <Windows x={100} y={88} cols={2} rows={3} w={6} h={5} gap={7} fill="#ffffff" opacity={0.16} />
      <Windows x={188} y={88} cols={2} rows={3} w={6} h={5} gap={7} fill="#ffffff" opacity={0.16} />
      <rect x="82" y="72" width="156" height="8" rx="2" fill={dark} />
      <rect x="80" y="64" width="16" height="66" fill={dark} />
      <rect x="224" y="64" width="16" height="66" fill={dark} />
      <circle cx="88" cy="60" r="8" fill={dark} /><rect x="86.8" y="46" width="2.4" height="8" fill={dark} />
      <circle cx="232" cy="60" r="8" fill={dark} /><rect x="230.8" y="46" width="2.4" height="8" fill={dark} />
      <circle cx="160" cy="58" r="11" fill={dark} /><rect x="158.6" y="42" width="2.8" height="10" fill={dark} />
      {/* The harbour in front, with the gateway repeated in it as a soft, soft-edged band. */}
      <rect y="130" width="320" height="50" fill={mid} opacity=".5" />
      <rect y="130" width="320" height="7" fill="#ffffff" opacity=".22" />
      <path d="M92 137h136v6q-34 6-68 4t-68-5Z" fill={dark} opacity=".14" />
      <path d="M0 154q40-8 80 0t80 0 80 0 80 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".3" />
      <path d="M0 168q40-7 80 0t80 0 80 0 80 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".18" />
      {/* Two boats working across the harbour, one near, one far. */}
      {[{ x: 28, y: 156, s: 1 }, { x: 232, y: 148, s: 0.72 }].map((boat) => (
        <g key={boat.x} transform={`translate(${boat.x} ${boat.y}) scale(${boat.s})`} fill={dark} opacity=".55">
          <path d="M0 0h50l-9 10H9Z" />
          <path d="M26 0v-22l15 22Z" />
        </g>
      ))}
      <rect y="172" width="320" height="8" fill={dark} opacity=".55" />
      <Tree x={24} y={178} s={1.1} tone={dark} />
      <Tree x={296} y={178} s={0.95} tone={dark} />
      <Tree x={58} y={178} s={0.7} tone={dark} />
    </g>
  )),
  16: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={52} y={26} s={0.85} /><Cloud x={250} y={20} s={0.6} />
      <Birds x={186} y={40} tone={dark} />
      {/* A packed low city behind the canal, in two ranks. */}
      <Skyline y={104} tone={mid} count={13} seed={4} minH={14} maxH={34} opacity={0.32} />
      <Skyline y={110} tone={dark} count={10} seed={7} minH={8} maxH={20} opacity={0.22} />
      {/* The left bank: a tall house on posts, a lower one behind it. Both have wide overhanging roofs. */}
      <rect x="8" y="70" width="54" height="40" fill={mid} opacity=".8" />
      <path d="M0 70 35 44 70 70Z" fill={dark} opacity=".85" />
      <Windows x={16} y={78} cols={2} rows={2} w={9} h={8} gap={7} fill={sky} opacity={0.4} />
      <path d="M12 110v22M26 110v20M44 110v22M56 110v20" stroke={dark} strokeWidth="2.5" opacity=".8" />
      <rect x="62" y="84" width="44" height="28" fill={mid} opacity=".6" />
      <path d="M56 84 84 62 112 84Z" fill={dark} opacity=".55" />
      <Windows x={68} y={90} cols={2} rows={1} w={9} h={7} gap={6} fill={sky} opacity={0.3} />
      <path d="M66 112v16M100 112v16" stroke={dark} strokeWidth="2" opacity=".55" />
      {/* The right bank, the same idea mirrored and stepped back. */}
      <rect x="250" y="72" width="58" height="40" fill={mid} opacity=".8" />
      <path d="M242 72 279 44 316 72Z" fill={dark} opacity=".85" />
      <Windows x={258} y={80} cols={2} rows={2} w={10} h={8} gap={7} fill={sky} opacity={0.4} />
      <path d="M254 112v22M270 112v20M290 112v22M304 112v20" stroke={dark} strokeWidth="2.5" opacity=".8" />
      <rect x="206" y="88" width="46" height="26" fill={mid} opacity=".6" />
      <path d="M200 88 229 68 258 88Z" fill={dark} opacity=".55" />
      <Windows x={212} y={94} cols={2} rows={1} w={9} h={7} gap={6} fill={sky} opacity={0.3} />
      <path d="M210 114v14M248 114v14" stroke={dark} strokeWidth="2" opacity=".55" />
      {/* The canal: a bright line at the waterline, the houses repeated in it as soft bands. */}
      <rect y="126" width="320" height="54" fill={mid} opacity=".62" />
      <rect y="126" width="320" height="5" fill="#ffffff" opacity=".24" />
      <rect x="12" y="131" width="50" height="17" fill={dark} opacity=".12" />
      <rect x="254" y="131" width="54" height="17" fill={dark} opacity=".12" />
      {/* A working boat under its awning, and a second one slipping past further off. */}
      <path d="M112 154h72l-11 13h-50Z" fill={dark} />
      <rect x="120" y="140" width="50" height="7" rx="3" fill={dark} opacity=".85" />
      <path d="M124 147v7M166 147v7" stroke={dark} strokeWidth="2" />
      <path d="M226 142h40l-7 8h-26Z" fill={dark} opacity=".5" />
      <path d="M0 146q30-6 60 0t60 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".26" />
      <path d="M156 168q34-6 68 0t68 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".2" />
      {/* The near quay, and trees on it to frame the shot. */}
      <rect y="172" width="320" height="8" fill={dark} opacity=".55" />
      <Tree x={24} y={178} s={1.05} tone={dark} />
      <Tree x={298} y={178} s={0.95} tone={dark} />
      <Tree x={60} y={178} s={0.68} tone={dark} />
    </g>
  )),
  18: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={46} y={26} s={0.85} /><Cloud x={262} y={20} s={0.6} />
      <Birds x={196} y={34} tone={dark} />
      {/* The low city behind, two ranks, so the three towers rise out of something. */}
      <Skyline y={126} tone={mid} count={12} seed={2} minH={18} maxH={40} opacity={0.38} />
      <Skyline y={132} tone={dark} count={9} seed={6} minH={10} maxH={24} opacity={0.24} />
      {/* Three slab towers, the middle one tallest, each set on a wide podium. The outer two are lit, the middle is not,
          so the group still reads as a trio rather than one mass. */}
      <rect x="70" y="58" width="42" height="84" rx="3" fill={mid} opacity=".85" />
      <rect x="136" y="46" width="44" height="96" rx="3" fill={dark} />
      <rect x="204" y="58" width="42" height="84" rx="3" fill={mid} opacity=".85" />
      <Windows x={77} y={66} cols={3} rows={11} w={8} h={4} gap={6} fill={dark} opacity={0.3} />
      <Windows x={144} y={56} cols={3} rows={12} w={8} h={4} gap={6} fill="#ffffff" opacity={0.24} />
      <Windows x={211} y={66} cols={3} rows={11} w={8} h={4} gap={6} fill={dark} opacity={0.3} />
      {/* The sky garden: one long deck laid across all three, overhanging both ends, with a rail along its lip. */}
      <rect x="58" y="46" width="200" height="10" rx="4" fill={dark} />
      <rect x="58" y="46" width="200" height="3" rx="1.5" fill="#ffffff" opacity=".28" />
      <rect x="74" y="56" width="6" height="6" fill={dark} opacity=".7" />
      <rect x="238" y="56" width="6" height="6" fill={dark} opacity=".7" />
      {/* The middle tower's crown and mast above the deck. */}
      <rect x="150" y="28" width="18" height="18" rx="2" fill={dark} />
      <path d="M157.4 28V13h3.4v15Z" fill={dark} />
      <circle cx="159" cy="12" r="2" fill={dark} />
      {/* The podiums, standing in the water on their own reflection. */}
      <rect x="62" y="140" width="58" height="8" fill={dark} opacity=".8" />
      <rect x="128" y="140" width="60" height="8" fill={dark} opacity=".9" />
      <rect x="196" y="140" width="58" height="8" fill={dark} opacity=".8" />
      {/* The bay: a bright horizon line, then long swell and three soft reflections. */}
      <rect y="148" width="320" height="32" fill={mid} opacity=".6" />
      <rect y="148" width="320" height="4" fill="#ffffff" opacity=".24" />
      <rect x="76" y="152" width="32" height="22" fill={dark} opacity=".14" />
      <rect x="142" y="152" width="34" height="24" fill={dark} opacity=".16" />
      <rect x="210" y="152" width="32" height="22" fill={dark} opacity=".14" />
      <path d="M0 166q30-6 60 0t80 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".3" />
      <path d="M200 172q30-6 60 0t60 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".22" />
      {/* A work boat crossing below the towers. */}
      <path d="M28 156h44l-7 9H35Z" fill={dark} opacity=".55" />
      <rect x="36" y="146" width="20" height="6" rx="2" fill={dark} opacity=".45" />
      {/* The near bank, and trees for scale. */}
      <rect y="172" width="320" height="8" fill={dark} opacity=".55" />
      <Tree x={22} y={178} s={1.05} tone={dark} />
      <Tree x={296} y={178} s={0.95} tone={dark} />
      <Tree x={54} y={178} s={0.66} tone={dark} />
    </g>
  )),
  19: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={50} y={24} s={0.85} /><Cloud x={256} y={30} s={0.6} />
      <Birds x={186} y={36} tone={dark} />
      {/* The far bank, low and even. */}
      <Skyline y={112} tone={mid} count={12} seed={3} minH={10} maxH={26} opacity={0.3} />
      {/* The temple: a stepped base, then a spire of five shrinking rings, each with a flared eave, a finial on top,
          and two smaller spires flanking it so the group reads as a temple rather than a single arrow. */}
      <path d="M132 122v-10h56v10Z" fill={dark} opacity=".75" />
      <path d="M134 112v-9h52v9Z" fill={dark} opacity=".85" />
      <path d="M138 103V94h44v9Z" fill={dark} />
      <path d="M142 94V85h36v9Z" fill={dark} opacity=".9" />
      <path d="M147 85V77h26v8Z" fill={dark} opacity=".85" />
      <path d="M151 77V70h18v7Z" fill={dark} opacity=".8" />
      <path d="M154 70V64h12v6Z" fill={dark} opacity=".75" />
      <path d="M157 64V59h6v5Z" fill={dark} opacity=".7" />
      <path d="M160 59V44" stroke={dark} strokeWidth="2.6" />
      <circle cx="160" cy="42" r="2.6" fill={dark} />
      {/* The flared eaves: each ring's lip oversails the one below it. */}
      <path d="M126 112h68M130 103h60M134 94h52M140 85h40M145 77h30M150 70h20" stroke={dark} strokeWidth="2.4" opacity=".55" />
      {/* The two flanking spires. */}
      {[{ x: 96, h: 44 }, { x: 224, h: 44 }].map((spire) => (
        <g key={spire.x} fill={dark} opacity=".7">
          <path d={`M${spire.x - 12} 122h24l-4-9h-16Z`} />
          <path d={`M${spire.x - 8} 113h16l-3-9h-10Z`} />
          <path d={`M${spire.x - 5} 104h10l-2-8h-6Z`} />
          <path d={`M${spire.x - 2} 96h4l-2-${spire.h / 2}Z`} />
        </g>
      ))}
      {/* The steps down to the water. */}
      <path d="M100 122h120v6H100Z" fill={dark} opacity=".5" />
      {/* The river: a bright line at the waterline, then long even swell. */}
      <rect y="128" width="320" height="52" fill={mid} opacity=".6" />
      <rect y="128" width="320" height="5" fill="#ffffff" opacity=".24" />
      <rect x="146" y="133" width="28" height="31" fill={dark} opacity=".14" />
      {/* Two long-tail boats, one near and one slipping away under the far bank. */}
      <g fill={dark}>
        <path d="M40 152h96l-12 12H52Z" />
        <path d="M70 152v-10h38v10Z" opacity=".8" />
        <path d="M108 152h26l-5-5h-21Z" opacity=".8" />
        <path d="M80 142v-9h2.4v9Z" />
      </g>
      <g fill={dark} opacity=".5">
        <path d="M212 138h54l-7 7h-40Z" />
        <path d="M230 138v-5h14v5Z" />
      </g>
      <path d="M0 162q30-6 60 0t60 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".3" />
      <path d="M156 172q34-6 68 0t68 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".2" />
      {/* The near bank, with trees framing the temple. */}
      <rect y="172" width="320" height="8" fill={dark} opacity=".55" />
      <Tree x={20} y={178} s={1.05} tone={dark} />
      <Tree x={300} y={178} s={0.9} tone={dark} />
      <Tree x={52} y={178} s={0.65} tone={dark} />
    </g>
  )),
  20: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={72} y={22} s={0.85} /><Cloud x={252} y={36} s={0.6} />
      <Birds x={190} y={40} tone={dark} />
      {/* The city behind the viaduct, two ranks so the high line is not floating on nothing. */}
      <Skyline y={128} tone={mid} count={11} seed={9} minH={20} maxH={48} opacity={0.4} />
      <Skyline y={134} tone={dark} count={9} seed={4} minH={10} maxH={26} opacity={0.22} />
      {/* The elevated loop: the deck, then the underside in shadow, then the piers holding it up. */}
      <path d="M-24 112q172-56 368 0v9q-196-56-368 0Z" fill={dark} />
      <path d="M-24 112q172-56 368 0" stroke={sky} strokeWidth="1.6" fill="none" opacity=".3" />
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <rect key={index} x={12 + index * 60} y="120" width="9" height={38 + (index % 2) * 6} fill={dark} opacity=".48" />
      ))}
      {/* A train on the deck, mid-curve: a driving car and two coaches, with lit windows. */}
      <g transform="translate(128 74) rotate(-3)">
        <rect x="0" y="0" width="34" height="17" rx="4" fill={dark} />
        <rect x="38" y="1" width="30" height="15" rx="3" fill={dark} opacity=".85" />
        <rect x="72" y="2" width="28" height="14" rx="3" fill={dark} opacity=".72" />
        <Windows x={5} y={4} cols={4} rows={1} w={5} h={5} gap={3} fill="#ffffff" opacity={0.42} />
        <Windows x={42} y={5} cols={3} rows={1} w={5} h={4} gap={3} fill="#ffffff" opacity={0.34} />
        <Windows x={76} y={6} cols={3} rows={1} w={5} h={4} gap={2} fill="#ffffff" opacity={0.28} />
        <rect x="2" y="17" width="96" height="2.5" fill={dark} opacity=".6" />
      </g>
      {/* The street below: a road, two lamps, and a few cars waiting at the crossing. */}
      <rect y="158" width="320" height="22" fill={mid} opacity=".5" />
      <path d="M0 168h320" stroke="#ffffff" strokeWidth="1.4" opacity=".16" />
      <rect x="60" y="158" width="7" height="22" fill={dark} opacity=".5" />
      <rect x="228" y="158" width="7" height="22" fill={dark} opacity=".5" />
      <rect x="40" y="172" width="18" height="7" rx="2" fill={dark} opacity=".55" />
      <rect x="176" y="172" width="22" height="8" rx="2" fill={dark} opacity=".5" />
      <rect x="260" y="173" width="16" height="6" rx="2" fill={dark} opacity=".45" />
      <Tree x={14} y={178} s={0.7} tone={dark} />
      <Tree x={306} y={178} s={0.65} tone={dark} />
    </g>
  )),

  // ---- 东亚 ----
  21: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={48} y={24} s={0.9} /><Cloud x={256} y={30} s={0.65} />
      <Birds x={198} y={50} tone={dark} />
      {/* The far bank in two ranks, with a taller stepped mass on either side so it is not one flat wall of blocks. */}
      <Skyline y={130} tone={mid} count={13} seed={5} minH={16} maxH={38} opacity={0.42} />
      <Skyline y={136} tone={dark} count={10} seed={2} minH={8} maxH={22} opacity={0.24} />
      <rect x="18" y="86" width="24" height="44" fill={mid} opacity=".62" />
      <rect x="24" y="70" width="12" height="18" fill={mid} opacity=".62" />
      <rect x="272" y="78" width="28" height="52" fill={mid} opacity=".58" />
      <rect x="280" y="62" width="14" height="18" fill={mid} opacity=".58" />
      {/* The tower: a shaft that tapers from a wide foot to a narrow neck, crowned by two great spheres, then a mast.
          Drafted from the silhouette inwards so the outline alone says which tower it is. */}
      <path d="M138 130 154 88h12l16 42Z" fill={dark} />
      <path d="M146 114 156 92M174 114 164 92" stroke={sky} strokeWidth="1.4" opacity=".2" />
      <rect x="154" y="46" width="12" height="46" fill={dark} />
      <circle cx="160" cy="86" r="14" fill={dark} />
      <circle cx="160" cy="52" r="9" fill={dark} />
      <circle cx="160" cy="86" r="14" fill="none" stroke="#ffffff" strokeWidth="1.2" opacity=".16" />
      <path d="M158.4 22h3.2v24h-3.2Z" fill={dark} />
      <circle cx="160" cy="20" r="2.2" fill={dark} />
      {/* The quay, then the river bend, with the tower repeated in it as a soft band. */}
      <rect y="130" width="320" height="9" fill={mid} opacity=".6" />
      <rect y="139" width="320" height="35" fill={mid} opacity=".5" />
      <rect y="139" width="320" height="4" fill="#ffffff" opacity=".22" />
      <rect x="146" y="143" width="28" height="27" fill={dark} opacity=".16" />
      <circle cx="160" cy="152" r="8" fill={dark} opacity=".12" />
      {[0, 1, 2, 3].map((index) => (
        <path key={index} d={`M${14 + index * 80} ${152 + index * 6}q18-4 36 0`} stroke="#ffffff" strokeWidth="2" fill="none" opacity=".26" />
      ))}
      {/* A barge working up the river. */}
      <path d="M204 158h58l-9 10h-41Z" fill={dark} opacity=".5" />
      <rect x="216" y="150" width="30" height="8" rx="2" fill={dark} opacity=".4" />
      {/* The near bank, and trees which frame the shot and give the tower its scale. */}
      <rect y="174" width="320" height="6" fill={dark} opacity=".6" />
      <Tree x={22} y={178} s={1.1} tone={dark} />
      <Tree x={298} y={178} s={0.95} tone={dark} />
      <Tree x={56} y={178} s={0.7} tone={dark} />
    </g>
  )),
  22: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={44} y={24} s={0.85} /><Cloud x={258} y={32} s={0.6} />
      <Birds x={196} y={44} tone={dark} />
      {/* The city behind, in two ranks, so the gate stands against a wall of roofs rather than empty sky. */}
      <Skyline y={124} tone={mid} count={12} seed={2} minH={16} maxH={36} opacity={0.36} />
      <Skyline y={130} tone={dark} count={9} seed={5} minH={8} maxH={20} opacity={0.22} />
      {/* The gate tower on the axis: a battered stone base pierced by one arched opening, a balustraded terrace,
          then a hall under two flared roofs, with a ridge and finials on top. */}
      <rect x="116" y="112" width="88" height="20" fill={dark} />
      <path d="M144 132v-14a16 16 0 0 1 32 0v14Z" fill={sky} opacity=".5" />
      <rect x="112" y="108" width="96" height="5" fill={dark} opacity=".75" />
      {/* The hall: a windowed face, then the lower eave sweeping out past it. */}
      <rect x="130" y="86" width="60" height="22" fill={dark} />
      <Windows x={138} y={92} cols={4} rows={2} w={6} h={5} gap={7} fill={sky} opacity={0.34} />
      <path d="M104 86h112l-14-14H118Z" fill={dark} opacity=".92" />
      <path d="M104 86q56 5 112 0" stroke={dark} strokeWidth="2.4" fill="none" opacity=".8" />
      {/* The upper storey, then the top roof, drawn wider and shallower so it reads as the second tier. */}
      <rect x="140" y="62" width="40" height="12" fill={dark} opacity=".9" />
      <path d="M118 62h84l-13-13h-58Z" fill={dark} />
      <path d="M118 62q42 5 84 0" stroke={dark} strokeWidth="2.2" fill="none" opacity=".75" />
      <path d="M146 49h28v-7h-28Z" fill={dark} opacity=".85" />
      <path d="M158 42V30" stroke={dark} strokeWidth="2.6" />
      <circle cx="160" cy="28" r="2.4" fill={dark} />
      {/* The flanking roofs and the long wall running away to both sides. */}
      <path d="M28 124V106h56v18Z" fill={dark} opacity=".38" />
      <path d="M18 106h76l-10-11H28Z" fill={dark} opacity=".34" />
      <path d="M236 124V106h56v18Z" fill={dark} opacity=".38" />
      <path d="M226 106h76l-10-11h-56Z" fill={dark} opacity=".34" />
      <rect y="132" width="320" height="6" fill={dark} opacity=".5" />
      {/* The avenue running out towards us, and the courtyard in front of the gate. */}
      <rect y="138" width="320" height="42" fill={mid} opacity=".5" />
      <rect y="138" width="320" height="4" fill="#ffffff" opacity=".16" />
      <path d="M128 180 154 138h12l26 42Z" fill={dark} opacity=".16" />
      <path d="M128 180 154 138M192 180 166 138" stroke="#ffffff" strokeWidth="1.6" opacity=".26" />
      <path d="M0 154h120M200 154h120" stroke="#ffffff" strokeWidth="2" opacity=".16" />
      <Tree x={20} y={152} s={0.8} tone={dark} />
      <Tree x={300} y={152} s={0.8} tone={dark} />
      {/* Two lanterns on the approach, the only warm points in the frame. */}
      {[122, 198].map((x) => (
        <g key={x} fill={dark} opacity=".6">
          <rect x={x - 1.2} y="152" width="2.4" height="14" />
          <ellipse cx={x} cy="150" rx="4" ry="5" />
        </g>
      ))}
      <rect y="172" width="320" height="8" fill={dark} opacity=".55" />
      <Tree x={44} y={178} s={1.15} tone={dark} />
      <Tree x={276} y={178} s={1.05} tone={dark} />
    </g>
  )),
  24: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={44} y={26} s={0.85} /><Cloud x={254} y={20} s={0.6} />
      <Birds x={200} y={44} tone={dark} />
      {/* The city, two ranks, low enough that the tower owns the frame. */}
      <Skyline y={144} tone={mid} count={13} seed={3} minH={18} maxH={40} opacity={0.4} />
      <Skyline y={150} tone={dark} count={10} seed={7} minH={10} maxH={24} opacity={0.24} />
      {/* The lattice tower: two curved legs drawing in to a waist and out again, braced by four cross members,
          two enclosed decks, and a slim mast with a gallery. The taper is the whole silhouette. */}
      <path d="M132 144c10-16 18-44 22-84h12c4 40 12 68 22 84h-12c-8-18-14-46-16-78-2 32-8 60-16 78Z" fill={dark} />
      <path d="M136 124h48M140 104h40M144 84h32M148 68h24" stroke={dark} strokeWidth="2" opacity=".62" />
      <path d="M150 144 160 100 170 144" stroke={dark} strokeWidth="1.4" fill="none" opacity=".35" />
      <rect x="143" y="92" width="34" height="7" rx="1.5" fill={dark} />
      <rect x="148" y="62" width="24" height="6" rx="1.5" fill={dark} />
      <path d="M158.4 26h3.2v38h-3.2Z" fill={dark} />
      <rect x="152" y="34" width="16" height="2.4" fill={dark} opacity=".7" />
      <rect x="154" y="44" width="12" height="2.2" fill={dark} opacity=".7" />
      <circle cx="160" cy="25" r="2" fill={dark} />
      {/* Blossom: pale dots drifting across, the only nod to the season. */}
      {Array.from({ length: 14 }, (_, index) => (
        <circle key={index} cx={16 + index * 22} cy={34 + ((index * 5) % 46)} r="1.8" fill="#ffffff" opacity=".34" />
      ))}
      {/* The ground, a park strip in front, its low rail, then the near bank. */}
      <rect y="144" width="320" height="36" fill={mid} opacity=".5" />
      <rect y="144" width="320" height="4" fill="#ffffff" opacity=".18" />
      <path d="M0 160h320" stroke={dark} strokeWidth="2" opacity=".35" />
      {[0, 1, 2, 3].map((index) => (
        <path key={index} d={`M${12 + index * 84} ${166 + (index % 2) * 5}q16-4 32 0`} stroke="#ffffff" strokeWidth="1.8" fill="none" opacity=".2" />
      ))}
      <rect y="172" width="320" height="8" fill={dark} opacity=".55" />
      <Tree x={24} y={178} s={1.1} tone={dark} />
      <Tree x={296} y={178} s={1} tone={dark} />
      <Tree x={60} y={178} s={0.7} tone={dark} />
      <Tree x={262} y={178} s={0.66} tone={dark} />
    </g>
  )),
  25: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={40} y={24} s={0.85} /><Cloud x={256} y={30} s={0.6} />
      <Birds x={196} y={46} tone={dark} />
      {/* Hills behind, the modern city in front of them, then the palace gate. */}
      <path d="M0 96 46 62l52 34 40-24 48 28 44-30 90 40v40H0Z" fill={mid} opacity=".28" />
      <Skyline y={126} tone={mid} count={11} seed={4} minH={14} maxH={34} opacity={0.34} />
      {/* A modern tower on one side, so the old gate is framed by the new city. */}
      <rect x="252" y="52" width="30" height="76" fill={dark} opacity=".55" />
      <Windows x={258} y={60} cols={3} rows={9} w={5} h={4} gap={4} fill="#ffffff" opacity={0.2} />
      <rect x="258" y="42" width="18" height="10" fill={dark} opacity=".5" />
      <rect x="266" y="30" width="2.6" height="12" fill={dark} opacity=".5" />
      {/* The palace gate: a stone base with three doorways, timber columns, and two stacked hipped roofs whose
          eaves lift at the corners, on a bracket band. */}
      <rect x="76" y="102" width="160" height="44" fill={dark} />
      <path d="M108 146v-20a12 12 0 0 1 24 0v20ZM148 146v-22a12 12 0 0 1 24 0v22ZM188 146v-20a12 12 0 0 1 24 0v20Z" fill={sky} opacity=".42" />
      <path d="M100 102v44M136 102v44M184 102v44M220 102v44" stroke={sky} strokeWidth="1.8" opacity=".14" />
      <rect x="70" y="94" width="172" height="9" rx="2" fill={dark} />
      {/* The bracket band, drawn as a row of blocks under the eave. */}
      {Array.from({ length: 10 }, (_, index) => (
        <rect key={index} x={80 + index * 16} y="90" width="9" height="5" fill={dark} opacity=".7" />
      ))}
      {/* The lower roof: a wide shallow gable whose eave corners flick up. Two tiers step in as they rise, which is
          what makes the gate read as a gate. */}
      <path d="M44 94 84 74h152l40 20Z" fill={dark} />
      <path d="M44 94q-5 2-7 8 7-2 9-6ZM276 94q5 2 7 8-7-2-9-6Z" fill={dark} />
      <path d="M44 94h232" stroke={dark} strokeWidth="2.4" opacity=".9" />
      {/* The upper storey, then the second roof, smaller and set back. */}
      <rect x="96" y="56" width="128" height="18" fill={dark} opacity=".95" />
      <Windows x={106} y={60} cols={5} rows={2} w={10} h={4} gap={8} fill={sky} opacity={0.26} />
      <path d="M78 56 112 40h96l34 16Z" fill={dark} />
      <path d="M78 56q-4 2-6 7 6-2 8-5ZM242 56q4 2 6 7-6-2-8-5Z" fill={dark} />
      <rect x="110" y="34" width="100" height="6" rx="2" fill={dark} />
      {/* The ridge ends turn up into two small finials, sitting on the ridge itself, not floating above it. */}
      <path d="M112 34q-3 1-5 5 4-1 6-3ZM208 34q3 1 5 5-4-1-6-3Z" fill={dark} />
      {/* The courtyard: stone paving, a low balustrade, and the steps up to the doors. */}
      <rect y="146" width="320" height="34" fill={mid} opacity=".52" />
      <rect y="146" width="320" height="4" fill="#ffffff" opacity=".16" />
      <rect x="120" y="146" width="80" height="5" fill={dark} opacity=".4" />
      <path d="M0 158h320" stroke={dark} strokeWidth="2" opacity=".25" />
      <path d="M0 170h320" stroke={dark} strokeWidth="2" opacity=".2" />
      {/* Two stone lanterns flanking the approach. */}
      {[56, 264].map((x) => (
        <g key={x} fill={dark} opacity=".55">
          <rect x={x - 8} y="148" width="16" height="4" rx="1" />
          <rect x={x - 3} y="136" width="6" height="12" />
          <rect x={x - 7} y="130" width="14" height="7" rx="2" />
          <path d={`M${x - 8} 130 ${x} 124 ${x + 8} 130Z`} />
        </g>
      ))}
      <rect y="174" width="320" height="6" fill={dark} opacity=".55" />
      <Tree x={26} y={178} s={1.05} tone={dark} />
      <Tree x={298} y={178} s={0.95} tone={dark} />
    </g>
  )),

  // ---- 台湾地区 ----
  27: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={42} y={24} s={0.85} /><Cloud x={256} y={18} s={0.6} />
      <Birds x={196} y={40} tone={dark} />
      {/* Hills ringing the basin, then the low city in two ranks. */}
      <path d="M0 104 38 68l48 32 44-22 46 30 42-26 62 30v40H0Z" fill={mid} opacity=".26" />
      <Skyline y={136} tone={mid} count={12} seed={6} minH={16} maxH={36} opacity={0.4} />
      <Skyline y={142} tone={dark} count={9} seed={3} minH={8} maxH={22} opacity={0.24} />
      {/* The tower: a wide plinth, then four tall tiers that step in with hard shoulders — tall rectangles rather
          than a continuous taper, which is what makes it read as a modern building and not a pyramid. */}
      <path d="M130 142h60l-4-11h-52Z" fill={dark} />
      <rect x="138" y="106" width="44" height="25" fill={dark} opacity=".96" />
      <rect x="142" y="80" width="36" height="26" fill={dark} opacity=".92" />
      <rect x="147" y="58" width="26" height="22" fill={dark} opacity=".88" />
      <rect x="152" y="42" width="16" height="16" fill={dark} opacity=".84" />
      {/* Window bands across each tier, so every storey is legible. */}
      <Windows x={143} y={113} cols={5} rows={3} w={6} h={3} gap={3} fill="#ffffff" opacity={0.2} />
      <Windows x={147} y={87} cols={4} rows={3} w={6} h={3} gap={3} fill="#ffffff" opacity={0.2} />
      <Windows x={151} y={65} cols={3} rows={3} w={5} h={3} gap={3} fill="#ffffff" opacity={0.18} />
      {/* The crown: a short pyramid, a stepped finial, and the mast. */}
      <path d="M152 42 157 30h6l5 12Z" fill={dark} opacity=".85" />
      <path d="M158.4 30h3.2v14h-3.2Z" fill={dark} opacity=".85" />
      <circle cx="160" cy="29" r="2" fill={dark} opacity=".85" />
      {/* The plaza, its low wall, and the road in front. */}
      <rect y="142" width="320" height="38" fill={mid} opacity=".5" />
      <rect y="142" width="320" height="4" fill="#ffffff" opacity=".18" />
      <rect x="118" y="152" width="84" height="4" fill={dark} opacity=".35" />
      <path d="M0 162h320" stroke={dark} strokeWidth="2" opacity=".22" />
      {[0, 1, 2, 3].map((index) => (
        <rect key={index} x={26 + index * 76} y="166" width="22" height="2.4" fill="#ffffff" opacity=".16" />
      ))}
      <rect y="174" width="320" height="6" fill={dark} opacity=".55" />
      <Tree x={22} y={178} s={1.05} tone={dark} />
      <Tree x={298} y={178} s={0.95} tone={dark} />
      <Tree x={56} y={178} s={0.66} tone={dark} />
    </g>
  )),
  28: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={80} y={24} s={0.7} /><Cloud x={240} y={34} s={0.6} />
      {/* The viaduct with the train streaking across it. */}
      {[[16, 50], [62, 62], [228, 66], [268, 48]].map(([x, h]) => (
        <rect key={x} x={x} y={128 - h!} width="34" height={h} fill={mid} opacity=".45" />
      ))}
      <rect y="128" width="320" height="14" fill={mid} opacity=".7" />
      <path d="M150 128V58c0-10 8-16 18-16h72l30 24v62Z" fill={dark} />
      <rect x="176" y="56" width="34" height="20" rx="4" fill={sky} opacity=".5" />
      <path d="M228 76h34l14 14" stroke="#ffffff" strokeWidth="2.5" fill="none" opacity=".3" />
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <rect key={index} x={16 + index * 54} y="142" width="9" height={38} fill={dark} opacity=".45" />
      ))}
      <rect y="160" width="320" height="20" fill={dark} opacity=".4" />
    </g>
  )),
  29: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={38} y={24} s={0.8} /><Cloud x={256} y={34} s={0.6} />
      <Birds x={172} y={36} tone={dark} />
      {/* The city behind the port, so the wharf has something to be the harbour of. */}
      <Skyline y={112} tone={mid} count={12} seed={6} minH={16} maxH={40} opacity={0.38} />
      {/* The harbour water, with the far shore's edge as a bright line. */}
      <rect y="110" width="320" height="3" fill="#ffffff" opacity=".26" />
      <rect y="113" width="320" height="67" fill={mid} opacity=".5" />
      {/* Two gantry cranes: legs, a boom out over the water, a trolley and a hook. */}
      {[0, 1].map((index) => {
        const x = 46 + index * 148;
        return (
          <g key={index}>
            <path d={`M${x} 128V48h7v80Z`} fill={dark} />
            <path d={`M${x + 52} 128V56h6v72Z`} fill={dark} />
            <path d={`M${x} 52h108v7H${x}Z`} fill={dark} />
            <path d={`M${x + 82} 59v16`} stroke={dark} strokeWidth="2.6" />
            <rect x={x + 78} y="75" width="9" height="6" fill={dark} />
            <path d={`M${x - 2} 128h12M${x + 50} 128h12`} stroke={dark} strokeWidth="2" opacity=".6" />
          </g>
        );
      })}
      {/* Stacks of containers, in two ranks and two heights. */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
        <rect key={index} x={8 + index * 40} y={126 + (index % 2) * 5} width="32" height="16" fill={dark} opacity={0.5 + (index % 3) * 0.08} />
      ))}
      {[0, 1, 2, 3].map((index) => (
        <rect key={`b${index}`} x={20 + index * 78} y={114} width="28" height="13" fill={dark} opacity=".42" />
      ))}
      {/* A container ship at the quay, low in the water. */}
      <path d="M108 158h116l-9 13H118Z" fill={dark} opacity=".85" />
      <rect x="126" y="146" width="22" height="12" fill={dark} opacity=".7" />
      <rect x="152" y="144" width="26" height="14" fill={dark} opacity=".6" />
      <rect x="182" y="148" width="20" height="10" fill={dark} opacity=".55" />
      {/* Ripples in the foreground water. */}
      {[0, 1, 2].map((index) => (
        <path key={`r${index}`} d={`M${16 + index * 104} ${168 + index * 4}q28-6 56 0`} stroke="#ffffff" strokeWidth="2" fill="none" opacity=".3" />
      ))}
      <rect y="174" width="320" height="6" fill={dark} opacity=".35" />
    </g>
  )),
  30: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={70} y={30} s={0.8} /><Cloud x={250} y={22} s={0.65} />
      {/* The green parkway down the middle, blocks flanking it. */}
      <rect x="0" y="70" width="96" height="110" fill={mid} opacity=".5" />
      <rect x="224" y="70" width="96" height="110" fill={mid} opacity=".45" />
      <path d="M120 180 146 70h28l26 110Z" fill={dark} opacity=".7" />
      <path d="M132 180 152 74M188 180 168 74" stroke="#ffffff" strokeWidth="2" opacity=".22" />
      {[0, 1, 2].map((index) => (
        <circle key={index} cx={148 + index * 12} cy={92 + index * 22} r="6" fill={dark} opacity=".55" />
      ))}
      <path d="M0 108h96M224 108h96M0 140h84M236 140h84" stroke="#ffffff" strokeWidth="2" opacity=".2" />
    </g>
  )),
  32: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={248} y={30} s={0.7} />
      {/* The old city gate, its wall running away, low roofs behind. */}
      <path d="M0 116h320v64H0Z" fill={mid} opacity=".4" />
      <path d="M0 140h110v4H0ZM210 140h110v4H210Z" fill={dark} opacity=".5" />
      <path d="M108 152V82h104v70Z" fill={dark} />
      <path d="M96 82 160 52l64 30Z" fill={dark} />
      <path d="M136 152v-30a24 24 0 0 1 48 0v30Z" fill={sky} opacity=".5" />
      <path d="M160 52V36" stroke={dark} strokeWidth="2.5" />
      <rect y="152" width="320" height="28" fill={dark} opacity=".5" />
    </g>
  )),

  // ---- 大洋洲及西亚 ----
  34: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={52} y={22} s={0.85} /><Cloud x={242} y={28} s={0.6} />
      <Birds x={96} y={40} tone={dark} />
      {/* The far shore across the harbour, low and pale. */}
      <Skyline y={120} tone={mid} count={13} seed={6} minH={8} maxH={24} opacity={0.28} />
      {/* The bridge on the right: two pylons, the arch between, the deck and its hangers. */}
      <rect x="196" y="52" width="9" height="68" fill={dark} opacity=".8" />
      <rect x="304" y="52" width="9" height="68" fill={dark} opacity=".8" />
      <rect x="192" y="56" width="17" height="6" fill={dark} opacity=".55" />
      <rect x="300" y="56" width="17" height="6" fill={dark} opacity=".55" />
      <path d="M200 106q56-88 113 0" stroke={dark} strokeWidth="4.5" fill="none" />
      {[[214, 87], [228, 73], [242, 65], [257, 62], [271, 65], [285, 73], [299, 87]].map(([x, y]) => (
        <path key={x} d={`M${x} ${y}v${104 - y!}`} stroke={dark} strokeWidth="1.2" opacity=".6" />
      ))}
      <rect x="150" y="104" width="170" height="7" fill={dark} opacity=".9" />
      <rect x="150" y="104" width="170" height="2" fill="#ffffff" opacity=".22" />
      {/* A pylon footing standing in the water, which is what gives the bridge weight. */}
      <rect x="188" y="110" width="25" height="16" fill={dark} opacity=".55" />
      {/* The opera house: a podium and three overlapping shell sails, tallest at the left. */}
      <rect x="60" y="112" width="106" height="12" fill={mid} opacity=".9" />
      <rect x="60" y="112" width="106" height="3" fill="#ffffff" opacity=".2" />
      <path d="M66 114C66 88 78 68 100 58 92 82 90 100 92 114Z" fill={dark} />
      <path d="M104 114c0-24 11-42 31-52-8 22-10 38-8 52Z" fill={dark} opacity=".92" />
      <path d="M136 114c0-18 8-32 24-40-6 16-8 28-6 40Z" fill={dark} opacity=".82" />
      <path d="M158 114c0-12 5-22 15-27-4 10-5 18-4 27Z" fill={dark} opacity=".7" />
      <path d="M78 114c2-16 8-28 16-36" stroke={sky} strokeWidth="1.4" fill="none" opacity=".26" />
      <path d="M116 114c2-14 7-24 14-31" stroke={sky} strokeWidth="1.2" fill="none" opacity=".22" />
      {/* The harbour: a bright waterline, reflections under the bridge and the sails, then swell. */}
      <rect y="122" width="320" height="58" fill={mid} opacity=".62" />
      <rect y="122" width="320" height="4" fill="#ffffff" opacity=".24" />
      <rect x="200" y="126" width="10" height="22" fill={dark} opacity=".16" />
      <rect x="308" y="126" width="10" height="22" fill={dark} opacity=".16" />
      <rect x="70" y="126" width="24" height="16" fill={dark} opacity=".13" />
      {[0, 1, 2, 3].map((index) => (
        <path key={index} d={`M${10 + index * 80} ${136 + index * 9}q18-4 36 0`} stroke="#ffffff" strokeWidth="2" fill="none" opacity=".3" />
      ))}
      {/* A ferry crossing in the foreground, and trees on the near point. */}
      <path d="M118 156h52l-7 11h-38Z" fill={dark} opacity=".85" />
      <rect x="132" y="146" width="22" height="10" rx="2" fill={dark} opacity=".85" />
      <path d="M138 146v-8" stroke={dark} strokeWidth="1.6" opacity=".7" />
      <rect y="170" width="320" height="10" fill={dark} opacity=".55" />
      <Tree x={26} y={172} s={1.05} tone={dark} />
      <Tree x={296} y={174} s={0.9} tone={dark} />
    </g>
  )),
  35: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={48} y={22} s={0.9} /><Cloud x={238} y={16} s={0.6} />
      <Birds x={126} y={34} tone={dark} />
      {/* The far arm of the harbour, low on the horizon. */}
      <Skyline y={108} tone={mid} count={12} seed={5} minH={8} maxH={20} opacity={0.26} />
      {/* A far cone, pale, then the near one dark with its crater bitten out. */}
      <path d="M-6 126 44 84h18l44 42Z" fill={mid} opacity=".5" />
      <path d="M46 86h16l-8 6Z" fill={dark} opacity=".28" />
      <path d="M96 126 158 62h46l62 64Z" fill={dark} opacity=".92" />
      <path d="M158 62h46l-9 14h-27Z" fill={dark} />
      {/* The crater floor, a flat pale shelf inside the notch, and the flank seams. */}
      <path d="M170 68h24l-4 8h-16Z" fill="#ffffff" opacity=".2" />
      <path d="M158 62 128 126h20Z" fill="#ffffff" opacity=".06" />
      <path d="M180 76c-6 16-9 34-8 50" stroke={sky} strokeWidth="1.6" fill="none" opacity=".18" />
      <path d="M196 78c5 16 8 32 9 48" stroke={dark} strokeWidth="1.6" fill="none" opacity=".5" />
      {/* The needle tower on the left: a shaft, a flared deck, a spire, and its mast. */}
      <path d="M30 126V78h11v48Z" fill={dark} />
      <path d="M25 78h21l-3-9H28Z" fill={dark} />
      <path d="M30 69h11v-4H30Z" fill={dark} opacity=".8" />
      <path d="M35 65V44" stroke={dark} strokeWidth="2.6" />
      <path d="M35 44h-6M35 52h6" stroke={dark} strokeWidth="2" opacity=".8" />
      <circle cx="35" cy="58" r="3.6" fill={dark} />
      <rect x="33" y="82" width="6" height="16" fill={sky} opacity=".34" />
      <path d="M44 126V96h8v30Z" fill={dark} opacity=".55" />
      {/* The harbour in front: a bright waterline, swell, and a moored boat. */}
      <rect y="126" width="320" height="54" fill={mid} opacity=".6" />
      <rect y="126" width="320" height="4" fill="#ffffff" opacity=".26" />
      <path d="M180 130c-5 20-6 34-5 46" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".13" />
      {[0, 1, 2, 3].map((index) => (
        <path key={index} d={`M${10 + index * 82} ${140 + index * 8}q18-4 36 0`} stroke="#ffffff" strokeWidth="2" fill="none" opacity=".3" />
      ))}
      <path d="M250 150h32l-5 9h-23Z" fill={dark} opacity=".8" />
      <path d="M266 150v-11" stroke={dark} strokeWidth="1.8" opacity=".85" />
      <path d="M266 141l8 9h-8Z" fill={dark} opacity=".6" />
      {/* The near shore with trees, which frames the water. */}
      <rect y="168" width="320" height="12" fill={dark} opacity=".55" />
      <Tree x={22} y={171} s={1} tone={dark} />
      <Tree x={300} y={173} s={0.85} tone={dark} />
      <Tree x={66} y={174} s={0.6} tone={dark} />
    </g>
  )),
  36: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={74} y={28} s={0.75} /><Cloud x={246} y={22} s={0.6} />
      {/* A reservoir with its embankment and a works building. */}
      <path d="M0 106h320v18H0Z" fill={mid} opacity=".55" />
      <rect x="196" y="80" width="76" height="30" fill={dark} opacity=".7" />
      <path d="M196 80h76v6h-76Z" fill={dark} />
      <rect y="124" width="320" height="56" fill={mid} opacity=".6" />
      <path d="M0 148q30-6 60 0t60 0 60 0 60 0 60 0" stroke="#ffffff" strokeWidth="2.5" fill="none" opacity=".4" />
      <path d="M0 162q30-6 60 0t60 0 60 0 60 0 60 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".26" />
      <path d="M36 124v-26h44v26Z" fill={dark} opacity=".45" />
    </g>
  )),
  37: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={44} y={22} s={0.7} /><Cloud x={252} y={16} s={0.5} />
      <Birds x={190} y={52} tone={dark} />
      {/* A pale city on the horizon, well below the tower's shoulder. */}
      <Skyline y={124} tone={mid} count={12} seed={8} minH={12} maxH={40} opacity={0.3} />
      {/* The tower: stepped setbacks, a spire, and a flight of small masts on its shoulder. */}
      <path d="M152 138V64h16v74Z" fill={dark} />
      <path d="M150 64h20l-3-12h-14Z" fill={dark} opacity=".9" />
      <path d="M153 52h14l-2-10h-10Z" fill={dark} opacity=".85" />
      <path d="M156 42h8v-4h-8Z" fill={dark} opacity=".8" />
      <path d="M160 38V14" stroke={dark} strokeWidth="2.4" />
      <path d="M158 108h4v-6h-4ZM158 88h4v-6h-4ZM158 68h4v-6h-4Z" fill={dark} opacity=".7" />
      <path d="M155 98 150 82h4l4 12ZM165 98l5-16h-4l-4 12Z" fill={dark} opacity=".6" />
      <path d="M156 44h8" stroke={dark} strokeWidth="1.4" opacity=".5" />
      {/* Two towers alongside, dark, so the one tall thing is the subject. */}
      <path d="M118 138V86h20v52Z" fill={dark} opacity=".55" />
      <path d="M120 86h16v-6h-16Z" fill={dark} opacity=".45" />
      <path d="M184 138V102h16v36Z" fill={dark} opacity=".45" />
      <rect x="156" y="72" width="8" height="60" fill={sky} opacity=".14" />
      {/* Dunes: soft pale ridges sweeping across the flat. */}
      <path d="M0 138q48-16 96-6t104-8 120 6v50H0Z" fill={mid} opacity=".45" />
      <path d="M0 148q56-12 112-2t104-6 104 4v36H0Z" fill={mid} opacity=".35" />
      {/* The highway running to the horizon under the tower, with its lights. */}
      <path d="M120 180 148 138h24l30 42Z" fill={dark} opacity=".4" />
      <path d="M148 138 128 180M172 138 192 180" stroke="#ffffff" strokeWidth="2" opacity=".2" />
      <path d="M160 146v7M160 162v10M160 178v2" stroke="#ffffff" strokeWidth="2.4" opacity=".28" />
      {[[138, 152], [150, 166], [186, 156]].map(([x, y]) => (
        <g key={x}>
          <rect x={x} y={y} width="12" height="6" rx="1.5" fill={dark} opacity=".8" />
          <circle cx={x! + 12} cy={y! + 3} r="1.6" fill="#ffffff" opacity=".5" />
        </g>
      ))}
      {/* Palms along the verge, then the dark near edge. */}
      <path d="M0 168h320v12H0Z" fill={dark} opacity=".5" />
      <path d="M36 172v-22" stroke={dark} strokeWidth="3" opacity=".8" />
      <path d="M36 150c-9-6-16-6-21-2M36 150c9-6 16-6 21-2M36 150c-3-9-3-15 0-20M36 150c3-9 3-15 0-20" stroke={dark} strokeWidth="2.4" fill="none" opacity=".8" />
      <path d="M284 174v-18" stroke={dark} strokeWidth="2.6" opacity=".75" />
      <path d="M284 156c-8-5-14-5-18-2M284 156c8-5 14-5 18-2M284 156c-2-8-2-13 0-17M284 156c2-8 2-13 0-17" stroke={dark} strokeWidth="2" fill="none" opacity=".75" />
    </g>
  )),

  // ---- 欧洲 ----
  // 巴黎: the tower seen across the river, plane trees along the quay, a low cream city behind it. The tower is the only
  // tall thing in the frame, which is exactly why it is recognisable.
  39: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={56} y={26} s={0.9} /><Cloud x={252} y={20} s={0.65} />
      <Birds x={206} y={38} tone={dark} />
      {/* The city: two ranks of pale blocks, receding behind the tower. */}
      <Skyline y={126} tone={mid} count={11} seed={3} minH={26} maxH={46} opacity={0.55} />
      <Skyline y={132} tone={dark} count={9} seed={6} minH={16} maxH={30} opacity={0.35} />
      {/* The tower: two legs, a platform, a mast. Drafted so the silhouette alone reads. */}
      <path d="M148 130 156 62h8l8 68Z" fill={dark} />
      <path d="M150 130 156 66M158 130 164 66" stroke={sky} strokeWidth="1.6" opacity=".28" />
      <path d="M154 88h12v4h-12ZM152 104h16v4h-16Z" fill={dark} />
      <path d="M160 62V40" stroke={dark} strokeWidth="3" />
      <path d="M157 40h6v-4h-6Z" fill={dark} />
      <path d="M148 130l-6 12h40l-6-12Z" fill={dark} opacity=".85" />
      {/* The quay and the river, with the tower reflected as a soft band. */}
      <rect y="142" width="320" height="10" fill={mid} opacity=".5" />
      <rect y="152" width="320" height="28" fill={mid} opacity=".42" />
      <rect x="150" y="152" width="20" height="26" fill={dark} opacity=".18" />
      {[0, 1, 2, 3].map((index) => (
        <path key={index} d={`M${24 + index * 78} ${158 + index * 5}q18-4 36 0`} stroke="#ffffff" strokeWidth="2" fill="none" opacity=".3" />
      ))}
      {/* Plane trees along the near bank, which frame the shot and give the scale. */}
      <rect y="170" width="320" height="10" fill={dark} opacity=".6" />
      <Tree x={26} y={172} s={1.15} tone={dark} />
      <Tree x={294} y={172} s={1.05} tone={dark} />
      <Tree x={64} y={174} s={0.8} tone={dark} />
      <Tree x={262} y={174} s={0.75} tone={dark} />
    </g>
  )),
  40: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={70} y={30} s={0.8} /><Cloud x={244} y={24} s={0.6} />
      {/* The clock tower, the river, a bridge with arches. */}
      <path d="M0 118h320v62H0Z" fill={mid} opacity=".35" />
      <rect x="138" y="46" width="34" height="72" fill={dark} />
      <path d="M132 46 155 18l23 28Z" fill={dark} />
      <circle cx="155" cy="74" r="13" fill={sky} opacity=".55" />
      <path d="M155 68v7h6" stroke={dark} strokeWidth="2" fill="none" />
      <rect y="126" width="320" height="54" fill={mid} opacity=".55" />
      {[0, 1, 2, 3].map((index) => (
        <path key={index} d={`M${24 + index * 78} 136a22 22 0 0 1 44 0v26H${24 + index * 78}Z`} fill={dark} opacity=".45" />
      ))}
      <rect y="126" width="320" height="8" fill={dark} opacity=".55" />
    </g>
  )),
  41: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={70} y={26} s={0.8} /><Cloud x={252} y={34} s={0.6} />
      {/* Two spires over the lake, hills behind. */}
      <path d="M0 92 44 56l52 36 46-26 50 30 48-34 80 48v70H0Z" fill={mid} opacity=".3" />
      <rect x="96" y="76" width="26" height="52" fill={dark} />
      <path d="M90 76 109 44l19 32Z" fill={dark} />
      <rect x="196" y="88" width="24" height="40" fill={dark} opacity=".8" />
      <path d="M190 88 208 62l18 26Z" fill={dark} opacity=".8" />
      <rect y="128" width="320" height="52" fill={mid} opacity=".6" />
      <path d="M0 146q40-8 80 0t80 0 80 0 80 0" stroke="#ffffff" strokeWidth="2.5" fill="none" opacity=".36" />
      <path d="M0 160q40-8 80 0t80 0 80 0 80 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".22" />
    </g>
  )),
  42: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={72} y={28} s={0.8} /><Cloud x={246} y={22} s={0.6} />
      {/* The arena's arched wall, a dome behind, pines in front. */}
      <path d="M0 122h320v58H0Z" fill={mid} opacity=".35" />
      <circle cx="212" cy="80" r="34" fill={dark} opacity=".75" />
      <path d="M212 46v-14" stroke={dark} strokeWidth="3" />
      <path d="M48 140V86h124v54Z" fill={dark} />
      <path d="M48 86h124v6H48Z" fill={dark} opacity=".7" />
      {[0, 1, 2, 3].map((index) => (
        <path key={index} d={`M${62 + index * 30} 140v-26a11 11 0 0 1 22 0v26Z`} fill={sky} opacity=".42" />
      ))}
      <rect y="140" width="320" height="40" fill={mid} opacity=".55" />
      {[[18, 18], [188, 22], [278, 20]].map(([x, r]) => (
        <g key={x}>
          <circle cx={x} cy={146 - r!} r={r} fill={dark} opacity=".55" />
          <rect x={x! - 2} y={146 - r!} width="4" height={r} fill={dark} opacity=".45" />
        </g>
      ))}
    </g>
  )),

  // ---- 北美洲 ----
  44: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={66} y={24} s={0.8} /><Cloud x={250} y={34} s={0.6} />
      {/* A ferry mid-crossing, the far shore low on the horizon. */}
      <path d="M0 104q40-10 80 0t80 0 80 0 80 0v10H0Z" fill={mid} opacity=".4" />
      <rect y="114" width="320" height="66" fill={mid} opacity=".62" />
      <path d="M96 130h132l-16 26H112Z" fill={dark} />
      <rect x="126" y="106" width="76" height="24" rx="3" fill={dark} opacity=".9" />
      <rect x="140" y="112" width="18" height="10" fill={sky} opacity=".4" />
      <rect x="166" y="112" width="18" height="10" fill={sky} opacity=".4" />
      <path d="M212 118V96h6v22Z" fill={dark} opacity=".7" />
      <path d="M0 146q40-8 80 0t80 0 80 0 80 0" stroke="#ffffff" strokeWidth="2.5" fill="none" opacity=".36" />
      <path d="M0 160q40-8 80 0t80 0 80 0 80 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".2" />
    </g>
  )),
  45: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={48} y={20} s={0.8} /><Cloud x={246} y={28} s={0.6} />
      <Birds x={124} y={36} tone={dark} />
      {/* Dusty hills along the back, with a low pass between them. */}
      <path d="M0 104 40 74l34 22 38-16 44 20 40-24 44 26 40-14 40 24v62H0Z" fill={mid} opacity=".32" />
      <path d="M0 112 30 94l30 14 40-8 46 14 44-10 46 12 44-8 40 14v46H0Z" fill={mid} opacity=".22" />
      {/* The sprawl: a wide, low, even rank of houses right across the basin. */}
      <Skyline y={136} tone={mid} count={16} seed={4} minH={10} maxH={30} opacity={0.5} />
      <Skyline y={142} tone={dark} count={11} seed={9} minH={6} maxH={18} opacity={0.22} />
      {/* Two pale towers downtown, the only tall things, far back. */}
      <rect x="140" y="76" width="14" height="60" fill={mid} opacity=".7" />
      <rect x="158" y="88" width="11" height="48" fill={mid} opacity=".6" />
      <rect x="140" y="76" width="14" height="4" fill={dark} opacity=".35" />
      {/* The boulevard across the front, its dashes and two cars headed away. */}
      <rect y="146" width="320" height="34" fill={dark} opacity=".4" />
      <path d="M0 152h320" stroke="#ffffff" strokeWidth="2" opacity=".18" />
      <path d="M10 162h18M44 162h18M78 162h18M112 162h18M146 162h18M180 162h18M214 162h18M248 162h18M282 162h18" stroke="#ffffff" strokeWidth="2.4" opacity=".26" />
      <rect x="118" y="155" width="18" height="7" rx="2" fill={dark} />
      <rect x="214" y="170" width="20" height="8" rx="2" fill={dark} opacity=".85" />
      {/* Palms: tall thin trunks with a fan of fronds, framing the shot. */}
      {[[28, 74], [84, 44], [252, 60], [296, 80]].map(([x, h], index) => (
        <g key={x} opacity={index === 1 ? 0.72 : 0.9}>
          <path d={`M${x} 172c${index % 2 ? -2 : 2}-${h! * 0.5} ${index % 2 ? -4 : 4}-${h! * 0.8} ${index % 2 ? -3 : 3}-${h}`} stroke={dark} strokeWidth="3.4" fill="none" />
          <g transform={`translate(${x! + (index % 2 ? -3 : 3)} ${172 - h!})`}>
            <path d="M0 0c-10-7-18-8-24-4M0 0c10-7 18-8 24-4M0 0c-5-11-6-17-2-22M0 0c5-11 6-17 2-22M0 0c-9-3-14-9-16-15M0 0c9-3 14-9 16-15"
              stroke={dark} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          </g>
        </g>
      ))}
      <rect y="172" width="320" height="8" fill={dark} opacity=".6" />
    </g>
  )),
  46: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={64} y={26} s={0.7} /><Cloud x={252} y={22} s={0.55} />
      {/* A dense stepped skyline, the park in the foreground. */}
      {[[0, 66], [30, 84], [58, 52]].map(([x, h]) => (
        <rect key={x} x={x} y={140 - h!} width="24" height={h} fill={mid} opacity=".5" />
      ))}
      <rect x="118" y="42" width="30" height="98" fill={dark} />
      <path d="M124 42V26h18v16Z" fill={dark} opacity=".8" />
      <rect x="154" y="66" width="26" height="74" fill={dark} opacity=".8" />
      <rect x="186" y="52" width="28" height="88" fill={dark} opacity=".7" />
      {[[224, 78], [252, 96], [282, 70]].map(([x, h]) => (
        <rect key={x} x={x} y={140 - h!} width="26" height={h} fill={mid} opacity=".45" />
      ))}
      <rect y="140" width="320" height="40" fill={dark} opacity=".5" />
      <path d="M0 152q40-6 80 0t80 0 80 0 80 0" stroke="#ffffff" strokeWidth="2" fill="none" opacity=".18" />
    </g>
  )),
  47: scene((tint, sky, mid, dark) => (
    <g>
      <rect width="320" height="180" fill={sky} />
      <Cloud x={50} y={24} s={0.8} /><Cloud x={232} y={18} s={0.55} />
      <Birds x={252} y={44} tone={dark} />
      {/* The far shore and its hills, paling into the haze. */}
      <path d="M0 100 44 72l40 22 42-14 46 20 44-22 52 26 52-16v52H0Z" fill={mid} opacity=".24" />
      <path d="M0 108 38 92l44 12 46-6 44 14 46-10 50 12 52-6v38H0Z" fill={mid} opacity=".2" />
      <Skyline y={122} tone={mid} count={14} seed={2} minH={8} maxH={22} opacity={0.22} />
      {/* The span: two towers, a sagging main cable, its hangers, and the deck. */}
      <rect x="42" y="48" width="10" height="74" fill={dark} />
      <rect x="268" y="48" width="10" height="74" fill={dark} />
      <rect x="38" y="60" width="18" height="5" fill={dark} opacity=".8" />
      <rect x="264" y="60" width="18" height="5" fill={dark} opacity=".8" />
      <rect x="38" y="96" width="18" height="5" fill={dark} opacity=".8" />
      <rect x="264" y="96" width="18" height="5" fill={dark} opacity=".8" />
      <path d="M0 94q24-22 47-30M280 88q20-10 40-14" stroke={dark} strokeWidth="3" fill="none" opacity=".5" />
      <path d="M47 64Q160 108 280 88" stroke={dark} strokeWidth="4" fill="none" />
      {[[68, 72], [96, 81], [124, 88], [152, 92], [180, 91], [208, 87], [236, 80], [260, 71]].map(([x, cy], index) => (
        <path key={x} d={`M${x} ${cy}v${118 - cy!}`} stroke={dark} strokeWidth="1.2" opacity={index % 2 ? 0.5 : 0.65} />
      ))}
      <rect x="0" y="118" width="320" height="7" fill={dark} opacity=".92" />
      <rect x="0" y="118" width="320" height="2" fill="#ffffff" opacity=".24" />
      {/* The tower bases standing in the water, and the approach spans. */}
      <rect x="34" y="122" width="26" height="12" fill={dark} opacity=".5" />
      <rect x="260" y="122" width="26" height="12" fill={dark} opacity=".5" />
      <path d="M0 122h34M60 122h200M286 122h34" stroke={dark} strokeWidth="2" opacity=".3" />
      {/* Fog: soft pale banks lying across the far end of the bridge. */}
      <ellipse cx="70" cy="102" rx="46" ry="12" fill="#ffffff" opacity=".32" />
      <ellipse cx="250" cy="96" rx="40" ry="10" fill="#ffffff" opacity=".28" />
      <ellipse cx="164" cy="110" rx="54" ry="9" fill="#ffffff" opacity=".22" />
      <ellipse cx="104" cy="126" rx="62" ry="10" fill="#ffffff" opacity=".24" />
      {/* The bay below: reflections under the towers, then long swell. */}
      <rect y="130" width="320" height="50" fill={mid} opacity=".5" />
      <rect x="42" y="132" width="10" height="24" fill={dark} opacity=".14" />
      <rect x="268" y="132" width="10" height="24" fill={dark} opacity=".14" />
      {[0, 1, 2, 3].map((index) => (
        <path key={index} d={`M${10 + index * 82} ${142 + index * 9}q18-4 36 0`} stroke="#ffffff" strokeWidth="2" fill="none" opacity=".26" />
      ))}
      {/* A sailboat under the span, and the dark near edge. */}
      <path d="M186 154h26l-4 8h-19Z" fill={dark} opacity=".8" />
      <path d="M199 154v-13" stroke={dark} strokeWidth="1.8" opacity=".75" />
      <path d="M199 142l9 12h-9Z" fill={dark} opacity=".6" />
      <rect y="172" width="320" height="8" fill={dark} opacity=".5" />
      <Tree x={26} y={174} s={0.85} tone={dark} />
      <Tree x={298} y={175} s={0.7} tone={dark} />
    </g>
  ))
};

/**
 * The scene for a tile, at the given width. Returns null for a tile without one (non-purchasable squares), so a caller can
 * fall back to a plain header.
 */
export function Scene({ index, tint, width = 320, height = 180 }: {
  index: number; tint: string; width?: number; height?: number;
}): JSX.Element | null {
  const draw = SCENES[index];
  if (!draw) return null;
  return (
    // The drawing fills whatever box it is given and crops rather than distorts (`slice`), which is what makes one scene
    // work at 150px tall in a detail card and at any other width a caller asks for.
    <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} width={width} height={height}
      preserveAspectRatio="xMidYMid slice"
      style={{ display: "block", width: "100%", height: "100%", maxWidth: "100%" }}
      aria-hidden="true" focusable="false">
      {draw(tint)}
    </svg>
  );
}

export const hasScene = (index: number): boolean => !!SCENES[index];
