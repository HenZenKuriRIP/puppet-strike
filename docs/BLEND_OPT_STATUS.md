# Blender kit deep-opt status (v0.1.9-blend)

## Assets (user-blender-lab MCP · Blender 5.2.2 LTS)

| File | Path | Notes |
|------|------|-------|
| Kit blend | `tools/blender/puppet_strike_kit.blend` | Hero + 4 weapons + 4 props, candy Principled BSDF |
| Hero GLB | `public/models/hero.glb` | ~83 KB Draco |
| Weapons GLB | `public/models/weapons.glb` | ~64 KB Draco · roots `CandySMG` `BubbleLauncher` `RainbowShotgun` `SpringRocket` |
| Props GLB | `public/models/props.glb` | ~24 KB Draco · roots `Gumdrop` `Lollipop` `CakeChunk` `SprinkleStar` |
| Stills | `docs/screenshots/blend-{kit-overview,hero,weapons,props}.png` | Beauty + kit overview |

Total GLB ≈ **170 KB** (well under 2–3 MB mobile budget).

## Integration choices

| Slot | Choice | Why |
|------|--------|-----|
| In-game character | **Procedural `Puppet`** | Live expressions, wave, character variants, aim/weapon attach |
| Main-menu showcase | **`BlenderHero` GLB** + `GlbBoundary` → Puppet | Static candy hero from kit; picker view still uses Puppet |
| Weapons (in-hand) | **`weapons.glb` via `BlenderWeaponModels`** + procedural fallback | Same 4-slot ref API; muzzle/barrel aligned -Z |
| Arena accents | **`BlenderPropAccents`** (8 spots) | Complements existing instanced sprinkles/lollies — does not replace |

Loader: `src/game/assets/BlenderKit.tsx` (`useGLTF`, preload, `GlbBoundary`).

## Untouched (hard rules)

Combat formulas, net protocol, touch/HUD layout, quality tiers — unchanged.
