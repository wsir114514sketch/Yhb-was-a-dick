/**
 * 执行器：把意图演成 WAAPI 动画。
 *
 * 采用 FLIP：React 已经把一切画在真相位置，这里只叠加一次性的 transform / opacity 动画。因此动画从不参与状态——
 * 跳过就是 `finish()`，取消就是回到真相；新快照到达时，同一玩家仍在播放的移动先直落终态，再从新起点开演，
 * 滚动中的现金数字先对齐到新真相，不会倒退、也不会重复。
 *
 * 两类动画：
 * - 棋盘内（移动、落地、栏栅、扫光、建造）：在布局阶段同步开演，坐标是棋盘百分比；棋盘尺寸由 ResizeObserver
 *   异步缓存，开演时不读任何布局。
 * - 跨到棋盘外（金币飞向席位卡、印章、地契、回合交接、抽牌）：用一次性的 IntersectionObserver 异步拿到所需矩形
 *   再开演（不强制同步重排），画在页面级的固定定位层上。每帧只改 transform / opacity。
 */

import { BOARD_TILES, REGIONS, commercialAt, isCommercial } from "../../shared/board.ts";
import { DECK_NAME } from "../../shared/cards.ts";
import { formatMoney } from "../../shared/economy.ts";
import { JAIL_TILE } from "../../shared/rules.ts";
import { centerOf, layoutOf } from "../board/geometry.ts";
import { seatColor } from "../art/tokens.tsx";
import type { FxAnchor, FxIntent } from "./diff.ts";
import { TIMING } from "./timing.ts";

/** 棋子在棋盘上的位置（占棋盘宽高的百分比）与绘制尺寸（px）。 */
export interface PieceSpot { x: number; y: number; size: number }

/** 同时播放的移动上限；超出时最早的一组直落终态。 */
const MAX_PARALLEL = 3;

interface Group { animations: Animation[]; nodes: HTMLElement[] }

export interface FxHosts {
  /** 棋子下方的瞬时层（落地脉冲、扫光）。 */
  under: HTMLElement;
  /** 棋子上方的瞬时层（金额上浮、栏栅）。 */
  over: HTMLElement;
  /** 按玩家 id 取棋子的 DOM 节点。 */
  piece: (playerId: string) => HTMLElement | null;
  /** 页面级固定定位层（GameTable 提供）；没有时跳过棋盘外的动画。 */
  page?: () => HTMLElement | null;
  /** 有无动画在播发生变化时调用，用来显示/隐藏"跳过动画"按钮。 */
  onBusy?: (busy: boolean) => void;
}

export interface FxContext {
  scale: number;
  /** 低端模式：不放金币与扫光这类"粒子"。 */
  lowEnd: boolean;
  /** 新快照里每位玩家的现金（真相），用来让滚动中的数字立刻对齐。 */
  cash: Readonly<Record<string, number>>;
  /** 这一台设备是谁，用来把与"我"有关的横幅标出来。 */
  meId: string;
}

interface Roll { to: number; frame: number; nodes: HTMLElement[] }

type Point = { x: number; y: number };

const writeText = (node: HTMLElement, text: string): void => {
  // 只改文本节点的值：React 下次更新同一个文本节点，不会和这里打架。
  if (node.firstChild && node.firstChild.nodeType === Node.TEXT_NODE) node.firstChild.nodeValue = text;
  else node.textContent = text;
};

const centre = (rect: DOMRect): Point => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

export class FxRunner {
  private readonly groups = new Map<string, Group>();
  private readonly rolls = new Map<string, Roll>();
  private readonly measuring = new Set<IntersectionObserver>();
  private meId = "";
  private seq = 0;
  private listening = false;
  private size = { width: 0, height: 0 };
  private readonly observer: ResizeObserver | null;

  constructor(private readonly hosts: FxHosts) {
    this.observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(([entry]) => { if (entry) this.size = { width: entry.contentRect.width, height: entry.contentRect.height }; })
      : null;
    this.observer?.observe(hosts.under);
  }

