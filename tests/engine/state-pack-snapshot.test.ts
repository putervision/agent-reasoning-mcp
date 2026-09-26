import { describe, it, expect } from 'vitest';
import { StatePackBuilder, verifyPackHash } from '../../src/engine/state-pack.js';

describe('StatePackBuilder.fromSnapshot Comprehensive Coverage', () => {
  it('constructs a complete StatePack from rich environment snapshots', () => {
    const longDesc = 'A'.repeat(150);
    const entities = Array.from({ length: 20 }, (_, i) => ({
      id: `ent_${i}`,
      type: i % 2 === 0 ? 'drone' : 'terminal',
      position: [i * 2, i, 5] as [number, number, number],
      status: 'active',
    }));

    const pack = StatePackBuilder.fromSituationSnapshot(
      {
        vision: {
          current_state_id: 'vs_scene_42',
          description: longDesc,
          grounded_elements: [{ selector: '#btn', coords: [10, 20] }] as any,
        },
        world: {
          observer_position: [0, 0, 0],
          entities,
        },
        state: {
          active_goals: [{ id: 'goal_main', title: 'Main Mission', priority: 0.95 }],
          blockers: [{ id: 'blk_door', description: 'Locked blast door' }],
          recent_decisions: [{ id: 'dec_1' }, { id: 'dec_2' }, { id: 'dec_3' }, { id: 'dec_4' }] as any,
        },
        vitals: {
          hp: 75.5,
          threat_level: 0.4,
          resources: { ammo: 120 },
        },
      },
      {
        project: 'snapshot_coverage_test',
        pack_id: 'pack_custom_001',
      }
    );

    expect(pack.pack_id).toBe('pack_custom_001');
    expect(pack.project).toBe('snapshot_coverage_test');
    expect(pack.visual?.state_id).toBe('vs_scene_42');
    expect(pack.visual?.description_summary.length).toBe(120);
    expect(pack.visual?.interactive_element_count).toBe(1);

    expect(pack.spatial?.nearby_entities.length).toBe(16); // capped at 16
    expect(pack.tasks?.active_goal?.id).toBe('goal_main');
    expect(pack.tasks?.active_blockers.length).toBe(1);
    expect(pack.tasks?.recent_decision_ids.length).toBe(3); // capped at 3
    expect(pack.vitals?.hp).toBe(75.5);

    expect(verifyPackHash(pack)).toBe(true);
  });

  it('handles sparse/empty snapshots gracefully with fallbacks', () => {
    const pack = StatePackBuilder.fromSituationSnapshot(
      {
        vision: {
          description: 'short desc',
        },
        world: {},
        state: {
          decisions: [{ id: 'd_fallback' }] as any,
        },
      },
      { project: 'sparse_test' }
    );

    expect(pack.visual?.state_id).toBe('unknown_state');
    expect(pack.visual?.description_summary).toBe('short desc');
    expect(pack.spatial?.observer_position).toEqual([0, 0, 0]);
    expect(pack.spatial?.nearby_entities).toEqual([]);
    expect(pack.tasks?.recent_decision_ids).toEqual(['d_fallback']);
    expect(pack.vitals).toBeUndefined();
    expect(verifyPackHash(pack)).toBe(true);
  });
});
