export interface WorldBridgeData {
  entities: Array<{ id: string; type: string; position: [number, number, number]; status: string }>;
  relations: Array<{ source: string; relation: string; target: string }>;
  observer_position?: [number, number, number];
}

export class WorldBridge {
  static normalizeWorldData(rawWorldData: any): WorldBridgeData {
    if (!rawWorldData || typeof rawWorldData !== 'object') {
      return { entities: [], relations: [] };
    }
    return {
      entities: Array.isArray(rawWorldData.entities) ? rawWorldData.entities : [],
      relations: Array.isArray(rawWorldData.relations) ? rawWorldData.relations : [],
      observer_position: rawWorldData.observer_position,
    };
  }
}
