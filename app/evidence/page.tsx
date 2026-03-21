'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import PageBackButton from '../../components/PageBackButton'

type PurchaseRow = {
  id: string
  supplier: string | null
  purchase_date: string | null
}

type ItemRow = {
  id: string
  purchase_id: string
  item_name: string | null
  created_at: string
  is_preorder: boolean | null
  attachment_url: string | null
}

type CostRow = {
  id: string
  purchase_id: string | null
  cost_type: string | null
  vendor_name: string | null
}

type AllocationRow = {
  purchase_cost_id: string
  purchase_item_id: string
}

type FileRow = {
  id: string
  purchase_id: string | null
  item_id: string | null
  cost_id: string | null
  file_type: string | null
  file_name: string | null
  file_path: string | null
  created_at?: string | null
}

type SaleItemRow = {
  id: string
  sale_id: string
  purchase_item_id: string
  qty: number | null
  sale_price: number | null
  line_total: number | null
}

type SaleRow = {
  id: string
  sale_date: string | null
  channel: string | null
  sales_channel: string | null
  memo: string | null
  created_at?: string | null
}

type SaleFileRow = {
  id: string
  sale_id: string | null
  file_type: string | null
  file_path: string | null
  created_at?: string | null
}

const STORAGE_BUCKET = 'purchase-files'
const SALE_RECEIPT_TYPE = '매출영수증'