  /** `from` 是上一帧各棋子的位置，`to` 是这一帧（真相）的位置。 */
  run(intents: readonly FxIntent[], from: Readonly<Record<string, PieceSpot>>, to: Readonly<Record<string, PieceSpot>>, context: FxContext): void {
    // 新快照：滚动中的数字先对齐到新的真相，再决定要不要开新的滚动。
    this.settleRolls(context.cash);
    this.meId = context.meId;
    const { scale } = context;
    if (scale <= 0 || !intents.length) { this.listen(); return; }

    const moveEnd: Record<string, number> = {};
    for (const intent of intents) if (intent.type === "movePath") moveEnd[intent.playerId] = this.move(intent, from, to, scale);

    // 金币何时落到谁的席位：先于数字滚动算好（不需要任何矩形）。
    const flights = context.lowEnd ? [] : intents.filter((intent): intent is Extract<FxIntent, { type: "moneyFlight" }> => intent.type === "moneyFlight");
    const settleAt: Record<string, number> = { ...moveEnd };
    const flightDelay = (flight: Extract<FxIntent, { type: "moneyFlight" }>): number => moveEnd[flight.actorId] ?? 0;
    for (const flight of flights) {
      const coins = Math.min(6, Math.max(1, Math.ceil(flight.amount / 100)));
      const end = flightDelay(flight) + (TIMING.coin + (coins - 1) * TIMING.coinStagger) * scale;
      for (const anchor of [flight.from, flight.to]) {
        if (anchor.kind === "seat") settleAt[anchor.playerId] = Math.max(settleAt[anchor.playerId] ?? 0, end);
      }
    }

    const page: FxIntent[] = [];
    for (const intent of intents) {
      switch (intent.type) {
        case "cashRoll": this.roll(intent.playerId, intent.from, intent.to, settleAt[intent.playerId] ?? 0, scale); break;
        case "jailSlam": this.bars(moveEnd[intent.playerId] ?? 0, scale); break;
        case "monopoly": if (!context.lowEnd) this.sweep(intent.tiles, Math.max(0, ...Object.values(moveEnd)), scale); break;
        case "buildRise": this.build(intent.tile, intent.hotel, scale); break;
        case "auctionBid": this.bid(scale); break;
        case "movePath": case "moneyFlight": break;
        default: page.push(intent);
      }
    }
    if (flights.length || page.length) this.later(flights, page, moveEnd, flightDelay, scale);
    this.listen();
  }

  // ---- 棋盘内 ----

  private move(intent: Extract<FxIntent, { type: "movePath" }>, from: Readonly<Record<string, PieceSpot>>, to: Readonly<Record<string, PieceSpot>>, scale: number): number {
    const start = from[intent.playerId];
    const end = to[intent.playerId];
    const element = this.hosts.piece(intent.playerId);
    const { width, height } = this.size;
    if (!start || !end || !element || typeof element.animate !== "function" || !width || !height) return 0;
    const px = (dx: number, dy: number): [number, number] => [(dx / 100) * width, (dy / 100) * height];
    // 同一玩家的旧动画直落终态，再从新起点开演。
    this.finish(intent.playerId);
    const moving = [...this.groups.keys()].filter((key) => !key.includes(":"));
    if (moving.length >= MAX_PARALLEL) this.finish(moving[0]!);

    const delay = intent.afterRoll ? (TIMING.dice + TIMING.diceStagger) * scale : 0;
    const group: Group = { animations: [], nodes: [] };
    // 每一段的终点：中途的格子取格心，最后一步取棋子在终点格的真实站位。
    const points = intent.steps.map((step, index) => (index === intent.steps.length - 1 ? end : centerOf(step.tile)));
    const durations = intent.steps.map((step) => (step.hop ? TIMING.hop : TIMING.step) * scale);
    const total = durations.reduce((sum, value) => sum + value, 0);

    const at = (point: Point, lift: number, grow: number, offset: number, easing: string): Keyframe => {
      const [dx, dy] = px(point.x - end.x, point.y - end.y);
      return { transform: `translate(${dx.toFixed(2)}px, ${(dy - lift).toFixed(2)}px) scale(${grow})`, offset, easing };
    };
    const frames: Keyframe[] = [at(start, 0, 1, 0, "ease-out")];
    let elapsed = 0;
    let previous: Point = start;
    intent.steps.forEach((step, index) => {
      const point = points[index]!;
      const span = durations[index]!;
      const [ddx, ddy] = px(point.x - previous.x, point.y - previous.y);
      // 步行是一次贴地小跳；跳跃的弧高随距离增长，但封顶，避免飞出棋盘。
      const lift = step.hop ? Math.min(height * 0.18, Math.max(18, Math.hypot(ddx, ddy) * 0.3)) : end.size * 0.4;
      frames.push(at({ x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 }, lift, 1.05, (elapsed + span / 2) / total, "ease-in"));
      elapsed += span;
      frames.push(at(point, 0, 1, Math.min(1, elapsed / total), "ease-out"));
      previous = point;
    });
    // fill: backwards —— 等骰子落定期间，棋子停在起点，而不是先闪到终点。
    group.animations.push(element.animate(frames, { duration: total, delay, fill: "backwards" }));

    const last = intent.steps[intent.steps.length - 1]!;
    this.pulse(group, last.tile, delay + total, scale);
    if (intent.bonus) {
      const reached = durations.slice(0, intent.bonus.step + 1).reduce((sum, value) => sum + value, 0);
      this.float(group, 0, `+${formatMoney(intent.bonus.amount)}`, delay + reached, scale);
    }
    this.track(intent.playerId, group);
    return delay + total;
  }

