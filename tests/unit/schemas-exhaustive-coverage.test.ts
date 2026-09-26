import { describe, it, expect } from 'vitest';
import {
  z,
  StringSchema,
  NumberSchema,
  BooleanSchema,
  EnumSchema,
  ArraySchema,
  RecordSchema,
  ObjectSchema,
  UnknownSchema,
  SetGoalSchema,
  EvaluateSituationSchema,
  ReplanSchema,
  AssessRiskSchema,
  QueryKnowledgeSchema,
  SetUtilityWeightsSchema,
  GetDecisionTraceSchema,
  ManageBeliefsSchema,
  ManageIntentionsSchema,
  ManageReasoningDbSchema,
} from '../../src/schema/schemas.js';

describe('Exhaustive Schema Validation Suite', () => {
  describe('StringSchema', () => {
    it('handles valid strings, defaults, and optional', () => {
      const s = z.string().describe('test string');
      expect(s.parse('hello')).toBe('hello');
      expect(s.toJsonSchema()).toEqual({ type: 'string', description: 'test string' });

      const sOpt = z.string().optional();
      expect(sOpt.parse(undefined)).toBeUndefined();
      expect(sOpt.parse(null)).toBeUndefined();

      const sDef = z.string().default('fallback');
      expect(sDef.parse(undefined)).toBe('fallback');
      expect(sDef.parse(null)).toBe('fallback');
    });

    it('throws or fails safeParse on invalid input', () => {
      const s = z.string();
      expect(() => s.parse(123)).toThrow('must be a string');
      expect(() => s.parse(undefined)).toThrow('is required');

      const res = s.safeParse(123);
      expect(res.success).toBe(false);
      expect(res.error?.message).toContain('must be a string');
      expect(res.error?.errors.length).toBe(1);

      const good = s.safeParse('ok');
      expect(good.success).toBe(true);
      expect(good.data).toBe('ok');
    });

    it('supports chainable modifiers without errors', () => {
      const s = z.string().min(1).max(10).int().positive();
      expect(s.parse('abc')).toBe('abc');
    });
  });

  describe('NumberSchema', () => {
    it('handles numbers, defaults, optional, and errors', () => {
      const n = z.number().describe('a number');
      expect(n.parse(42)).toBe(42);
      expect(n.toJsonSchema()).toEqual({ type: 'number', description: 'a number' });

      const nOpt = z.number().optional();
      expect(nOpt.parse(undefined)).toBeUndefined();

      const nDef = z.number().default(100);
      expect(nDef.parse(undefined)).toBe(100);

      expect(() => n.parse('not a number')).toThrow('must be a number');
      expect(() => n.parse(NaN)).toThrow('must be a number');
      expect(() => n.parse(undefined)).toThrow('is required');

      const badRes = n.safeParse('xyz');
      expect(badRes.success).toBe(false);
    });
  });

  describe('BooleanSchema', () => {
    it('handles booleans, defaults, optional, and errors', () => {
      const b = z.boolean().describe('flag');
      expect(b.parse(true)).toBe(true);
      expect(b.parse(false)).toBe(false);
      expect(b.toJsonSchema()).toEqual({ type: 'boolean', description: 'flag' });

      const bOpt = z.boolean().optional();
      expect(bOpt.parse(undefined)).toBeUndefined();

      const bDef = z.boolean().default(true);
      expect(bDef.parse(undefined)).toBe(true);

      expect(() => b.parse('true')).toThrow('must be a boolean');
      expect(() => b.parse(undefined)).toThrow('is required');
    });
  });

  describe('EnumSchema', () => {
    it('handles enum options, defaults, and invalid values', () => {
      const e = z.enum(['apple', 'banana'] as const).describe('fruit');
      expect(e.parse('apple')).toBe('apple');
      expect(e.toJsonSchema()).toEqual({
        type: 'string',
        enum: ['apple', 'banana'],
        description: 'fruit',
      });

      const eOpt = e.optional();
      expect(eOpt.parse(undefined)).toBeUndefined();

      const eDef = e.default('banana');
      expect(eDef.parse(undefined)).toBe('banana');

      expect(() => e.parse('orange')).toThrow('must be one of: apple, banana');
      expect(() => e.parse(123)).toThrow('must be one of: apple, banana');
      expect(() => e.parse(undefined)).toThrow('is required');
    });
  });

  describe('ArraySchema', () => {
    it('handles arrays of elements, nested schema parsing, and errors', () => {
      const arr = z.array(z.string()).describe('list of strings');
      expect(arr.parse(['a', 'b'])).toEqual(['a', 'b']);
      expect(arr.toJsonSchema()).toEqual({
        type: 'array',
        items: { type: 'string' },
        description: 'list of strings',
      });

      const arrOpt = arr.optional();
      expect(arrOpt.parse(undefined)).toBeUndefined();

      const arrDef = arr.default(['default']);
      expect(arrDef.parse(undefined)).toEqual(['default']);

      expect(() => arr.parse('not an array')).toThrow('must be an array');
      expect(() => arr.parse(['valid', 123])).toThrow('value[1] must be a string');
      expect(() => arr.parse(undefined)).toThrow('is required');
    });
  });

  describe('RecordSchema', () => {
    it('handles key-value maps and validation errors', () => {
      const rec = z.record(z.number()).describe('weights');
      expect(rec.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
      expect(rec.toJsonSchema()).toEqual({
        type: 'object',
        additionalProperties: { type: 'number' },
        description: 'weights',
      });

      const recOpt = rec.optional();
      expect(recOpt.parse(undefined)).toBeUndefined();

      const recDef = rec.default({ x: 10 });
      expect(recDef.parse(undefined)).toEqual({ x: 10 });

      expect(() => rec.parse('not an object')).toThrow('must be an object');
      expect(() => rec.parse([1, 2, 3])).toThrow('must be an object');
      expect(() => rec.parse({ a: 'string' })).toThrow('value.a must be a number');
      expect(() => rec.parse(undefined)).toThrow('is required');
    });
  });

  describe('ObjectSchema & UnknownSchema', () => {
    it('handles objects, required properties, toJsonSchema, and passthrough', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().optional(),
        tags: z.array(z.string()).default([]),
      }).describe('person schema').passthrough();

      expect(schema.toJsonSchema()).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['name'],
        description: 'person schema',
      });

      const parsed = schema.parse({ name: 'Alice' });
      expect(parsed).toEqual({ name: 'Alice', tags: [] });

      const parsedFull = schema.parse({ name: 'Bob', age: 30, tags: ['cool'] });
      expect(parsedFull).toEqual({ name: 'Bob', age: 30, tags: ['cool'] });

      expect(() => schema.parse('bad')).toThrow('must be an object');
      expect(() => schema.parse(undefined)).toThrow('is required');
      expect(() => schema.parse({})).toThrow('value.name is required');

      const objOpt = schema.optional();
      expect(objOpt.parse(undefined)).toBeUndefined();

      const objDef = schema.default({ name: 'Default', tags: [] } as any);
      expect(objDef.parse(undefined)).toEqual({ name: 'Default', tags: [] });
    });

    it('handles UnknownSchema (z.unknown and z.any)', () => {
      const u = z.unknown().describe('anything');
      expect(u.parse({ any: 'thing' })).toEqual({ any: 'thing' });
      expect(u.toJsonSchema()).toEqual({ description: 'anything' });

      const a = z.any();
      expect(a.parse(12345)).toBe(12345);
      expect(a.toJsonSchema()).toEqual({});
    });
  });

  describe('All Tool Argument Schemas', () => {
    it('validates SetGoalSchema', () => {
      const valid = SetGoalSchema.parse({ action: 'create', title: 'Test Goal' });
      expect(valid.action).toBe('create');
      expect(SetGoalSchema.toJsonSchema().type).toBe('object');
    });

    it('validates EvaluateSituationSchema', () => {
      const valid = EvaluateSituationSchema.parse({
        action: 'snapshot',
        snapshot: { session_id: 's1' },
      });
      expect(valid.action).toBe('snapshot');
      expect(EvaluateSituationSchema.toJsonSchema().type).toBe('object');
    });

    it('validates ReplanSchema', () => {
      const valid = ReplanSchema.parse({
        action: 'blocker',
        goal_id: 'g1',
        blocker_description: 'Blocked door',
      });
      expect(valid.action).toBe('blocker');
      expect(ReplanSchema.toJsonSchema().type).toBe('object');
    });

    it('validates AssessRiskSchema', () => {
      const valid = AssessRiskSchema.parse({
        action: 'action',
        candidate_action: 'charge',
      });
      expect(valid.action).toBe('action');
      expect(AssessRiskSchema.toJsonSchema().type).toBe('object');
    });

    it('validates QueryKnowledgeSchema', () => {
      const valid = QueryKnowledgeSchema.parse({
        action: 'search',
        query: 'safe paths',
      });
      expect(valid.action).toBe('search');
      expect(QueryKnowledgeSchema.toJsonSchema().type).toBe('object');
    });

    it('validates SetUtilityWeightsSchema', () => {
      const valid = SetUtilityWeightsSchema.parse({
        action: 'configure',
        weights: { caution: 0.9 },
      });
      expect(valid.action).toBe('configure');
      expect(SetUtilityWeightsSchema.toJsonSchema().type).toBe('object');
    });

    it('validates GetDecisionTraceSchema', () => {
      const valid = GetDecisionTraceSchema.parse({
        action: 'latest',
        goal_id: 'g1',
      });
      expect(valid.action).toBe('latest');
      expect(GetDecisionTraceSchema.toJsonSchema().type).toBe('object');
    });

    it('validates ManageBeliefsSchema', () => {
      const valid = ManageBeliefsSchema.parse({
        action: 'query',
        subject: 'door',
      });
      expect(valid.action).toBe('query');
      expect(ManageBeliefsSchema.toJsonSchema().type).toBe('object');
    });

    it('validates ManageIntentionsSchema', () => {
      const valid = ManageIntentionsSchema.parse({
        action: 'list',
      });
      expect(valid.action).toBe('list');
      expect(ManageIntentionsSchema.toJsonSchema().type).toBe('object');
    });

    it('validates ManageReasoningDbSchema', () => {
      const valid = ManageReasoningDbSchema.parse({
        action: 'audit',
      });
      expect(valid.action).toBe('audit');
      expect(ManageReasoningDbSchema.toJsonSchema().type).toBe('object');
    });
  });
});
