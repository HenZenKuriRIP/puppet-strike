import { Puppet } from './Puppet';
import { getCharacter, CharacterId } from '../characters/registry';
import { useUI } from '../../app/store';
import { useNet } from '../../net/netStore';
import { SkillProps } from './Boss';

/** In-game player puppet(s): single-player renders the selected character; co-op renders one per slot (own + partner). */
export function Mochi() {
  const id = useUI((s) => s.character);
  const coop = useUI((s) => s.coop), chars = useNet((s) => s.chars);
  if (coop && chars.length > 1) return <>{chars.map((c, i) => <group key={c + i}><Puppet spec={getCharacter(c as CharacterId)} mode="game" slot={i} /><SkillProps slot={i} /></group>)}</>;
  return <><Puppet key={id} spec={getCharacter(id)} mode="game" /><SkillProps /></>;
}
