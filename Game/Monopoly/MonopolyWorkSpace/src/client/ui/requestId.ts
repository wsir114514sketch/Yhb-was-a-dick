/**
 * 银行操作的请求编号：每次点击生成一个新的随机串，服务器用"同一个编号只受理一次"来防重放。
 * 放在单独的小文件里，银行面板和筹款面板共用同一套写法。
 */
export function newRequestId(): string {
  return `bank-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
