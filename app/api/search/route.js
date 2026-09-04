import { NextResponse } from 'next/server';
import { searchAssets } from '@/lib/watchlist-db';
export const runtime = 'nodejs';
export async function GET(request) {
  try { return NextResponse.json({ results: await searchAssets(new URL(request.url).searchParams.get('q')) }); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: 503 }); }
}
