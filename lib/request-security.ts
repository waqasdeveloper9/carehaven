export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  // Next.js can use its bind hostname internally; the HTTP Host identifies the browser's actual destination.
  const host = request.headers.get('host') || url.host;
  return new URL(`${url.protocol}//${host}`).origin;
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === requestOrigin(request);
  } catch {
    return false;
  }
}
