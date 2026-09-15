export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    errors: { message: string }[];
  };
}

export abstract class Schema<T> {
  isOptional: boolean = false;
  defaultValue?: T;
  description?: string;

  protected clone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
  }

  abstract parse(val: unknown, path?: string): T;
  abstract toJsonSchema(): any;

  describe(desc: string): this {
    const copy = this.clone();
    copy.description = desc;
    return copy;
  }

  optional(): this {
    const copy = this.clone();
    copy.isOptional = true;
    return copy;
  }

  default(val: T): this {
    const copy = this.clone();
    copy.defaultValue = val;
    return copy;
  }

  min(minVal: number, msg?: string): this {
    return this;
  }

  max(maxVal: number, msg?: string): this {
    return this;
  }

  int(): this {
    return this;
  }

  positive(): this {
    return this;
  }

  safeParse(val: unknown): ParseResult<T> {
    try {
      const data = this.parse(val);
      return { success: true, data };
    } catch (err: any) {
      return {
        success: false,
        error: {
          message: err.message || 'Validation error',
          errors: [{ message: err.message || 'Validation error' }],
        },
      };
    }
  }
}

export class StringSchema extends Schema<string> {
  parse(val: unknown, path = 'value'): string {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'string') {
      throw new Error(`${path} must be a string`);
    }
    return val;
  }

  toJsonSchema(): any {
    const s: any = { type: 'string' };
    if (this.description) s.description = this.description;
    return s;
  }
}

export class NumberSchema extends Schema<number> {
  parse(val: unknown, path = 'value'): number {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'number' || isNaN(val)) {
      throw new Error(`${path} must be a number`);
    }
    return val;
  }

  toJsonSchema(): any {
    const s: any = { type: 'number' };
    if (this.description) s.description = this.description;
    return s;
  }
}

export class BooleanSchema extends Schema<boolean> {
  parse(val: unknown, path = 'value'): boolean {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'boolean') {
      throw new Error(`${path} must be a boolean`);
    }
    return val;
  }

  toJsonSchema(): any {
    const s: any = { type: 'boolean' };
    if (this.description) s.description = this.description;
    return s;
  }
}

export class EnumSchema<U extends string> extends Schema<U> {
  private options: U[];

  constructor(options: U[]) {
    super();
    this.options = options;
  }

  parse(val: unknown, path = 'value'): U {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'string' || !this.options.includes(val as U)) {
      throw new Error(`${path} must be one of: ${this.options.join(', ')}`);
    }
    return val as U;
  }

  toJsonSchema(): any {
    const s: any = { type: 'string', enum: this.options };
    if (this.description) s.description = this.description;
    return s;
  }
}

export class ArraySchema<I> extends Schema<I[]> {
  private itemSchema: Schema<I>;

  constructor(itemSchema: Schema<I>) {
    super();
    this.itemSchema = itemSchema;
  }

  parse(val: unknown, path = 'value'): I[] {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (!Array.isArray(val)) {
      throw new Error(`${path} must be an array`);
    }
    return val.map((item, index) => this.itemSchema.parse(item, `${path}[${index}]`));
  }

  toJsonSchema(): any {
    const s: any = {
      type: 'array',
      items: (this.itemSchema as any).toJsonSchema ? (this.itemSchema as any).toJsonSchema() : {},
    };
    if (this.description) s.description = this.description;
    return s;
  }
}

export class RecordSchema<V> extends Schema<Record<string, V>> {
  private valSchema: Schema<V>;

  constructor(valSchema: Schema<V>) {
    super();
    this.valSchema = valSchema;
  }

  parse(val: unknown, path = 'value'): Record<string, V> {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'object' || Array.isArray(val)) {
      throw new Error(`${path} must be an object`);
    }
    const result: Record<string, V> = {};
    for (const [key, propVal] of Object.entries(val as Record<string, unknown>)) {
      result[key] = this.valSchema.parse(propVal, `${path}.${key}`);
    }
    return result;
  }

  toJsonSchema(): any {
    const s: any = {
      type: 'object',
      additionalProperties: (this.valSchema as any).toJsonSchema
        ? (this.valSchema as any).toJsonSchema()
        : true,
    };
    if (this.description) s.description = this.description;
    return s;
  }
}

export class ObjectSchema<T extends Record<string, Schema<any>>> extends Schema<{
  [K in keyof T]: T[K] extends Schema<infer U> ? U : never;
}> {
  private shape: T;

  constructor(shape: T) {
    super();
    this.shape = shape;
  }

  parse(
    val: unknown,
    path = 'value'
  ): { [K in keyof T]: T[K] extends Schema<infer U> ? U : never } {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as any;
      throw new Error(`${path} is required`);
    }
    if (typeof val !== 'object' || Array.isArray(val)) {
      throw new Error(`${path} must be an object`);
    }
    const result: any = {};
    for (const key of Object.keys(this.shape)) {
      const fieldSchema = this.shape[key];
      const fieldValue = (val as any)[key];
      if (
        fieldValue === undefined &&
        fieldSchema.defaultValue === undefined &&
        fieldSchema.isOptional
      ) {
        continue;
      }
      result[key] = fieldSchema.parse(fieldValue, `${path}.${key}`);
    }
    return result;
  }

  toJsonSchema(): any {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const [key, propSchema] of Object.entries(this.shape)) {
      properties[key] = (propSchema as any).toJsonSchema ? (propSchema as any).toJsonSchema() : {};
      if (!(propSchema as any).isOptional && (propSchema as any).defaultValue === undefined) {
        required.push(key);
      }
    }
    const s: any = { type: 'object', properties };
    if (required.length > 0) s.required = required;
    if (this.description) s.description = this.description;
    return s;
  }

  passthrough(): this {
    return this;
  }
}

