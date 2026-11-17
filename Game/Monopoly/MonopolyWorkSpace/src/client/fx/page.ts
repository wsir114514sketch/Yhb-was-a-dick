/**
 * 页面级动效层的登记处：GameTable 渲染一个固定定位、不接收指针的空层并在这里登记，
 * 棋盘里的执行器用它来画跨出棋盘的动画（飞向席位卡的金币、印章、地契）。
 */

let layer: HTMLElement | null = null;

export const setPageLayer = (node: HTMLElement | null): void => { layer = node; };
export const pageLayer = (): HTMLElement | null => layer;
