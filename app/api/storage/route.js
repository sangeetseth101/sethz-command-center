import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const dbPath = path.join(process.cwd(), 'data', 'db.json');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (e) {
    console.error('Failed to initialize Supabase client:', e);
  }
}

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

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('command_center_store')
        .select('value')
        .eq('key', key)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Supabase GET error:', error);
      } else if (data) {
        return NextResponse.json({ key, value: data.value });
      }
    } catch (err) {
      console.error('Supabase client exception:', err);
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

    if (supabase) {
      try {
        const { error } = await supabase
          .from('command_center_store')
          .upsert({ key, value, updated_at: new Date().toISOString() });
        
        if (error) {
          console.error('Supabase POST error:', error);
        } else {
          return NextResponse.json({ success: true, source: 'supabase' });
        }
      } catch (err) {
        console.error('Supabase client exception on POST:', err);
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
