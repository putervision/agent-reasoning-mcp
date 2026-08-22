import { describe, it, expect } from 'vitest';
import { server } from '../../src/server.js';
import { toolDefinitions } from '../../src/tools/definitions.js';

describe('MCP Server Registration', () => {
  it('registers all 10 MCP tools', () => {
    expect(toolDefinitions).toHaveLength(10);
    const names = toolDefinitions.map((t) => t.name);
    expect(names).toContain('set_goal');
    expect(names).toContain('evaluate_situation');
    expect(names).toContain('replan');
    expect(names).toContain('assess_risk');
    expect(names).toContain('query_knowledge');
    expect(names).toContain('set_utility_weights');
    expect(names).toContain('get_decision_trace');
    expect(names).toContain('manage_beliefs');
    expect(names).toContain('manage_intentions');
    expect(names).toContain('manage_reasoning_db');
  });
});
