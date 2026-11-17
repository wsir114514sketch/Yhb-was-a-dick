/** The home-page cover of the flying-chess entry: a board corner drawn in SVG; no image file. */
import "./flying-chess-cover.css";

const RING: Array<[number, number]> = [
  [62, 24], [84, 24], [106, 24], [128, 24],
  [152, 28], [156, 52], [156, 76], [156, 100], [156, 124], [152, 148],
  [128, 152], [106, 152], [84, 152], [62, 152],
  [28, 148], [24, 124], [24, 100], [24, 76], [24, 52], [28, 28]
];

const TINTS = ["#e02b2b", "#1fa84a", "#1d6fd6", "#f6d11a"];

export function FlyingChessCover() {
  return (
    <div className="fc-cover" aria-hidden="true">
      <svg viewBox="0 0 180 180" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="fcc-board" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fffdf9" />
            <stop offset="1" stopColor="#efe9dd" />
          </linearGradient>
          <linearGradient id="fcc-die" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fffdf9" />
            <stop offset="1" stopColor="#e6ded1" />
          </linearGradient>
          <filter id="fcc-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="1" dy="2" stdDeviation="1.3" floodColor="#2b2825" floodOpacity="0.35" />
          </filter>
        </defs>

        <rect x="3" y="3" width="174" height="174" rx="10" fill="url(#fcc-board)" stroke="#d9d1c3" strokeWidth="2" />

        {/* 四角基地 */}
        {[
          { x: 18, y: 18, color: TINTS[1] },
          { x: 132, y: 18, color: TINTS[0] },
          { x: 18, y: 132, color: TINTS[2] },
          { x: 132, y: 132, color: TINTS[3] }
        ].map((base, index) => (
          <g key={`base-${index}`}>
            <rect x={base.x} y={base.y} width="30" height="30" rx="6" fill={base.color} fillOpacity="0.18" stroke={base.color} strokeWidth="1.6" />
            {[0, 1].map((row) => [0, 1].map((col) => (
              <circle key={`${row}-${col}`} cx={base.x + 9 + col * 12} cy={base.y + 9 + row * 12} r="4.2" fill="#fffdf9" stroke={base.color} strokeWidth="1.2" />
            )))}
          </g>
        ))}

        {/* 环线 */}
        {RING.map(([cx, cy], index) => (
          <rect key={`ring-${index}`} x={cx - 9} y={cy - 9} width="18" height="18" rx="3"
            fill={TINTS[index % 4]} stroke="#2b2825" strokeWidth="1.1" strokeOpacity="0.55" />
        ))}

        {/* 四条跑道与终点 */}
        <rect x="80" y="52" width="20" height="76" rx="3" fill={TINTS[0]} fillOpacity="0.85" />
        <rect x="52" y="80" width="76" height="20" rx="3" fill={TINTS[1]} fillOpacity="0.85" />
        <circle cx="90" cy="90" r="18" fill="#fffdf9" stroke="#2b2825" strokeWidth="1.6" />
        {[45, 135, 225, 315].map((angle, index) => {
          const rad = (angle * Math.PI) / 180;
          const x = 90 + Math.cos(rad) * 12;
          const y = 90 + Math.sin(rad) * 12;
          return <circle key={`goal-${index}`} cx={x} cy={y} r="4.6" fill={TINTS[index]} />;
        })}

        {/* 骰子 */}
        <g filter="url(#fcc-shadow)" transform="rotate(-8 132 118)">
          <rect x="116" y="102" width="32" height="32" rx="7" fill="url(#fcc-die)" stroke="#2b2825" strokeWidth="1.4" />
          {([[124, 110], [140, 110], [132, 118], [124, 126], [140, 126]] as Array<[number, number]>).map(([cx, cy], index) => (
            <circle key={`pip-${index}`} cx={cx} cy={cy} r="2.6" fill="#2b2825" />
          ))}
        </g>
      </svg>
    </div>
  );
}
