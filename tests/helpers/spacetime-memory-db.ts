import { ConnectionId, Identity, ScheduleAt, Timestamp } from "spacetimedb";
// Only the structural metadata this harness consumes. Client/server SDK
// installs have nominally distinct BinaryReader classes, even at one version.
type Definition = {
  columns: Record<string, {
    columnMetadata: { [key: string]: unknown; isAutoIncrement?: boolean; defaultValue?: unknown };
    typeBuilder: { algebraicType: { tag: string; value?: any } };
  }>;
  resolvedIndexes: readonly { name: string; unique?: boolean; columns: readonly string[] }[];
};
type Row = Record<string, any>;
type State = { rows: Row[]; sequence: bigint };

function copy<T>(value: T): T {
  if (value instanceof Identity || value instanceof ConnectionId || value instanceof Timestamp) return value;
  if (value instanceof Uint8Array) return value.slice() as T;
  if (Array.isArray(value)) return value.map(copy) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)])) as T;
  return value;
}

function equal(a: any, b: any): boolean {
  if (a?.toHexString && b?.toHexString) return a.toHexString() === b.toHexString();
  if (a instanceof Timestamp && b instanceof Timestamp) return a.microsSinceUnixEpoch === b.microsSinceUnixEpoch;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, i) => equal(value, b[i]));
  return a === b;
}

function zero(type: any): any {
  if (type.tag === "Bool") return false;
  if (type.tag === "String") return "";
  if (type.tag === "Array") return [];
  if (/^[UI](64|128|256)$/.test(type.tag)) return 0n;
  if (type.tag === "Product") {
    const name = type.value.elements[0]?.name;
    if (name === "__identity__") return new Identity("0".repeat(64));
    if (name === "__connection_id__") return new ConnectionId(0n);
    if (name === "__timestamp_micros_since_unix_epoch__") return new Timestamp(0n);
    return Object.fromEntries(type.value.elements.map((e: any) => [e.name, zero(e.algebraicType)]));
  }
  if (type.tag === "Sum") {
    if (type.value.variants.some((v: any) => v.name === "none")) return undefined;
    return ScheduleAt.time(0n);
  }
  return 0;
}

/** Schema-driven test storage; no host networking, scheduling, or production DB.
 * Supports the point/prefix indexes used by these reducers, unique constraints,
 * copy-on-read, auto-increment, and rollback. Not a replacement for a host test.
 */
export function createMemoryDatabase(moduleSchema: { schemaType: { tables: Record<string, Definition> } }) {
  const definitions = moduleSchema.schemaType.tables;
  const states: Record<string, State> = {};
  const db: Record<string, any> = {};
  for (const [name, definition] of Object.entries(definitions)) {
    states[name] = { rows: [], sequence: 0n };
    const matches = (row: Row, columns: readonly string[], key: any) => {
      const values = Array.isArray(key) ? key : [key];
      if (values.length > columns.length) throw new Error(`Too many index keys for ${name}`);
      return values.every((value, i) => equal(row[columns[i]], value));
    };
    const validate = (row: Row, except = -1) => {
      for (const index of definition.resolvedIndexes.filter((index) => index.unique)) {
        if (states[name].rows.some((existing, i) => i !== except && index.columns.every((column) => equal(existing[column], row[column])))) {
          throw new Error(`Duplicate unique index ${name}.${index.name}`);
        }
      }
      for (const [column, builder] of Object.entries(definition.columns)) {
        if (!(column in row) && !Object.hasOwn(builder.columnMetadata, "defaultValue")) {
          throw new Error(`Missing required column ${name}.${column}`);
        }
      }
    };
    db[name] = {
      iter: () => copy(states[name].rows).values(),
      count: () => BigInt(states[name].rows.length),
      insert: (value: Row) => {
        const row = copy(value);
        for (const [column, builder] of Object.entries(definition.columns)) {
          if (!(column in row) && Object.hasOwn(builder.columnMetadata, "defaultValue")) row[column] = copy(builder.columnMetadata.defaultValue);
          if (builder.columnMetadata.isAutoIncrement) {
            if (row[column] === 0 || row[column] === 0n) {
              states[name].sequence++;
              row[column] = typeof row[column] === "number" ? Number(states[name].sequence) : states[name].sequence;
            } else if (BigInt(row[column]) > states[name].sequence) states[name].sequence = BigInt(row[column]);
          }
        }
        validate(row);
        states[name].rows.push(row);
        return copy(row);
      },
      delete: (row: Row) => {
        const i = states[name].rows.findIndex((current) => Object.keys(current).every((key) => equal(current[key], row[key])));
        if (i < 0) return false;
        states[name].rows.splice(i, 1);
        return true;
      },
      clear: () => { const count = BigInt(states[name].rows.length); states[name].rows = []; return count; },
    };
    for (const index of definition.resolvedIndexes) {
      const findIndex = (key: any) => states[name].rows.findIndex((row) => matches(row, index.columns, key));
      db[name][index.name] = {
        filter: (key: any) => copy(states[name].rows.filter((row) => matches(row, index.columns, key))).values(),
        ...(index.unique ? {
          find: (key: any) => copy(states[name].rows[findIndex(key)] ?? null),
          update: (value: Row) => {
            const i = findIndex(index.columns.map((column) => value[column]));
            if (i < 0) throw new Error(`Missing row for update: ${name}.${index.name}`);
            validate(value, i);
            states[name].rows[i] = copy(value);
            return copy(value);
          },
        } : {}),
        delete: (key: any) => {
          const before = states[name].rows.length;
          states[name].rows = states[name].rows.filter((row) => !matches(row, index.columns, key));
          return states[name].rows.length !== before;
        },
      };
    }
  }
  return {
    db,
    // Fixture convenience only. Runtime writes still require complete rows.
    row(name: string, overrides: Row): Row {
      const definition: Definition = definitions[name];
      if (!definition) throw new Error(`Unknown table ${name}`);
      return { ...Object.fromEntries(Object.entries(definition.columns).map(([key, builder]) => [
        key, Object.hasOwn(builder.columnMetadata, "defaultValue") ? copy(builder.columnMetadata.defaultValue) : zero(builder.typeBuilder.algebraicType),
      ])), ...overrides };
    },
    transaction<T>(action: () => T): T {
      const snapshot = copy(states);
      try { return action(); } catch (error) {
        for (const name of Object.keys(states)) states[name] = snapshot[name];
        throw error;
      }
    },
  };
}
