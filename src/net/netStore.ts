import { create } from 'zustand';
import type { RoomInfo, GameMode } from './protocol';

export type NetStatus = 'idle' | 'connecting' | 'lobby' | 'waiting' | 'ready' | 'playing' | 'error';
export interface NetState {
  status: NetStatus; role: 'none' | 'host' | 'client'; code: string; rooms: RoomInfo[]; url: string;
  myChar: string; partnerChar: string; partnerName: string; myName: string;
  chars: string[]; mode: GameMode; stage: number; error: string; lag: number; lagOk: boolean;
  set: (p: Partial<NetState>) => void;
}
export const useNet = create<NetState>((set) => ({
  status: 'idle', role: 'none', code: '', rooms: [], url: '', myChar: 'mochi', partnerChar: '', partnerName: '', myName: 'Player',
  chars: [], mode: 'survival', stage: 1, error: '', lag: 0, lagOk: true,
  set: (p) => set(p),
}));
