export type QualityLevel = 'low' | 'medium' | 'high';
export interface QualityPreset {
  label: string; dpr: [number, number]; shadows: boolean; shadowMapSize: number;
  postFX: boolean; bloom: boolean; ao: boolean; vignette: boolean;
  /** high-only candy fringe; subtle + cheap */
  chromaticAberration: boolean;
  /** high-only edge AA when native MSAA is weak under EffectComposer */
  smaa: boolean;
  /** soft contact blob under menu pedestal / preview (cheap, gated) */
  contactShadows: boolean;
  decorDensity: number; // 0..1 multiplier for instanced decor (sprinkles, trees)
  antialias: boolean;
  /** ACES exposure punch; candy trailer look on high */
  exposure: number;
  bloomIntensity: number;
}
export const QUALITY: Record<QualityLevel, QualityPreset> = {
  low: {
    label: '低 Low', dpr: [1, 1], shadows: false, shadowMapSize: 512,
    postFX: false, bloom: false, ao: false, vignette: false,
    chromaticAberration: false, smaa: false, contactShadows: false,
    decorDensity: 0.35, antialias: false, exposure: 1.05, bloomIntensity: 0,
  },
  medium: {
    label: '中 Medium', dpr: [1, 1.5], shadows: true, shadowMapSize: 1024,
    postFX: true, bloom: false, ao: false, vignette: true,
    chromaticAberration: false, smaa: false, contactShadows: true,
    decorDensity: 0.7, antialias: true, exposure: 1.1, bloomIntensity: 0,
  },
  high: {
    label: '高 High', dpr: [1, 2], shadows: true, shadowMapSize: 2048,
    postFX: true, bloom: true, ao: true, vignette: true,
    chromaticAberration: true, smaa: true, contactShadows: true,
    decorDensity: 1, antialias: true, exposure: 1.15, bloomIntensity: 0.48,
  },
};
export const QUALITY_ORDER: QualityLevel[] = ['low', 'medium', 'high'];
