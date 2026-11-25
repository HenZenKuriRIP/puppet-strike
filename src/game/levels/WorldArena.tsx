// W2: picks the scenery for the live world. Remounted (key) whenever `setWorld` swaps the map, so static colliders + instanced decor are rebuilt.
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { Arena } from './Arena';
import { BlockCity } from './BlockCity';
import { Toys } from './Toys';
import { STATIC_BOXES } from './arenaLayout';
import { useWorldId } from './worlds';

function BlockArena({ density }: { density: number }) {
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[90, 0.5, 90]} position={[0, -0.5, 0]} />
        {STATIC_BOXES.map((b, i) => <CuboidCollider key={i} args={[(b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2]} position={[(b.max.x + b.min.x) / 2, (b.max.y + b.min.y) / 2, (b.max.z + b.min.z) / 2]} />)}
      </RigidBody>
      <BlockCity density={density} />
      <Toys />
    </group>
  );
}

export function WorldArena({ density = 1 }: { density?: number }) {
  const wid = useWorldId();
  return wid === 'block' ? <BlockArena key="block" density={density} /> : <Arena key="candy" density={density} />;
}
