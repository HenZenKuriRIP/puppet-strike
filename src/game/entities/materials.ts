import * as THREE from 'three';
import type { QualityLevel } from '../../config/quality';

/** Shared material cache – one instance per (kind,color,tier) so repeated parts don't allocate. */
const cache = new Map<string, THREE.Material>();
const memo = <T extends THREE.Material>(key: string, make: () => T): T => { let m = cache.get(key) as T | undefined; if (!m) { m = make(); cache.set(key, m); } return m; };

/** Visual tier for expensive Material Physical features (transmission). Canvas remounts on quality change. */
let tier: QualityLevel = 'medium';
export function setMaterialTier(q: QualityLevel) { tier = q; }

export const plush = (color: string, tag = '') => memo(`plush:${color}:${tag}:${tier}`, () => {
  const base = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.78, metalness: 0,
    sheen: 1, sheenRoughness: 0.48, sheenColor: base.clone().lerp(new THREE.Color('#ffffff'), 0.55),
    // light candy shimmer — cheap on mobile Physical path
    iridescence: tier === 'high' ? 0.14 : 0.06,
    iridescenceIOR: 1.28,
  });
});
export const vinyl = (color: string, tag = '') => memo(`vinyl:${color}:${tag}:${tier}`, () => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12,
  reflectivity: 0.55,
}));
export const metal = (color: string, tag = '') => memo(`metal:${color}:${tag}:${tier}`, () => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.24, metalness: 0.62, clearcoat: 0.75, clearcoatRoughness: 0.16,
}));
export const glossy = (color: string) => memo(`glossy:${color}:${tier}`, () => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, reflectivity: 0.85,
}));
export const glow = (color: string, intensity = 1.35) => memo(`glow:${color}:${intensity}`, () => new THREE.MeshStandardMaterial({
  color, emissive: color, emissiveIntensity: intensity, toneMapped: false,
}));
export const flat = (color: string) => memo(`flat:${color}`, () => new THREE.MeshBasicMaterial({ color }));
export const glass = (color: string, opacity = 0.45) => memo(`glass:${color}:${opacity}:${tier}`, () => {
  const hi = tier === 'high';
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.03,
    transmission: hi ? 0.55 : 0, thickness: hi ? 0.35 : 0,
    transparent: true, opacity: hi ? Math.min(0.4, opacity) : opacity,
    clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.45, depthWrite: false,
  });
});
export const surface = (kind: 'plush' | 'vinyl' | 'metal', color: string, tag = '') => (kind === 'plush' ? plush(color, tag) : kind === 'vinyl' ? vinyl(color, tag) : metal(color, tag));
