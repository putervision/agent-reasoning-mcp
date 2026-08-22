export interface VisionBridgeData {
  current_state_id?: string;
  description?: string;
  grounded_elements: Array<{ selector: string; label: string }>;
}

export class VisionBridge {
  static normalizeVisionData(rawVisionData: any): VisionBridgeData {
    if (!rawVisionData || typeof rawVisionData !== 'object') {
      return { grounded_elements: [] };
    }
    return {
      current_state_id: rawVisionData.current_state_id,
      description: rawVisionData.description,
      grounded_elements: Array.isArray(rawVisionData.grounded_elements) ? rawVisionData.grounded_elements : [],
    };
  }
}