  /** 落地格的一次内描边脉冲：只动一个半透明层的 opacity，不动 box-shadow。 */
  private pulse(group: Group, tile: number, delay: number, scale: number): void {
    const node = this.cellNode("fx-land", tile, this.hosts.under);
    group.nodes.push(node);
    group.animations.push(node.animate(
      [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }],
      { duration: TIMING.land * scale, delay, fill: "backwards", easing: "ease-out" }
    ));
  }

  /** 金额上浮。同一笔钱在日志里也有一行，动画关闭时信息不丢。 */
  private float(group: Group, tile: number, text: string, delay: number, scale: number): void {
    const center = centerOf(tile);
    const node = document.createElement("div");
    node.className = "fx-float num";
    node.textContent = text;
    Object.assign(node.style, { left: `${center.x}%`, top: `${center.y}%` });
    this.hosts.over.append(node);
    group.nodes.push(node);
    group.animations.push(node.animate(
      [
        { transform: "translate(-50%, -30%)", opacity: 0 },
        { transform: "translate(-50%, -110%)", opacity: 1, offset: 0.3 },
        { transform: "translate(-50%, -190%)", opacity: 0 }
      ],
      { duration: TIMING.bonus * scale, delay, fill: "backwards", easing: "ease-out" }
    ));
  }

  /** 进监狱：监狱格上一排栏栅落下，停一下，淡出。 */
  private bars(delay: number, scale: number): void {
    const group: Group = { animations: [], nodes: [] };
    const box = this.cellNode("fx-bars", JAIL_TILE, this.hosts.over);
    const inner = document.createElement("div");
    box.append(inner);
    group.nodes.push(box);
    group.animations.push(inner.animate(
      [
        { transform: "translateY(-100%)", opacity: 1 },
        { transform: "translateY(0)", opacity: 1, offset: 0.4, easing: "ease-in" },
        { transform: "translateY(0)", opacity: 1, offset: 0.75 },
        { transform: "translateY(0)", opacity: 0 }
      ],
      { duration: TIMING.jail * scale * 2, delay, fill: "backwards", easing: "ease-out" }
    ));
    this.track(`jail:${this.seq++}`, group);
  }

  /** 垄断：该区域每一格一道金色扫光（渐变层 translateX + opacity）。 */
  private sweep(tiles: readonly number[], delay: number, scale: number): void {
    const group: Group = { animations: [], nodes: [] };
    for (const tile of tiles) {
      const box = this.cellNode("fx-sweep", tile, this.hosts.under);
      const inner = document.createElement("div");
      box.append(inner);
      group.nodes.push(box);
      group.animations.push(inner.animate(
        [{ transform: "translateX(-120%)", opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: "translateX(220%)", opacity: 0 }],
        { duration: TIMING.sweep * scale * 2, delay, fill: "backwards", easing: "ease-in-out" }
      ));
    }
    this.track(`sweep:${this.seq++}`, group);
  }

  /** 建造：房屋从格底升起 8px 并淡入；成酒店时由"四栋宽"收拢到一座。 */
  private build(tile: number, hotel: boolean, scale: number): void {
    const target = this.board()?.querySelector<HTMLElement>(`[data-build-tile="${tile}"]`);
    if (!target || typeof target.animate !== "function") return;
    const group: Group = { animations: [], nodes: [] };
    group.animations.push(target.animate(
      hotel
        ? [{ transform: "scale(2.2, 0.55)", opacity: 0.35 }, { transform: "scale(1)", opacity: 1 }]
        : [{ transform: "translateY(8px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }],
      { duration: TIMING.build * scale * (hotel ? 1.4 : 1), easing: "cubic-bezier(.2, .8, .3, 1)", fill: "backwards" }
    ));
    this.track(`build:${this.seq++}`, group);
  }

  /** 拍卖出新价：价格数字 1 → 1.12 → 1。 */
  private bid(scale: number): void {
    const target = document.querySelector<HTMLElement>('[data-fx="auction-price"]');
    if (!target || typeof target.animate !== "function") return;
    this.track(`bid:${this.seq++}`, { nodes: [], animations: [target.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.12)", offset: 0.4 }, { transform: "scale(1)" }],
      { duration: TIMING.bid * scale, easing: "ease-out" }
    )] });
  }

  // ---- 棋盘外：一次性 IntersectionObserver 量矩形，不强制同步重排 ----

  private later(
    flights: readonly Extract<FxIntent, { type: "moneyFlight" }>[], intents: readonly FxIntent[],
    moveEnd: Readonly<Record<string, number>>, flightDelay: (flight: Extract<FxIntent, { type: "moneyFlight" }>) => number, scale: number
  ): void {
    const layer = this.hosts.page?.();
    const board = this.board();
    if (!layer || !board) return;
    // 先只收集节点（querySelector 不触发布局），矩形交给 IntersectionObserver 在下一次正常渲染后异步给出。
    // 原先在 rAF 里 getBoundingClientRect / offsetParent，6× 降速下单次强制重排就要几十毫秒。
    const nodesOf = (anchor: FxAnchor): HTMLElement[] =>
      anchor.kind === "tile" ? [board.querySelector<HTMLElement>(`[data-tile="${anchor.tile}"]`)].filter((node): node is HTMLElement => !!node)
        : anchor.kind === "seat" ? [...document.querySelectorAll<HTMLElement>(`[data-seat-card="${CSS.escape(anchor.playerId)}"]`)]
          : [board];
    const wanted = new Set<HTMLElement>([board]);
    const decks = new Map<string, HTMLElement | null>();
    const anchors: FxAnchor[] = [];
    for (const flight of flights) anchors.push(flight.from, flight.to);
    for (const intent of intents) {
      if (intent.type === "cardDraw") decks.set(intent.deck, board.querySelector<HTMLElement>(`[data-deck="${intent.deck}"]`));
      else if (intent.type === "bankruptcy" || intent.type === "turnHandoff") anchors.push({ kind: "seat", playerId: intent.playerId });
      else if (intent.type === "tradeSlide") anchors.push({ kind: "seat", playerId: intent.fromId }, { kind: "seat", playerId: intent.toId });
    }
    for (const anchor of anchors) for (const node of nodesOf(anchor)) wanted.add(node);
    for (const node of decks.values()) if (node) wanted.add(node);

    const started = performance.now();
    this.measure([...wanted], (rects) => {
      // 同一张席位卡可能同时有桌面版与手机版，取当前真正显示（有尺寸）的那张。
      const rectOf = (anchor: FxAnchor): DOMRect | null =>
        nodesOf(anchor).map((node) => rects.get(node)).find((rect): rect is DOMRect => !!rect && rect.width > 0) ?? null;
      // 量矩形要等一帧左右，把这段时间从延迟里扣掉。
      const late = (delay: number): number => Math.max(0, delay - (performance.now() - started));
      const boardRect = rects.get(board);

      for (const flight of flights) {
        const a = rectOf(flight.from);
        const b = rectOf(flight.to);
        if (a && b) this.coins(layer, centre(a), centre(b), flight.amount, late(flightDelay(flight)), scale);
      }
      for (const intent of intents) {
        if (intent.type === "cardDraw") {
          const deckNode = decks.get(intent.deck);
          const deck = deckNode ? rects.get(deckNode) : undefined;
          if (deck && boardRect) this.card(layer, deck, centre(boardRect), intent.deck, intent.title, late(moveEnd[intent.playerId] ?? 0), scale);
        } else if (intent.type === "bankruptcy") {
          const seat = rectOf({ kind: "seat", playerId: intent.playerId });
          if (seat) this.stamp(layer, seat, scale);
        } else if (intent.type === "turnHandoff") {
          const seat = rectOf({ kind: "seat", playerId: intent.playerId });
          if (seat) this.ring(layer, seat, late(Math.max(0, ...Object.values(moveEnd))), scale);
        } else if (intent.type === "tradeSlide") {
          const a = rectOf({ kind: "seat", playerId: intent.fromId });
          const b = rectOf({ kind: "seat", playerId: intent.toId });
          if (a && b) intent.tiles.slice(0, 3).forEach((tile, index) => this.deed(layer, centre(a), centre(b), tile, index, scale));
        } else if (intent.type === "tradeBanner") {
          // 地契飞完再飘横幅，免得两条信息抢同一瞬。
          if (boardRect) this.tradeBanner(layer, boardRect, intent, late(Math.max(0, ...Object.values(moveEnd)) + TIMING.trade * 2), scale);
        }
      }
    });
  }

  /** 一次性量一批节点的视口矩形。IntersectionObserver 的首次回调带着每个目标的 boundingClientRect。 */
  private measure(nodes: readonly HTMLElement[], done: (rects: Map<Element, DOMRect>) => void): void {
    if (typeof IntersectionObserver !== "function") { done(new Map(nodes.map((node) => [node, node.getBoundingClientRect()]))); return; }
    const observer = new IntersectionObserver((entries) => {
      observer.disconnect();
      this.measuring.delete(observer);
      done(new Map(entries.map((entry) => [entry.target, entry.boundingClientRect])));
      this.listen();
    });
    for (const node of nodes) observer.observe(node);
    this.measuring.add(observer);
  }

  /** 收款/付款：最多 6 枚金币沿二次贝塞尔飞过去，起点到终点之间向上拱起。 */
  private coins(layer: HTMLElement, from: Point, to: Point, amount: number, delay: number, scale: number): void {
    const count = Math.min(6, Math.max(1, Math.ceil(amount / 100)));
    const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - Math.max(40, Math.hypot(to.x - from.x, to.y - from.y) * 0.25) };
    const frames: Keyframe[] = [];
    for (let step = 0; step <= 8; step += 1) {
      const t = step / 8;
      const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t ** 2 * to.x;
      const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t ** 2 * to.y;
      frames.push({ transform: `translate(${(x - from.x).toFixed(1)}px, ${(y - from.y).toFixed(1)}px)`, opacity: step === 0 ? 0 : step === 8 ? 0.2 : 1 });
    }
    const group: Group = { animations: [], nodes: [] };
    for (let index = 0; index < count; index += 1) {
      const node = document.createElement("div");
      node.className = "fx-coin";
      Object.assign(node.style, { left: `${from.x}px`, top: `${from.y}px` });
      layer.append(node);
      group.nodes.push(node);
      group.animations.push(node.animate(frames, {
        duration: TIMING.coin * scale, delay: delay + index * TIMING.coinStagger * scale, fill: "both", easing: "cubic-bezier(.4, 0, .6, 1)"
      }));
    }
    this.track(`coin:${this.seq++}`, group);
  }

  /** 抽牌：牌背从牌堆飞到中心、翻面露出标题、停住让人读完，再飞回并淡出。 */
  private card(layer: HTMLElement, deck: DOMRect, target: Point, kind: "chance" | "fund", title: string, delay: number, scale: number): void {
    const node = document.createElement("div");
    node.className = "fx-card";
    Object.assign(node.style, { left: `${deck.left}px`, top: `${deck.top}px`, width: `${deck.width}px`, height: `${deck.height}px` });
    const inner = document.createElement("div");
    inner.className = "fx-card-inner";
    const back = document.createElement("div");
    back.className = `fx-card-face back deck-card ${kind}`;
    const front = document.createElement("div");
    front.className = "fx-card-face front";
    const label = document.createElement("small");
    label.textContent = DECK_NAME[kind];
    const name = document.createElement("b");
    name.textContent = title || "抽到一张";
    front.append(label, name);
    inner.append(back, front);
    node.append(inner);
    layer.append(node);
    const dx = target.x - (deck.left + deck.width / 2);
    const dy = target.y - (deck.top + deck.height / 2);
    const duration = TIMING.card * scale;
    const group: Group = { nodes: [node], animations: [] };
    // 26% 飞到中心，44% 翻完面，86% 之前一直停在中心（约 460ms 的阅读时间），最后一小段飞回并淡出。
    group.animations.push(node.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(1.5)`, opacity: 1, offset: 0.26 },
      { transform: `translate(${dx}px, ${dy}px) scale(1.5)`, opacity: 1, offset: 0.86 },
      { transform: "translate(0, 0) scale(1)", opacity: 0 }
    ], { duration, delay, fill: "both", easing: "ease-in-out" }));
    group.animations.push(inner.animate([
      { transform: "rotateY(180deg)" },
      { transform: "rotateY(180deg)", offset: 0.26 },
      { transform: "rotateY(0deg)", offset: 0.44 },
      { transform: "rotateY(0deg)" }
    ], { duration, delay, fill: "both" }));
    this.track(`card:${this.seq++}`, group);
  }

  /** 破产印章：在席位卡上 scale 1.4 → 1 盖下，停一下后淡出（席位卡本身已永久标注"破产"）。 */
  private stamp(layer: HTMLElement, seat: DOMRect, scale: number): void {
    const node = document.createElement("div");
    node.className = "fx-stamp";
    node.textContent = "破产";
    const at = centre(seat);
    Object.assign(node.style, { left: `${at.x}px`, top: `${at.y}px` });
    layer.append(node);
    const inShare = 220 / TIMING.stamp;
    this.track(`stamp:${this.seq++}`, { nodes: [node], animations: [node.animate([
      { transform: "translate(-50%, -50%) rotate(-12deg) scale(1.4)", opacity: 0 },
      { transform: "translate(-50%, -50%) rotate(-12deg) scale(1)", opacity: 1, offset: inShare, easing: "ease-out" },
      { transform: "translate(-50%, -50%) rotate(-12deg) scale(1)", opacity: 1, offset: 0.8 },
      { transform: "translate(-50%, -50%) rotate(-12deg) scale(1)", opacity: 0 }
    ], { duration: TIMING.stamp * scale, fill: "both" })] });
  }

  /** 回合交接：新行动者席位卡的边框亮一次，不常驻。 */
  private ring(layer: HTMLElement, seat: DOMRect, delay: number, scale: number): void {
    const node = document.createElement("div");
    node.className = "fx-ring";
    Object.assign(node.style, { left: `${seat.left}px`, top: `${seat.top}px`, width: `${seat.width}px`, height: `${seat.height}px` });
    layer.append(node);
    this.track(`ring:${this.seq++}`, { nodes: [node], animations: [node.animate(
      [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }],
      { duration: TIMING.handoff * scale * 2, delay, fill: "both", easing: "ease-out" }
    )] });
  }

  /** 交易：一张小地契从 A 的席位滑到 B 的席位；两个方向同时进行，中途短暂重叠。 */
  private deed(layer: HTMLElement, from: Point, to: Point, tile: number, index: number, scale: number): void {
    const info = commercialAt(tile);
    const node = document.createElement("div");
    node.className = "fx-deed";
    node.style.setProperty("--deed", REGIONS.find((region) => region.id === info?.region)?.color ?? "var(--border-strong)");
    const tileInfo = BOARD_TILES[tile];
    node.textContent = info?.city ?? (tileInfo && !isCommercial(tileInfo) ? tileInfo.name : "");
    Object.assign(node.style, { left: `${from.x}px`, top: `${from.y + index * 6}px` });
    layer.append(node);
    this.track(`deed:${this.seq++}`, { nodes: [node], animations: [node.animate([
      { transform: "translate(-50%, -50%) scale(0.9)", opacity: 0 },
      { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.15 },
      { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(1)`, opacity: 1, offset: 0.85 },
      { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(0.9)`, opacity: 0 }
    ], { duration: TIMING.trade * scale * 2, delay: index * 60 * scale, fill: "both", easing: "ease-in-out" })] });
  }

  /** 交易达成：一条横幅从棋盘右侧滑入，在中间停一下，再向左滑出。 */
  private tradeBanner(layer: HTMLElement, board: DOMRect, intent: Extract<FxIntent, { type: "tradeBanner" }>, delay: number, scale: number): void {
    const node = document.createElement("div");
    node.className = "fx-trade-banner";
    if (intent.fromId === this.meId || intent.toId === this.meId) node.dataset.mine = "1";

    const title = document.createElement("span");
    title.className = "tb-title";
    title.textContent = "交易达成";

    const side = (name: string, seat: number, items: string[]): HTMLElement => {
      const wrap = document.createElement("span");
      wrap.className = "tb-side";
      const dot = document.createElement("i");
      dot.className = "tb-dot";
      dot.style.background = seatColor(seat);
      const who = document.createElement("b");
      who.className = "tb-name";
      who.textContent = name;
      wrap.append(dot, who);
      if (items.length) {
        const what = document.createElement("span");
        what.className = "tb-items";
        what.textContent = `给 ${items.join(" · ")}`;
        wrap.append(what);
      }
      return wrap;
    };
    const swap = document.createElement("span");
    swap.className = "tb-swap";
    swap.setAttribute("aria-hidden", "true");
    swap.textContent = "⇄";

    const fromItems = [...intent.give, ...(intent.money ? [formatMoney(intent.money)] : [])];
    node.append(title, side(intent.fromName, intent.fromSeat, fromItems), swap, side(intent.toName, intent.toSeat, intent.take));

    // 横幅只走棋盘中间那块空地：左右两列的 14 格必须一直露着，所以宽度封在环内圈的 78% 以内。
    const width = Math.min(620, Math.max(200, board.width * 0.78));
    Object.assign(node.style, {
      left: `${board.left + (board.width - width) / 2}px`,
      top: `${board.top + board.height * 0.3}px`,
      width: `${width}px`
    });
    layer.append(node);

    // 起点在右边、终点在左边：滑入 → 停在正中读得完 → 滑出。行程不超出内圈两侧的余量，免得滑行时压到格子。
    const travel = Math.max(10, Math.min(34, (board.width * 0.85 - width) / 2));
    this.track(`trade:${this.seq++}`, { nodes: [node], animations: [node.animate([
      { transform: `translateX(${travel.toFixed(1)}px)`, opacity: 0 },
      { transform: "translateX(0)", opacity: 1, offset: 0.12, easing: "ease-out" },
      { transform: "translateX(0)", opacity: 1, offset: 0.84 },
      { transform: `translateX(${(-travel).toFixed(1)}px)`, opacity: 0, easing: "ease-in" }
    ], { duration: TIMING.tradeBanner * scale, delay, fill: "backwards" })] });
  }

  // ---- 现金数字滚动：一次 rAF 循环只写文本节点，不触发 React 重渲染 ----

  private roll(playerId: string, from: number, to: number, delay: number, scale: number): void {
    const nodes = [...document.querySelectorAll<HTMLElement>(`[data-cash="${CSS.escape(playerId)}"]`)];
    if (!nodes.length || typeof requestAnimationFrame !== "function") return;
    for (const node of nodes) writeText(node, formatMoney(from));
    const duration = TIMING.cashRoll * scale;
    const begin = performance.now() + delay;
    const state: Roll = { to, frame: 0, nodes };
    const tick = (now: number): void => {
      const t = (now - begin) / duration;
      if (t >= 1) { this.endRoll(playerId, to); return; }
      if (t > 0) {
        const eased = 1 - (1 - t) ** 3;
        const text = formatMoney(from + (to - from) * eased);
        for (const node of nodes) writeText(node, text);
      }
      state.frame = requestAnimationFrame(tick);
    };
    state.frame = requestAnimationFrame(tick);
    this.rolls.set(playerId, state);
  }

  private endRoll(playerId: string, value: number): void {
    const state = this.rolls.get(playerId);
    if (!state) return;
    cancelAnimationFrame(state.frame);
    for (const node of state.nodes) writeText(node, formatMoney(value));
    this.rolls.delete(playerId);
    this.listen();
  }

  /** 新快照到达：所有滚动中的数字立刻写成新真相。 */
  private settleRolls(cash: Readonly<Record<string, number>>): void {
    for (const [playerId, state] of [...this.rolls]) this.endRoll(playerId, cash[playerId] ?? state.to);
  }

  // ---- 记账、跳过、清理 ----

  private board(): HTMLElement | null {
    return this.hosts.under.closest<HTMLElement>(".monopoly-board");
  }

  private cellNode(className: string, tile: number, host: HTMLElement): HTMLElement {
    const cell = layoutOf(tile);
    const node = document.createElement("div");
    node.className = className;
    Object.assign(node.style, { left: `${cell.x}%`, top: `${cell.y}%`, width: `${cell.w}%`, height: `${cell.h}%` });
    host.append(node);
    return node;
  }

  private track(key: string, group: Group): void {
    if (!group.animations.length) { for (const node of group.nodes) node.remove(); return; }
    this.groups.set(key, group);
    void Promise.allSettled(group.animations.map((animation) => animation.finished)).then(() => {
      if (this.groups.get(key) === group) this.groups.delete(key);
      for (const node of group.nodes) node.remove();
      this.listen();
    });
  }

  /** 某一组直落终态。 */
  private finish(key: string): void {
    const group = this.groups.get(key);
    if (!group) return;
    this.groups.delete(key);
    for (const animation of group.animations) animation.finish();
  }

  /** 跳过：所有动画直落终态；还没开演的棋盘外动画直接不演（真相早已画好）。 */
  finishAll = (): void => {
    for (const observer of this.measuring) observer.disconnect();
    this.measuring.clear();
    for (const key of [...this.groups.keys()]) this.finish(key);
    for (const [playerId, state] of [...this.rolls]) this.endRoll(playerId, state.to);
    this.listen();
  };

  private readonly onKey = (event: KeyboardEvent): void => { if (event.key === "Escape") this.finishAll(); };

  get busy(): boolean { return this.groups.size > 0 || this.rolls.size > 0 || this.measuring.size > 0; }

  /** 只在有动画在播时监听"点任意处跳过"；不拦截事件，点击照常落到按钮上。 */
  private listen(): void {
    const want = this.busy;
    if (want === this.listening || typeof window === "undefined") return;
    this.listening = want;
    this.hosts.onBusy?.(want);
    if (want) {
      window.addEventListener("pointerdown", this.finishAll, { capture: true, passive: true });
      window.addEventListener("keydown", this.onKey, { capture: true });
    } else {
      window.removeEventListener("pointerdown", this.finishAll, { capture: true });
      window.removeEventListener("keydown", this.onKey, { capture: true });
    }
  }

  dispose(): void {
    this.observer?.disconnect();
    for (const observer of this.measuring) observer.disconnect();
    this.measuring.clear();
    for (const group of this.groups.values()) {
      for (const animation of group.animations) animation.cancel();
      for (const node of group.nodes) node.remove();
    }
    this.groups.clear();
    for (const [playerId, state] of [...this.rolls]) this.endRoll(playerId, state.to);
    this.listen();
  }
}
