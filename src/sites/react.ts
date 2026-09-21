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

// Returns a copy owned by the content script. In Firefox, page arrays reached
// through `wrappedJSObject` keep the page's methods, and calling those with a
// content-script callback (`filter`, `map`, ...) throws "Permission denied to
// access object"; iterating them is allowed.
export function arrayProperty(value: unknown, key: string): unknown[] | null {
  const result = property(value, key);
  return Array.isArray(result) ? [...(result as unknown[])] : null;
}

// Firefox hides page-set expandos such as React's fiber behind Xray wrappers;
// `wrappedJSObject` exposes them. Chrome only exposes them to scripts running
// in the page's MAIN world, not to the extension's default isolated world.
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
