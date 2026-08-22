export const TOOL_ALIASES: Record<string, string> = {
  add_goal: 'set_goal',
  create_goal: 'set_goal',
  update_goal: 'set_goal',
  decompose: 'decompose_goal',
  subgoals: 'decompose_goal',
  add_belief: 'update_belief',
  set_belief: 'update_belief',
  beliefs: 'query_beliefs',
  search_beliefs: 'query_beliefs',
  evaluate: 'evaluate_situation',
  situation: 'evaluate_situation',
  utility: 'calculate_utility',
  score: 'calculate_utility',
  risk: 'assess_risk',
  threat: 'assess_risk',
  replan: 'replan_goal',
  adapt: 'replan_goal',
  dispatch: 'manage_intentions',
  intentions: 'manage_intentions',
  weights: 'set_utility_weights',
  personality: 'set_utility_weights',
  trace: 'record_decision_trace',
  history: 'record_decision_trace',
};

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export class SchemaAdvisor {
  static resolveAlias(toolName: string): string | undefined {
    return TOOL_ALIASES[toolName.toLowerCase()];
  }

  static getAdvice(toolName: string, error: string, availableTools: string[]): string {
    const alias = this.resolveAlias(toolName);
    if (alias) {
      return `Tool "${toolName}" is an alias. Did you mean to call "${alias}"?`;
    }

    let closest = '';
    let minDistance = Infinity;
    for (const tool of availableTools) {
      const dist = levenshtein(toolName.toLowerCase(), tool.toLowerCase());
      if (dist < minDistance && dist <= 3) {
        minDistance = dist;
        closest = tool;
      }
    }

    if (closest) {
      return `Tool "${toolName}" not found. Did you mean "${closest}"? (${error})`;
    }

    return `Invalid tool call "${toolName}": ${error}`;
  }
}
