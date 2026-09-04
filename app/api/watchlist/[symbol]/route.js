import { NextResponse } from 'next/server';
import { removeAsset } from '@/lib/watchlist-db';

export const runtime = 'nodejs';

export async function DELETE(request, { params }) {
  const { symbol } = await params;
  removeAsset(request.headers.get('x-device-id'), symbol);
  return NextResponse.json({ ok: true });
}
