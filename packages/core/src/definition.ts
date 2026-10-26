export type InputValue =
  null | string | boolean | number | readonly InputValue[] | InputObject;
export interface InputObject {
  readonly [key: string]: InputValue;
}
export interface FieldSegment {
  readonly name: string;
  readonly arguments: InputObject;
}
export interface ResolvedField extends FieldSegment {
  readonly responseName: string;
  readonly children: readonly ResolvedField[];
}
export interface ResourceScope {
  readonly source: string;
  readonly scope: string;
}

// Only our frozen, null-prototype, array-free copies have reusable provenance.
// Arrays (and their ancestors) still run through Array.from/JSON.stringify;
// inherited iteration/serialization hooks are not memoized. Caller freezing
// never proves validation or deep immutability. Weak keys avoid retention.
// null means owned but not yet serialized; a string is its cached encoding.
const reusableInputs = new WeakMap<object, string | null>();

/**
 * Snapshot JSON-shaped inputs; omit undefined object properties, never array items.
 * Already validated immutable objects may be reused; copy identity is unspecified.
 */
export function snapshotInput(input: unknown): InputValue {
  return copyInput(input, true);
}

// Serialization-only copies need no reusable provenance bookkeeping.
function copyInput(input: unknown, remember: boolean): InputValue {
  const ancestors = new Set<object>();
  function copy(value: unknown): InputValue {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    )
      return value;
    if (typeof value === 'number' && Number.isFinite(value))
      return Object.is(value, -0) ? 0 : value;
    if (typeof value !== 'object' || value === null)
      throw new Error('Inputs must contain finite JSON values.');
    if (reusableInputs.has(value)) return value as InputObject;
    if (ancestors.has(value)) throw new Error('Cyclic input.');
    ancestors.add(value);
    try {
      if (Array.isArray(value)) return Object.freeze(Array.from(value, copy));
      if (
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      )
        throw new Error('Inputs must be plain objects.');
      if (Object.getOwnPropertySymbols(value).length)
        throw new Error('Symbol input keys are unsupported.');
      const result: Record<string, InputValue> = Object.create(null) as Record<
        string,
        InputValue
      >;
      let reusable = remember;
      for (const key of Object.keys(value).sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!('value' in descriptor))
          throw new Error('Input accessors are unsupported.');
        if (descriptor.value !== undefined) {
          const child = copy(descriptor.value);
          result[key] = child;
          reusable &&=
            child === null ||
            typeof child !== 'object' ||
            reusableInputs.has(child);
        }
      }
      Object.freeze(result);
      if (reusable) reusableInputs.set(result, null);
      return result;
    } finally {
      ancestors.delete(value);
    }
  }
  return copy(input);
}

export function canonicalInput(input: unknown): string {
  if (input !== null && typeof input === 'object') {
    const canonical = reusableInputs.get(input);
    if (canonical !== undefined) {
      if (canonical !== null) return canonical;
      const encoded = JSON.stringify(input);
      reusableInputs.set(input, encoded);
      return encoded;
    }
  }
  return JSON.stringify(copyInput(input, false));
}

/** Selection and aliases deliberately do not participate in resource identity. */
export function resourceAddress(
  scope: ResourceScope,
  path: readonly FieldSegment[],
): string {
  if (
    typeof scope.source !== 'string' ||
    !scope.source ||
    typeof scope.scope !== 'string' ||
    !scope.scope ||
    !path.length
  )
    throw new Error('Resource addresses require a source, scope, and path.');
  return canonicalInput([
    scope.source,
    scope.scope,
    path.map(({ name, arguments: args }) => ({ name, arguments: args })),
  ]);
}

export function fieldAddress(
  resource: string,
  path: readonly FieldSegment[],
  recordIdentity?: InputObject,
): string {
  if (!path.length) throw new Error('Field address requires a field path.');
  return canonicalInput([
    resource,
    path.map(({ name, arguments: args }) => ({ name, arguments: args })),
    recordIdentity ?? null,
  ]);
}

export function freezeFields(
  fields: readonly ResolvedField[],
): readonly ResolvedField[] {
  const responses = new Set<string>();
  const names = new Set<string>();
  return Object.freeze(
    [...fields]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((field) => {
        if (responses.has(field.responseName))
          throw new Error(`Conflicting response name: ${field.responseName}`);
        if (names.has(field.name))
          throw new Error(`Duplicate canonical field: ${field.name}`);
        responses.add(field.responseName);
        names.add(field.name);
        return Object.freeze({
          ...field,
          arguments: snapshotInput(field.arguments) as InputObject,
          children: freezeFields(field.children),
        });
      }),
  );
}

/** Compose already schema-resolved fields without mutating either definition. */
export function mergeFields(
  base: readonly ResolvedField[],
  extension: readonly ResolvedField[],
): readonly ResolvedField[] {
  const result = new Map(
    freezeFields(base).map((field) => [field.name, field]),
  );
  for (const field of freezeFields(extension)) {
    const previous = result.get(field.name);
    if (previous) {
      if (
        previous.responseName !== field.responseName ||
        canonicalInput(previous.arguments) !== canonicalInput(field.arguments)
      )
        throw new Error(`Incompatible override: ${field.name}`);
      result.set(field.name, {
        ...previous,
        children: mergeFields(previous.children, field.children),
      });
    } else result.set(field.name, field);
  }
  return freezeFields([...result.values()]);
}

export function narrowFields(
  base: readonly ResolvedField[],
  selection: readonly ResolvedField[],
): readonly ResolvedField[] {
  for (const field of selection) {
    const previous = base.find((candidate) => candidate.name === field.name);
    if (
      !previous ||
      previous.responseName !== field.responseName ||
      canonicalInput(previous.arguments) !== canonicalInput(field.arguments)
    )
      throw new Error(`Selection is not a compatible subset: ${field.name}`);
    if (previous.children.length && !field.children.length)
      throw new Error(`Object selection requires children: ${field.name}`);
    narrowFields(previous.children, field.children);
  }
  return freezeFields(selection);
}

export function selectFieldPath(
  fields: readonly ResolvedField[],
  responsePath: readonly string[],
): readonly ResolvedField[] {
  const [name, ...rest] = responsePath;
  if (!name) throw new Error('Refresh path must not be empty.');
  const field = fields.find((candidate) => candidate.responseName === name);
  if (!field) throw new Error(`Unknown selected field: ${name}`);
  return freezeFields([
    {
      ...field,
      children: rest.length
        ? selectFieldPath(field.children, rest)
        : field.children,
    },
  ]);
}
