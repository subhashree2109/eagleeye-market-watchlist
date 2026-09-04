import { NextResponse } from 'next/server';
import { addAsset } from '@/lib/watchlist-db';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { symbol } = await request.json();
    const result = await addAsset(request.headers.get('x-device-id'), symbol);
    return NextResponse.json(result.body, { status: result.status });
  } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
}
