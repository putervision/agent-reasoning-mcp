export interface StateBridgeData {
  tasks: Array<{ id: string; title: string; status: string; priority: number }>;
  blockers: Array<{ id: string; description: string }>;
  decisions: Array<{ id: string; recommendation: string }>;
}

export class StateBridge {
  static normalizeStateData(rawStateData: any): StateBridgeData {
    if (!rawStateData || typeof rawStateData !== 'object') {
      return { tasks: [], blockers: [], decisions: [] };
    }
    return {
      tasks: Array.isArray(rawStateData.tasks) ? rawStateData.tasks : [],
      blockers: Array.isArray(rawStateData.blockers) ? rawStateData.blockers : [],
      decisions: Array.isArray(rawStateData.decisions) ? rawStateData.decisions : [],
    };
  }
}