function normalizeDate(value: string | null | undefined) {
  if (!value) return ''
  const raw = String(value).trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`

  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  }

  return ''
}

function fmtDate(v: string | null | undefined) {
  const x = normalizeDate(v)
  return x || '미입력'
}

export default function EvidencePage() {
  const [items, setItems] = useState<ItemRow[]>([])
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [costs, setCosts] = useState<CostRow[]>([])
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [saleItems, setSaleItems] = useState<SaleItemRow[]>([])
  const [sales, setSales] = useState<SaleRow[]>([])
  const [saleFiles, setSaleFiles] = useState<SaleFileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const purchaseMap = useMemo(() => {
    const m = new Map<string, PurchaseRow>()
    purchases.forEach((p) => m.set(p.id, p))
    return m
  }, [purchases])

  const costMap = useMemo(() => {
    const m = new Map<string, CostRow>()
    costs.forEach((c) => m.set(c.id, c))
    return m
  }, [costs])

  const costTypeMap = useMemo(() => {
    const m = new Map<string, string | null>()
    costs.forEach((c) => m.set(c.id, c.cost_type ?? null))
    return m
  }, [costs])

  const allocByItem = useMemo(() => {
    const m = new Map<string, string[]>()
    allocations.forEach((a) => {
      if (!m.has(a.purchase_item_id)) m.set(a.purchase_item_id, [])
      m.get(a.purchase_item_id)!.push(a.purchase_cost_id)
    })
    return m
  }, [allocations])

  const hasBalanceByItem = useMemo(() => {
    const m = new Map<string, boolean>()
    allocations.forEach((a) => {
      const type = costTypeMap.get(a.purchase_cost_id)
      if (type === '잔금') m.set(a.purchase_item_id, true)
    })
    return m
  }, [allocations, costTypeMap])

  const salesByItem = useMemo(() => {
    const m = new Map<string, SaleItemRow[]>()
    saleItems.forEach((s) => {
      if (!m.has(s.purchase_item_id)) m.set(s.purchase_item_id, [])
      m.get(s.purchase_item_id)!.push(s)
    })
    return m
  }, [saleItems])

  const saleMap = useMemo(() => {
    const m = new Map<string, SaleRow>()
    sales.forEach((s) => m.set(s.id, s))
    return m
  }, [sales])

  const saleFilesBySaleId = useMemo(() => {
    const m = new Map<string, SaleFileRow[]>()
    saleFiles.forEach((f) => {
      if (!f.sale_id) return
      if (!m.has(f.sale_id)) m.set(f.sale_id, [])
      m.get(f.sale_id)!.push(f)
    })
    return m
  }, [saleFiles])

  function getPublicUrl(path: string | null | undefined) {
    if (!path) return ''
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  const itemPhotoMap = useMemo(() => {
    const map = new Map<string, string>()

    for (const item of items) {
      if (item.attachment_url) {
        map.set(item.id, item.attachment_url)
      }
    }

    const imageFiles = files.filter(
      (f) => f.file_type === '상품사진' && f.item_id && f.file_path
    )

    for (const f of imageFiles) {
      if (!f.item_id || !f.file_path) continue
      if (map.has(f.item_id)) continue
      map.set(f.item_id, getPublicUrl(f.file_path))
    }

    return map
  }, [items, files])

  function getPurchaseFile(purchaseId: string, fileType: string) {
    return (
      files.find(
        (f) =>
          f.purchase_id === purchaseId &&
          !f.item_id &&
          !f.cost_id &&
          f.file_type === fileType
      ) ?? null
    )
  }

  function getCostFileForItem(itemId: string, costType: string, wantedFileType: string) {
    const costIds = allocByItem.get(itemId) ?? []
    for (const costId of costIds) {
      const cost = costMap.get(costId)
      if (cost?.cost_type !== costType) continue

      const found = files.find(
        (f) => f.cost_id === costId && f.file_type === wantedFileType
      )
      if (found) return found
    }
    return null
  }

  function getAnyCustomsDocForItem(itemId: string) {
    const costIds = allocByItem.get(itemId) ?? []
    for (const costId of costIds) {
      const found = files.find(
        (f) => f.cost_id === costId && f.file_type === '수입신고필증'
      )
      if (found) return found
    }
    return null
  }

  function getLatestSaleReceiptForItem(itemId: string) {
    const linkedSaleItems = salesByItem.get(itemId) ?? []
    if (linkedSaleItems.length === 0) return null

    const candidates: {
      file: SaleFileRow
      sale: SaleRow | undefined
      saleDate: string
      createdAt: string
    }[] = []

    linkedSaleItems.forEach((saleItem) => {
      const sale = saleMap.get(saleItem.sale_id)
      const receiptFiles = (saleFilesBySaleId.get(saleItem.sale_id) ?? []).filter(
        (f) => f.file_type === SALE_RECEIPT_TYPE && f.file_path
      )

      receiptFiles.forEach((file) => {
        candidates.push({
          file,
          sale,
          saleDate: normalizeDate(sale?.sale_date) || '',
          createdAt: String(file.created_at || ''),
        })
      })
    })

    if (candidates.length === 0) return null

    candidates.sort((a, b) => {
      const dateCompare = b.saleDate.localeCompare(a.saleDate)
      if (dateCompare !== 0) return dateCompare
      return b.createdAt.localeCompare(a.createdAt)
    })

    return candidates[0]
  }

  async function load() {
    setLoading(true)
    setErr(null)

    try {
      const [
        itemRes,
        purchaseRes,
        costRes,
        allocRes,
        fileRes,
        saleItemRes,
        saleRes,
        saleFileRes,
      ] = await Promise.all([
        supabase
          .from('purchase_items')
          .select('id,purchase_id,item_name,created_at,is_preorder,attachment_url')
          .order('created_at', { ascending: false }),

        supabase
          .from('purchase')
          .select('id,supplier,purchase_date'),

        supabase
          .from('purchase_costs')
          .select('id,purchase_id,cost_type,vendor_name'),

        supabase
          .from('cost_allocations')
          .select('purchase_cost_id,purchase_item_id'),

        supabase
          .from('purchase_files')
          .select('id,purchase_id,item_id,cost_id,file_type,file_name,file_path,created_at')
          .order('created_at', { ascending: false }),

        supabase
          .from('sale_items')
          .select('id,sale_id,purchase_item_id,qty,sale_price,line_total'),

        supabase
          .from('sales')
          .select('id,sale_date,channel,sales_channel,memo,created_at'),

        supabase
          .from('sale_files')
          .select('id,sale_id,file_type,file_path,created_at')
          .order('created_at', { ascending: false }),
      ])

      if (itemRes.error) throw itemRes.error
      if (purchaseRes.error) throw purchaseRes.error
      if (costRes.error) throw costRes.error
      if (allocRes.error) throw allocRes.error
      if (fileRes.error) throw fileRes.error
      if (saleItemRes.error) throw saleItemRes.error
      if (saleRes.error) throw saleRes.error
      if (saleFileRes.error) throw saleFileRes.error

      setItems((itemRes.data ?? []) as ItemRow[])
      setPurchases((purchaseRes.data ?? []) as PurchaseRow[])
      setCosts((costRes.data ?? []) as CostRow[])
      setAllocations((allocRes.data ?? []) as AllocationRow[])
      setFiles((fileRes.data ?? []) as FileRow[])
      setSaleItems((saleItemRes.data ?? []) as SaleItemRow[])
      setSales((saleRes.data ?? []) as SaleRow[])
      setSaleFiles((saleFileRes.data ?? []) as SaleFileRow[])
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items

    return items.filter((it) => {
      const purchase = purchaseMap.get(it.purchase_id)
      const latestSaleReceipt = getLatestSaleReceiptForItem(it.id)
      const latestSale = latestSaleReceipt?.sale

      const itemName = String(it.item_name || '').toLowerCase()
      const supplier = String(purchase?.supplier || '').toLowerCase()
      const purchaseDate = String(purchase?.purchase_date || '').toLowerCase()
      const saleDate = String(latestSale?.sale_date || '').toLowerCase()
      const saleMemo = String(latestSale?.memo || '').toLowerCase()

      return (
        itemName.includes(q) ||
        supplier.includes(q) ||
        purchaseDate.includes(q) ||
        saleDate.includes(q) ||
        saleMemo.includes(q)
      )
    })
  }, [items, search, purchaseMap, salesByItem, saleMap, saleFilesBySaleId])

  const styles: Record<string, CSSProperties> = {
    page: {
      minHeight: '100vh',
      background: '#f7f7fb',
      color: '#111',
      padding: 20,
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
    },
    title: {
      fontSize: 24,
      fontWeight: 900,
      color: '#312e81',
      marginBottom: 14,
    },
    topbar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
      flexWrap: 'wrap',
    },
    btn: {
      border: '1px solid #ddd',
      background: '#fff',
      color: '#111',
      padding: '10px 12px',
      borderRadius: 12,
      cursor: 'pointer',
      fontWeight: 800,
    },
    input: {
      border: '1px solid #d9d9e6',
      borderRadius: 12,
      padding: '10px 12px',
      outline: 'none',
      fontSize: 14,
      background: '#fff',
      width: 300,
      color: '#111',
    },
    card: {
      background: '#fff',
      border: '1px solid #e6e6ef',
      borderRadius: 18,
      padding: 0,
      boxShadow: '0 8px 24px rgba(124, 58, 237, 0.05)',
      overflow: 'hidden',
    },
    tableWrap: {
      overflowX: 'auto',
    },
    table: {
      width: '100%',
      minWidth: 1500,
      borderCollapse: 'separate',
      borderSpacing: 0,
      background: '#fff',
    },
    th: {
      textAlign: 'left',
      fontSize: 12,
      color: '#374151',
      padding: '12px 10px',
      borderBottom: '1px solid #e6e6ef',
      background: '#fafafa',
      fontWeight: 900,
      whiteSpace: 'nowrap',
    },
    td: {
      padding: '12px 10px',
      borderBottom: '1px solid #f0f0f5',
      fontSize: 13,
      verticalAlign: 'top',
      whiteSpace: 'nowrap',
    },
    small: {
      fontSize: 11,
      color: '#6b7280',
    },
    ok: {
      color: '#166534',
      fontWeight: 800,
      textDecoration: 'none',
    },
    no: {
      color: '#dc2626',
      fontWeight: 800,
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 8px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 800,
      background: '#ffedd5',
      color: '#9a3412',
      marginLeft: 6,
    },
    errorBox: {
      background: '#fef2f2',
      color: '#991b1b',
      border: '1px solid #fecaca',
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      fontWeight: 700,
    },
    thumbBox: {
      width: 72,
      height: 72,
      borderRadius: 12,
      border: '1px solid #e5e7eb',
      background: '#f3f4f6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      fontWeight: 800,
      color: '#6b7280',
      overflow: 'hidden',
    },
    thumbImg: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
    },
  }

  const renderFile = (file: FileRow | null) => {
    if (!file?.file_path) return <span style={styles.no}>미업로드</span>
    const url = getPublicUrl(file.file_path)
    return (
      <a href={url || '#'} target="_blank" rel="noreferrer" style={styles.ok}>
        ✔ 보기
      </a>
    )
  }

  const renderSaleReceiptFile = (
    data:
      | {
          file: SaleFileRow
          sale?: SaleRow
          saleDate: string
          createdAt: string
        }
      | null
  ) => {
    if (!data?.file?.file_path) return <span style={styles.no}>미업로드</span>
    const url = getPublicUrl(data.file.file_path)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <a href={url || '#'} target="_blank" rel="noreferrer" style={styles.ok}>
          ✔ 보기
        </a>
        <span style={styles.small}>판매일: {fmtDate(data.sale?.sale_date)}</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <PageBackButton />
        <div style={styles.title}>증빙서류관리</div>
        <div style={{ ...styles.card, padding: 16 }}>불러오는 중...</div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <PageBackButton />

      <div style={styles.topbar}>
        <div style={styles.title}>증빙서류관리</div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            style={styles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상품명 / 거래처 / 매입일 / 판매일 검색"
          />
          <button style={styles.btn} onClick={load}>
            새로고침
          </button>
        </div>
      </div>

      {err ? <div style={styles.errorBox}>오류: {err}</div> : null}

      <div style={styles.card}>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: 110 }}>상품사진</th>
                <th style={{ ...styles.th, width: 180 }}>상품</th>
                <th style={{ ...styles.th, width: 140 }}>거래처</th>
                <th style={{ ...styles.th, width: 110 }}>매입일</th>
                <th style={{ ...styles.th, width: 110 }}>매입영수증</th>
                <th style={{ ...styles.th, width: 90 }}>배송비</th>
                <th style={{ ...styles.th, width: 90 }}>관부과세</th>
                <th style={{ ...styles.th, width: 80 }}>잔금</th>
                <th style={{ ...styles.th, width: 110 }}>수입신고필증</th>
                <th style={{ ...styles.th, width: 110 }}>매출영수증</th>
              </tr>
            </thead>

            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={10}>
                    조건에 맞는 상품이 없어.
                  </td>
                </tr>
              ) : (
                filteredItems.map((it) => {
                  const purchase = purchaseMap.get(it.purchase_id)
                  const purchaseReceipt = getPurchaseFile(it.purchase_id, '매입영수증')
                  const shippingReceipt = getCostFileForItem(it.id, '배송비', '추가비용영수증')
                  const taxReceipt = getCostFileForItem(it.id, '관부과세', '추가비용영수증')
                  const balanceReceipt = getCostFileForItem(it.id, '잔금', '추가비용영수증')
                  const customsDoc = getAnyCustomsDocForItem(it.id)
                  const latestSaleReceipt = getLatestSaleReceiptForItem(it.id)
                  const imageUrl = itemPhotoMap.get(it.id) || ''

                  return (
                    <tr key={it.id}>
                      <td style={styles.td}>
                        <div style={styles.thumbBox}>
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={it.item_name || '상품'}
                              style={styles.thumbImg}
                            />
                          ) : (
                            <span>없음</span>
                          )}
                        </div>
                      </td>

                      <td style={styles.td}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 13 }}>
                            {it.item_name ?? '(이름 없음)'}
                            {it.is_preorder && !hasBalanceByItem.get(it.id) ? (
                              <span style={styles.badge}>예약</span>
                            ) : null}
                          </div>
                          <div style={styles.small}>
                            등록: {new Date(it.created_at).toLocaleString('ko-KR')}
                          </div>
                        </div>
                      </td>

                      <td style={styles.td}>{purchase?.supplier ?? '(거래처 없음)'}</td>
                      <td style={styles.td}>{fmtDate(purchase?.purchase_date)}</td>
                      <td style={styles.td}>{renderFile(purchaseReceipt)}</td>
                      <td style={styles.td}>{renderFile(shippingReceipt)}</td>
                      <td style={styles.td}>{renderFile(taxReceipt)}</td>
                      <td style={styles.td}>{renderFile(balanceReceipt)}</td>
                      <td style={styles.td}>{renderFile(customsDoc)}</td>
                      <td style={styles.td}>{renderSaleReceiptFile(latestSaleReceipt)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}