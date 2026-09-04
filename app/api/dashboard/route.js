import { NextResponse } from 'next/server';
import { getDashboard } from '@/lib/watchlist-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const url = new URL(request.url), force = url.searchParams.get('refresh') === '1', background = url.searchParams.get('background') === '1';
    return NextResponse.json(await getDashboard(request.headers.get('x-device-id'), force, !background));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}
