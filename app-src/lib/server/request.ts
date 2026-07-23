import { NextRequest, NextResponse } from 'next/server';
import type { ZodType } from 'zod';

export function rejectOversizedRequest(request: NextRequest, maxBytes: number): NextResponse | null {
  const rawLength = request.headers.get('content-length');
  if (!rawLength) return null;

  const length = Number(rawLength);
  if (Number.isFinite(length) && length > maxBytes) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 });
  }

  return null;
}

export async function parseJsonRequest<T>(
  request: NextRequest,
  schema: ZodType<T>,
  maxBytes = 1_000_000,
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  const oversized = rejectOversizedRequest(request, maxBytes);
  if (oversized) return { success: false, response: oversized };

  try {
    const json: unknown = await request.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return {
        success: false,
        response: NextResponse.json(
          { error: 'Invalid request data', details: parsed.error.flatten().fieldErrors },
          { status: 400 },
        ),
      };
    }
    return { success: true, data: parsed.data };
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }),
    };
  }
}