export class UnknownSchema extends Schema<any> {
  parse(val: unknown): any {
    return val;
  }

  toJsonSchema(): any {
    const s: any = {};
    if (this.description) s.description = this.description;
    return s;
  }
}

export const z = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  boolean: () => new BooleanSchema(),
  enum: <U extends string>(options: U[]) => new EnumSchema<U>(options),
  array: <I>(itemSchema: Schema<I>) => new ArraySchema<I>(itemSchema),
  record: <V>(valSchema: Schema<V>) => new RecordSchema<V>(valSchema),
  object: <T extends Record<string, Schema<any>>>(shape: T) => new ObjectSchema<T>(shape),
  unknown: () => new UnknownSchema(),
  any: () => new UnknownSchema(),
};

export type Infer<T extends Schema<any>> = T extends Schema<infer U> ? U : never;

export const SetGoalSchema = z.object({
  action: z.enum(['create', 'update', 'decompose', 'get', 'list', 'abandon']),
  id: z.string().optional(),
  parent_id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'completed', 'failed', 'abandoned', 'suspended']).optional(),
  priority: z.number().min(0).max(1).optional(),
  utility_weights: z.record(z.number()).optional(),
  deadline_at: z.string().optional(),
  progress: z.number().min(0).max(1).optional(),
  success_criteria: z.array(z.string()).optional(),
  subgoals: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        priority: z.number().optional(),
      })
    )
    .optional(),
  client_request_id: z.string().optional(),
  project: z.string().optional(),
  limit: z.number().optional(),
});

export const EvaluateSituationSchema = z.object({
  action: z.enum(['snapshot', 'quick']),
  snapshot: z
    .object({
      session_id: z.string(),
      timestamp: z.string().optional(),
      world: z.any().optional(),
      vision: z.any().optional(),
      state: z.any().optional(),
      vitals: z.any().optional(),
    })
    .optional(),
  quick_context: z.string().optional(),
  candidate_actions: z
    .array(
      z.object({
        action: z.string(),
        parameters: z.record(z.any()).optional(),
        description: z.string().optional(),
      })
    )
    .optional(),
  utility_profile: z.string().optional(),
  project: z.string().optional(),
});

export const ReplanSchema = z.object({
  action: z.enum(['blocker', 'event', 'full']),
  goal_id: z.string(),
  blocker_description: z.string().optional(),
  trigger_event: z.string().optional(),
  preserve_completed: z.boolean().optional(),
  project: z.string().optional(),
});

export const AssessRiskSchema = z.object({
  action: z.enum(['action', 'plan', 'compare']),
  candidate_action: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  candidate_actions: z
    .array(
      z.object({
        action: z.string(),
        parameters: z.record(z.any()).optional(),
      })
    )
    .optional(),
  situation_context: z.any().optional(),
  project: z.string().optional(),
});

export const QueryKnowledgeSchema = z.object({
  action: z.enum(['search', 'patterns', 'similar_situations']),
  query: z.string().optional(),
  pattern_type: z.enum(['heuristic', 'anti_pattern', 'optimization', 'contingency']).optional(),
  context_tags: z.array(z.string()).optional(),
  limit: z.number().optional(),
  project: z.string().optional(),
});

export const SetUtilityWeightsSchema = z.object({
  action: z.enum(['configure', 'get', 'list', 'activate']),
  name: z.string().optional(),
  description: z.string().optional(),
  weights: z.record(z.number()).optional(),
  is_active: z.boolean().optional(),
  project: z.string().optional(),
});

export const GetDecisionTraceSchema = z.object({
  action: z.enum(['latest', 'get', 'list', 'explain']),
  trace_id: z.string().optional(),
  goal_id: z.string().optional(),
  limit: z.number().optional(),
  project: z.string().optional(),
});

export const ManageBeliefsSchema = z.object({
  action: z.enum(['update', 'query', 'expire', 'reconcile']),
  category: z.enum(['spatial', 'entity', 'state', 'rule', 'social']).optional(),
  subject: z.string().optional(),
  predicate: z.string().optional(),
  object: z.any().optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(['observation', 'deduction', 'agent_communication', 'a_priori']).optional(),
  expires_at: z.string().optional(),
  decay_rate: z.number().optional(),
  belief_id: z.string().optional(),
  client_request_id: z.string().optional(),
  project: z.string().optional(),
});

export const ManageIntentionsSchema = z.object({
  action: z.enum(['create', 'dispatch', 'get', 'list', 'cancel', 'resolve']),
  intention_id: z.string().optional(),
  goal_id: z.string().optional(),
  trace_id: z.string().optional(),
  behavior_name: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  priority: z.number().optional(),
  deadline_at: z.string().optional(),
  abort_conditions: z.array(z.any()).optional(),
  result: z.record(z.any()).optional(),
  status: z
    .enum(['pending', 'dispatched', 'running', 'completed', 'failed', 'aborted', 'interrupted'])
    .optional(),
  client_request_id: z.string().optional(),
  project: z.string().optional(),
});

export const ManageReasoningDbSchema = z.object({
  action: z.enum(['backup', 'stats', 'audit', 'snapshot', 'diff', 'restore']),
  name: z.string().optional(),
  description: z.string().optional(),
  project: z.string().optional(),
});
