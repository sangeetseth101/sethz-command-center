import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { kv } from '@vercel/kv';

const dbPath = path.join(process.cwd(), 'data', 'db.json');

const hasKv = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

function initLocalDb() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({}), 'utf8');
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  
  if (!key) {
    return NextResponse.json({ error: 'Key parameter is required' }, { status: 400 });
  }

  if (hasKv) {
    try {
      const val = await kv.get(key);
      if (val !== undefined && val !== null) {
        return NextResponse.json({ key, value: val });
      }
    } catch (err) {
      console.error('Vercel KV GET error:', err);
    }
  }

  try {
    initLocalDb();
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    return NextResponse.json({ key, value: data[key] || null });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { key, value } = await request.json();
    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    if (hasKv) {
      try {
        await kv.set(key, value);
        return NextResponse.json({ success: true, source: 'vercel-kv' });
      } catch (err) {
        console.error('Vercel KV POST error:', err);
      }
    }

    initLocalDb();
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    data[key] = value;
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    return NextResponse.json({ success: true, source: 'local' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
