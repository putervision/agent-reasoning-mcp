import crypto from 'crypto';
import {
  StatePack,
  VisualSlice,
  SpatialSlice,
  TaskSlice,
  VitalsSlice,
  UtilitySlice,
  SituationSnapshot,
} from '../schema/types.js';
import { canonicalJsonStringify } from '../utils/canonical-json.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';

export function computePackHash(packWithoutHash: Omit<StatePack, 'pack_hash'>): string {
  const canonicalJson = canonicalJsonStringify(packWithoutHash);
  return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

export function verifyPackHash(pack: StatePack): boolean {
  const { pack_hash, ...rest } = pack;
  const expected = computePackHash(rest);
  return pack_hash === expected;
}

export interface StatePackBuilderOptions {
  pack_id?: string;
  project: string;
  session_id: string;
  timestamp?: string;
  visual?: VisualSlice;
  spatial?: SpatialSlice;
  tasks?: TaskSlice;
  vitals?: VitalsSlice;
  utility?: UtilitySlice;
}

export class StatePackBuilder {
  static build(options: StatePackBuilderOptions): StatePack {
    const pack_id = options.pack_id || generateId();
    const timestamp = options.timestamp || getCurrentIsoString();

    const partialPack: Omit<StatePack, 'pack_hash'> = {
      pack_id,
      timestamp,
      project: options.project,
      session_id: options.session_id,
      ...(options.visual ? { visual: options.visual } : {}),
      ...(options.spatial ? { spatial: options.spatial } : {}),
      ...(options.tasks ? { tasks: options.tasks } : {}),
      ...(options.vitals ? { vitals: options.vitals } : {}),
      ...(options.utility ? { utility: options.utility } : {}),
    };

    const pack_hash = computePackHash(partialPack);

    return {
      ...partialPack,
      pack_hash,
    };
  }

  static fromSituationSnapshot(
    snapshot: SituationSnapshot,
    options: { project: string; pack_id?: string }
  ): StatePack {
    let visual: VisualSlice | undefined;
    if (snapshot.vision) {
      const desc = snapshot.vision.description || '';
      const summary = desc.length > 120 ? desc.slice(0, 117) + '...' : desc;
      const elementsCount = snapshot.vision.grounded_elements?.length || 0;
      const layoutHash = crypto
        .createHash('sha256')
        .update(snapshot.vision.current_state_id || desc || 'empty', 'utf8')
        .digest('hex');

      visual = {
        state_id: snapshot.vision.current_state_id || 'unknown_state',
        layout_hash: layoutHash,
        description_summary: summary,
        interactive_element_count: elementsCount,
      };
    }

    let spatial: SpatialSlice | undefined;
    if (snapshot.world) {
      const observerPos = snapshot.world.observer_position || [0, 0, 0];
      const entities = (snapshot.world.entities || []).slice(0, 16).map((e) => {
        const dx = e.position[0] - observerPos[0];
        const dy = e.position[1] - observerPos[1];
        const dz = e.position[2] - observerPos[2];
        const distance = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz) * 100) / 100;
        return {
          id: e.id,
          type: e.type,
          distance,
          status: e.status,
        };
      });

      spatial = {
        observer_position: observerPos,
        nearby_entities: entities,
      };
    }

    let tasks: TaskSlice | undefined;
    if (snapshot.state) {
      const activeGoal = snapshot.state.active_goals?.[0];
      const blockers = (snapshot.state.blockers || []).map((b) => ({
        id: b.id,
        description: b.description,
      }));
      const recentDecisionIds = (snapshot.state.recent_decisions || snapshot.state.decisions || [])
        .slice(0, 3)
        .map((d) => d.id);

      tasks = {
        ...(activeGoal
          ? {
              active_goal: {
                id: activeGoal.id,
                title: activeGoal.title,
                priority: activeGoal.priority,
                progress: 0.0,
              },
            }
          : {}),
        active_blockers: blockers,
        recent_decision_ids: recentDecisionIds,
      };
    }

    let vitals: VitalsSlice | undefined;
    if (snapshot.vitals) {
      vitals = {
        hp: snapshot.vitals.hp,
        threat_level: snapshot.vitals.threat_level,
        resources: snapshot.vitals.resources,
      };
    }

    return this.build({
      pack_id: options.pack_id,
      project: options.project,
      session_id: snapshot.session_id,
      timestamp: snapshot.timestamp,
      visual,
      spatial,
      tasks,
      vitals,
    });
  }

  static validate(pack: unknown): pack is StatePack {
    if (!pack || typeof pack !== 'object') return false;
    const p = pack as Record<string, unknown>;
    if (typeof p.pack_id !== 'string' || !p.pack_id) return false;
    if (typeof p.pack_hash !== 'string' || !p.pack_hash) return false;
    if (typeof p.timestamp !== 'string' || !p.timestamp) return false;
    if (typeof p.project !== 'string' || !p.project) return false;
    if (typeof p.session_id !== 'string' || !p.session_id) return false;
    return true;
  }
}
