/** M6: sim → render/net event queue. Events carry the host sim time so a client can fire them at the right moment. */
export type NetEv = [number, string, ...unknown[]];
export const evq = { recording: false, now: 0, list: [] as NetEv[] };
export const MAX_EVENTS = 400;
export function emit(k: string, ...a: unknown[]) {
  if (!evq.recording) return;
  if (evq.list.length < MAX_EVENTS) evq.list.push([Math.round(evq.now * 1000) / 1000, k, ...a]);
}
export const r2 = (x: number) => Math.round(x * 100) / 100;
export function drain(): NetEv[] { const l = evq.list; evq.list = []; return l; }
