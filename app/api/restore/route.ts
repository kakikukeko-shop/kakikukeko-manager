import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DELETE_ORDER = [
  'sale_items',
  'sale_files',
  'purchase_item_arrivals',
  'cost_allocations',
  'purchase_files',
  'sales',
  'purchase_costs',
  'purchase_items',
  'purchase',
  'vendors',
] as const

const RESTORE_ORDER = [
  'vendors',
  'purchase',
  'purchase_items',
  'purchase_costs',
  'cost_allocations',
  'purchase_item_arrivals',
  'purchase_files',
  'sales',
  'sale_items',
  'sale_files',
] as const

export async function POST(req: Request) {
  try {
    const body = await req.json()

    for (const table of DELETE_ORDER) {
      const { error } = await supabase.from(table).delete().not('id', 'is', null)
      if (error) {
        return NextResponse.json(
          { error: `${table} 삭제 실패: ${error.message}` },
          { status: 500 }
        )
      }
    }

    for (const table of RESTORE_ORDER) {
      const rows = body?.[table]
      if (!Array.isArray(rows) || rows.length === 0) continue

      const { error } = await supabase.from(table).insert(rows)
      if (error) {
        return NextResponse.json(
          { error: `${table} 복구 실패: ${error.message}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'restore failed' },
      { status: 500 }
    )
  }
}