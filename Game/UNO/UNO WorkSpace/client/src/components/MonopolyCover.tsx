/** The home-page cover of the Monopoly entry: a board corner drawn in SVG with a few tiles and a token; no image file. */
import "./monopoly-cover.css";

export function MonopolyCover() {
  const tiles = [
    { x: 10, y: 10, w: 150, h: 34 },
    { x: 10, y: 48, w: 34, h: 34 },
    { x: 48, y: 48, w: 34, h: 34 },
    { x: 86, y: 48, w: 34, h: 34 },
    { x: 124, y: 48, w: 36, h: 34 },
    { x: 10, y: 86, w: 34, h: 34 },
    { x: 10, y: 124, w: 34, h: 34 },
    { x: 10, y: 162, w: 150, h: 28 }
  ];
  const houses: Array<[number, number]> = [[20, 56], [58, 56], [96, 56]];
  return (
    <div className="mp-cover" aria-hidden="true">
      <svg viewBox="0 0 180 180" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="mpc-board" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22303f" />
            <stop offset="1" stopColor="#131b24" />
          </linearGradient>
          <linearGradient id="mpc-tile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4efe4" />
            <stop offset="1" stopColor="#ddd3c2" />
          </linearGradient>
          <radialGradient id="mpc-token" cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor="#ffdf8a" />
            <stop offset="0.55" stopColor="#e0a02c" />
            <stop offset="1" stopColor="#9b6413" />
          </radialGradient>
          <filter id="mpc-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="1" dy="2" stdDeviation="1.4" floodColor="#000" floodOpacity="0.5" />
          </filter>
        </defs>
        <rect x="3" y="3" width="174" height="174" rx="8" fill="url(#mpc-board)" />
        <rect x="3" y="3" width="174" height="174" rx="8" fill="none" stroke="#3d4e60" strokeWidth="2" />
        {tiles.map((tile, index) => (
          <g key={index} filter="url(#mpc-shadow)">
            <rect x={tile.x} y={tile.y} width={tile.w} height={tile.h} rx="2.5" fill="url(#mpc-tile)" />
            <rect x={tile.x + 2} y={tile.y + 2} width={tile.w - 4} height={tile.h > 32 ? 8 : 3} rx="1.5" fill={["#d8493f", "#3f8fd8", "#4aa96c", "#d8893f", "#8a5cd1", "#c0457a"][index % 6]!} />
          </g>
        ))}
        {houses.map(([x, y], index) => (
          <g key={`house-${index}`} fill="#2f9e5a" stroke="#1c6b3a" strokeWidth="0.8">
            <path d={`M${x} ${y + 7} L${x + 4} ${y} L${x + 8} ${y + 7} Z`} />
            <rect x={x + 1.6} y={y + 6.6} width="4.8" height="4.4" rx="0.6" />
          </g>
        ))}
        <circle cx="132" cy="64" r="10" fill="url(#mpc-token)" stroke="#7d4f0c" strokeWidth="1.2" filter="url(#mpc-shadow)" />
        <circle cx="128.5" cy="60" r="2.6" fill="#fff6d8" opacity="0.75" />
      </svg>
    </div>
  );
}