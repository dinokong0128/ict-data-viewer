/**
 * GET /api/products
 *
 * Returns the list of products for populating the product filter dropdown.
 * Data routing:
 *   - Authenticated request (Authorization: Bearer <jwt>):
 *       Queries Supabase products table → returns all products sorted by name.
 *   - Guest request (no Authorization header):
 *       Returns products from src/fixtures/guest-data.json (no Supabase call).
 *
 * Returns { products: { id: string; product_name: string }[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';

type ProductRow = { id: string; product_name: string };

function getProductsFromFixture(): ProductRow[] {
  const fixturePath = path.join(process.cwd(), 'src', 'fixtures', 'guest-data.json');
  const raw = fs.readFileSync(fixturePath, 'utf-8');
  const fixture = JSON.parse(raw) as {
    products: { part_number: string; product_name: string }[];
  };
  return fixture.products
    .map((p) => ({ id: p.part_number, product_name: p.product_name }))
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

async function getProductsFromSupabase(authHeader: string): Promise<ProductRow[]> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb   = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false },
  });

  const { data, error } = await sb
    .from('products')
    .select('id, product_name')
    .order('product_name');

  if (error) throw new Error(error.message);
  return (data ?? []) as ProductRow[];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader) {
    const products = getProductsFromFixture();
    return NextResponse.json({ products });
  }

  try {
    const products = await getProductsFromSupabase(authHeader);
    return NextResponse.json({ products });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
