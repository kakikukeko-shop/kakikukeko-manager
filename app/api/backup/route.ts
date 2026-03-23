import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BACKUP_BUCKET = 'system-backups'

const ALL_TABLES = [
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

function getTimestamp() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`
}

export async function GET(req: NextRequest) {
  try {
    const backupData: Record<string, any[]> = {}

    for (const table of ALL_TABLES) {
      const { data, error } = await supabase.from(table).select('*')

      if (error) {
        return NextResponse.json(
          { error: `${table} 조회 실패: ${error.message}` },
          { status: 500 }
        )
      }

      backupData[table] = data ?? []
    }

    const filename = `backup-${getTimestamp()}.json`
    const autoSave = req.nextUrl.searchParams.get('auto') === '1'

    if (autoSave) {
      const body = JSON.stringify(backupData, null, 2)

      const { error: uploadError } = await supabase.storage
        .from(BACKUP_BUCKET)
        .upload(filename, body, {
          contentType: 'application/json',
          upsert: false,
        })

      if (uploadError) {
        return NextResponse.json(
          { error: `자동백업 저장 실패: ${uploadError.message}` },
          { status: 500 }
        )
      }

      return NextResponse.json({
        ok: true,
        mode: 'auto',
        filename,
      })
    }

    return NextResponse.json({
      ok: true,
      filename,
      data: backupData,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'backup failed' },
      { status: 500 }
    )
  }
}