/** The home-page cover of the Gomoku / Go entry: a wood board drawn in SVG with a few black and white stones; no image file. */
export function GomokuWeiqiCover() {
  const lines = [0, 1, 2, 3, 4, 5, 6];
  const stone = (x: number, y: number, colour: "b" | "w") => <circle key={`${x}-${y}`} cx={30 + x * 20} cy={30 + y * 20} r="8.6" fill={`url(#gwc-${colour})`} filter="url(#gwc-shadow)" />;
  return <div className="gw-cover" aria-hidden="true">
    <svg viewBox="0 0 180 180" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="gwc-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ecc47d" /><stop offset="0.5" stopColor="#d9a954" /><stop offset="1" stopColor="#e4b869" /></linearGradient>
        <pattern id="gwc-grain" width="7" height="180" patternUnits="userSpaceOnUse"><rect width="1.2" height="180" fill="#8a5a22" opacity="0.14" /><rect x="3.4" width="0.8" height="180" fill="#fff0c8" opacity="0.18" /></pattern>
        <radialGradient id="gwc-b" cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#6a6a6a" /><stop offset="0.5" stopColor="#222" /><stop offset="1" stopColor="#050505" /></radialGradient>
        <radialGradient id="gwc-w" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#fff" /><stop offset="0.6" stopColor="#ececec" /><stop offset="1" stopColor="#b9b6ae" /></radialGradient>
        <filter id="gwc-shadow" x="-30%" y="-30%" width="170%" height="170%"><feDropShadow dx="1" dy="2" stdDeviation="1.6" floodColor="#3a2410" floodOpacity="0.55" /></filter>
      </defs>
      <rect x="4" y="4" width="172" height="172" rx="4" fill="url(#gwc-wood)" stroke="#b98a43" strokeWidth="2" />
      <rect x="4" y="4" width="172" height="172" rx="4" fill="url(#gwc-grain)" />
      <g stroke="#4a3018" strokeWidth="1">
        {lines.map((index) => <line key={`h${index}`} x1="30" y1={30 + index * 20} x2="150" y2={30 + index * 20} />)}
        {lines.map((index) => <line key={`v${index}`} x1={30 + index * 20} y1="30" x2={30 + index * 20} y2="150" />)}
      </g>
      <circle cx="90" cy="90" r="2.4" fill="#3b2412" />
      {stone(2, 2, "b")}{stone(3, 3, "w")}{stone(3, 2, "b")}{stone(2, 3, "w")}{stone(4, 2, "b")}{stone(1, 4, "w")}{stone(4, 4, "b")}{stone(5, 3, "w")}
    </svg>
  </div>;
}
