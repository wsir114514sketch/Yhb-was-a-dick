import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GwGameView, GwPoint, GwStone } from "@gw/protocol.ts";

/** One grid step in SVG units; the board has a one-step margin all round, which is also where the coordinates sit. */
const CELL = 40;

/** Star points (hoshi) by board size. */
function starPoints(size: number): GwPoint[] {
  const pick = (values: number[]): GwPoint[] => values.flatMap((row) => values.map((col) => ({ row, col })));
  if (size === 19) return pick([3, 9, 15]);
  if (size === 13) return [...pick([3, 9]), { row: 6, col: 6 }];
  if (size === 15) return [...pick([3, 11]), { row: 7, col: 7 }];
  if (size === 9) return [...pick([2, 6]), { row: 4, col: 4 }];
  return [];
}

const LETTERS = "ABCDEFGHJKLMNOPQRST";

export interface GwBoardProps {
  game: GwGameView;
  /** Whether a click may place a stone right now (your turn, game running, you are a player). */
  canPlay: boolean;
  /** The colour whose ghost stone follows the pointer. */
  ghost: GwStone | null;
  /** Go's scoring phase: clicking a stone marks its chain instead of placing. */
  marking?: boolean;
  onPlace: (point: GwPoint) => void;
}

/**
 * The board: yellow wood, dark-brown lines, star points, stones with a gradient and a shadow, a marker on the last
 * move and a translucent stone where the pointer would play. It stays square at any width (the SVG scales) and answers
 * mouse, touch and pen through pointer events.
 */
export function GwBoard({ game, canPlay, ghost, marking = false, onPlace }: GwBoardProps) {
  const size = game.size;
  const span = (size - 1) * CELL;
  const full = span + CELL * 2;
  const svg = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<GwPoint | null>(null);
  const deadSet = new Set(game.dead);
  const winLine = new Set((game.result?.line ?? []).map((point) => `${point.row},${point.col}`));

  const pointAt = (event: ReactPointerEvent<SVGSVGElement>): GwPoint | null => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const x = ((event.clientX - rect.left) / rect.width) * full - CELL;
    const y = ((event.clientY - rect.top) / rect.height) * full - CELL;
    const col = Math.round(x / CELL);
    const row = Math.round(y / CELL);
    if (row < 0 || col < 0 || row >= size || col >= size) return null;
    return { row, col };
  };

  const interactive = canPlay || marking;
  const onMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!interactive || event.pointerType === "touch") return;
    const point = pointAt(event);
    setHover(point && (marking ? game.board[point.row]![point.col] !== null : game.board[point.row]![point.col] === null) ? point : null);
  };
  const onClick = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!interactive) return;
    const point = pointAt(event);
    if (point) onPlace(point);
  };

  return <div className="gw-board-frame">
    <svg ref={svg} className={`gw-board ${interactive ? "is-live" : ""}`} viewBox={`0 0 ${full} ${full}`} role="grid"
      aria-label={`${size}乘${size}${game.mode === "gomoku" ? "五子棋" : "围棋"}棋盘`}
      onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerUp={onClick}>
      <defs>
        <radialGradient id="gw-black" cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#6a6a6a" /><stop offset="0.45" stopColor="#222" /><stop offset="1" stopColor="#050505" /></radialGradient>
        <radialGradient id="gw-white" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#ffffff" /><stop offset="0.6" stopColor="#ececec" /><stop offset="1" stopColor="#b9b6ae" /></radialGradient>
        <filter id="gw-shadow" x="-30%" y="-30%" width="170%" height="170%"><feDropShadow dx="1.5" dy="2.5" stdDeviation="2" floodColor="#3a2410" floodOpacity="0.55" /></filter>
      </defs>
      <g stroke="#4a3018" strokeWidth={size === 19 ? 1.2 : 1.5} strokeLinecap="square">
        {Array.from({ length: size }, (_, index) => <line key={`h${index}`} x1={CELL} y1={CELL + index * CELL} x2={CELL + span} y2={CELL + index * CELL} />)}
        {Array.from({ length: size }, (_, index) => <line key={`v${index}`} x1={CELL + index * CELL} y1={CELL} x2={CELL + index * CELL} y2={CELL + span} />)}
      </g>
      <rect x={CELL} y={CELL} width={span} height={span} fill="none" stroke="#4a3018" strokeWidth="2.6" />
      {starPoints(size).map((point) => <circle key={`s${point.row}-${point.col}`} cx={CELL + point.col * CELL} cy={CELL + point.row * CELL} r="3.6" fill="#3b2412" />)}
      <g className="gw-coords" fill="#6b4a26" fontSize="11" textAnchor="middle">
        {Array.from({ length: size }, (_, index) => <text key={`c${index}`} x={CELL + index * CELL} y={CELL * 0.55}>{game.mode === "go" ? LETTERS[index] : index + 1}</text>)}
        {Array.from({ length: size }, (_, index) => <text key={`r${index}`} x={CELL * 0.45} y={CELL + index * CELL + 4}>{game.mode === "go" ? size - index : index + 1}</text>)}
      </g>
      {game.board.map((line, row) => line.map((stone, col) => {
        if (!stone) return null;
        const dead = deadSet.has(`${row},${col}`);
        const cx = CELL + col * CELL;
        const cy = CELL + row * CELL;
        const last = game.lastMove?.row === row && game.lastMove.col === col;
        return <g key={`${row}-${col}`} opacity={dead ? 0.45 : 1} data-stone={stone}>
          <circle cx={cx} cy={cy} r={CELL * 0.455} fill={`url(#gw-${stone})`} filter="url(#gw-shadow)" />
          {last ? <circle cx={cx} cy={cy} r={CELL * 0.16} fill="none" stroke={stone === "black" ? "#f2f2f2" : "#222"} strokeWidth="2.2" /> : null}
          {winLine.has(`${row},${col}`) ? <circle cx={cx} cy={cy} r={CELL * 0.5} fill="none" stroke="#d8261f" strokeWidth="3" /> : null}
          {dead ? <path d={`M${cx - 9} ${cy - 9}L${cx + 9} ${cy + 9}M${cx + 9} ${cy - 9}L${cx - 9} ${cy + 9}`} stroke="#d8261f" strokeWidth="3" strokeLinecap="round" /> : null}
        </g>;
      }))}
      {hover && ghost && !marking ? <circle cx={CELL + hover.col * CELL} cy={CELL + hover.row * CELL} r={CELL * 0.455} fill={`url(#gw-${ghost})`} opacity="0.5" pointerEvents="none" /> : null}
      {hover && marking ? <circle cx={CELL + hover.col * CELL} cy={CELL + hover.row * CELL} r={CELL * 0.5} fill="none" stroke="#d8261f" strokeWidth="2.5" pointerEvents="none" /> : null}
    </svg>
  </div>;
}
