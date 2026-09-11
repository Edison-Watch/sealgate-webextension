const reactFiberPrefix = '__reactFiber$';

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

export function property(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

export function stringProperty(value: unknown, key: string): string | null {
  const result = property(value, key);
  return typeof result === 'string' && result.length > 0 ? result : null;
}

// Firefox hides page-set expandos such as React's fiber behind Xray wrappers;
// `wrappedJSObject` exposes them. Chrome content scripts see them directly.
function pageObject(element: Element): UnknownRecord {
  try {
    const wrapped = (element as Element & { wrappedJSObject?: unknown })
      .wrappedJSObject;
    return isRecord(wrapped) ? wrapped : (element as unknown as UnknownRecord);
  } catch {
    return element as unknown as UnknownRecord;
  }
}

export function reactFiber(element: Element): unknown {
  const pageElement = pageObject(element);
  const fiberKey = Object.getOwnPropertyNames(pageElement).find((key) =>
    key.startsWith(reactFiberPrefix),
  );
  return fiberKey ? property(pageElement, fiberKey) : undefined;
}
