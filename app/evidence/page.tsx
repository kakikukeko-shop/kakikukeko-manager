'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'

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
  cost_date: string | null
  amount: number | null
  currency: string | null
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

type SaleReceiptEntry = {
  sale: SaleRow
  saleItem: SaleItemRow
  file: SaleFileRow | null
}

type OtherReceiptEntry = {
  cost: CostRow
  file: FileRow | null
}

type ReceiptModalState =
  | {
      kind: 'sale'
      itemId: string
      title: string
    }
  | {
      kind: 'other'
      itemId: string
      title: string
    }
  | null

const STORAGE_BUCKET = 'purchase-files'
const SALE_RECEIPT_TYPE = '매출영수증'


const EVIDENCE_SORT_OPTIONS = [
  { value: 'purchase_desc', label: '매입일 최신순' },
  { value: 'purchase_asc', label: '매입일 오래된순' },
  { value: 'name', label: '이름순' },
] as const

function normalizeCostType(raw: string | null | undefined) {
  const v = String(raw ?? '').trim()
  if (!v) return ''
  if (v === '배송비') return '배송비(거래처)'
  if (v === '관부과세및 배송비') return '관부과세'
  return v
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return ''
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  return ''
}

function fmtDate(v: string | null | undefined) {
  const x = normalizeDate(v)
  return x || '미입력'
}

function fmtKRW(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return '-'
  return `${Math.round(Number(v)).toLocaleString('ko-KR')}원`
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function isImagePath(path: string | null | undefined) {
  const p = String(path ?? '').toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif'].some((ext) =>
    p.includes(ext),
  )
}

function getFolderByFileType(fileType: string) {
  switch (fileType) {
    case '상품사진':
      return 'item-photos'
    case '매입영수증':
      return 'purchase-receipts'
    case '수입신고필증':
      return 'import-docs'
    case '관부과세영수증':
      return 'customs-receipts'
    case '잔금비용영수증':
      return 'balance-receipts'
    case '기타비용영수증':
      return 'etc-receipts'
    case SALE_RECEIPT_TYPE:
      return 'sale-receipts'
    default:
      return 'shipping-receipts'
  }
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
  const [msg, setMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] =
    useState<(typeof EVIDENCE_SORT_OPTIONS)[number]['value']>('purchase_desc')

  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [receiptModal, setReceiptModal] = useState<ReceiptModalState>(null)

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
      if (normalizeCostType(type) === '잔금') m.set(a.purchase_item_id, true)
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

  const itemPhotoMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      if (item.attachment_url) map.set(item.id, item.attachment_url)
    }
    const imageFiles = files.filter((f) => f.file_type === '상품사진' && f.item_id && f.file_path)
    for (const f of imageFiles) {
      if (!f.item_id || !f.file_path) continue
      if (map.has(f.item_id)) continue
      map.set(f.item_id, getPublicUrl(f.file_path))
    }
    return map
  }, [items, files])

  function getPublicUrl(path: string | null | undefined) {
    if (!path) return ''
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  function getItemPhotoFile(itemId: string) {
    return files.find((f) => f.item_id === itemId && f.file_type === '상품사진' && !!f.file_path) ?? null
  }

  function getPurchaseFile(purchaseId: string, fileType: string) {
    return (
      files.find(
        (f) =>
          f.purchase_id === purchaseId && !f.item_id && !f.cost_id && f.file_type === fileType,
      ) ?? null
    )
  }

  function getCostFileForItem(itemId: string, costType: string, wantedFileType: string) {
    const costIds = allocByItem.get(itemId) ?? []
    for (const costId of costIds) {
      const cost = costMap.get(costId)
      if (normalizeCostType(cost?.cost_type) !== costType) continue
      const found = files.find((f) => f.cost_id === costId && f.file_type === wantedFileType)
      if (found) return found
    }
    return null
  }

  function getMatchingCostForItem(itemId: string, costType: string) {
    const costIds = allocByItem.get(itemId) ?? []
    for (const costId of costIds) {
      const cost = costMap.get(costId)
      if (normalizeCostType(cost?.cost_type) === costType) return cost
    }
    return null
  }

  function getAnyCustomsDocForItem(itemId: string) {
    const costIds = allocByItem.get(itemId) ?? []
    for (const costId of costIds) {
      const found = files.find((f) => f.cost_id === costId && f.file_type === '수입신고필증')
      if (found) return found
    }
    return null
  }

  function getCostForCustomsDocUpload(itemId: string) {
    const customs = getMatchingCostForItem(itemId, '관부과세')
    if (customs) return customs
    const shipping =
      getMatchingCostForItem(itemId, '배송비(배대지)') ??
      getMatchingCostForItem(itemId, '배송비(거래처)')
    if (shipping) return shipping
    const balance = getMatchingCostForItem(itemId, '잔금')
    if (balance) return balance
    const costIds = allocByItem.get(itemId) ?? []
    if (costIds.length > 0) return costMap.get(costIds[0]) ?? null
    return null
  }

  function getLatestSaleReceiptForItem(itemId: string) {
    const linkedSaleItems = salesByItem.get(itemId) ?? []
    if (linkedSaleItems.length === 0) return null

    const candidates: { file: SaleFileRow; sale: SaleRow | undefined; saleDate: string; createdAt: string }[] = []
    linkedSaleItems.forEach((saleItem) => {
      const sale = saleMap.get(saleItem.sale_id)
      const receiptFiles = (saleFilesBySaleId.get(saleItem.sale_id) ?? []).filter(
        (f) => f.file_type === SALE_RECEIPT_TYPE && f.file_path,
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

  function getLatestSaleForItem(itemId: string) {
    const linkedSaleItems = salesByItem.get(itemId) ?? []
    if (linkedSaleItems.length === 0) return null
    const candidates = linkedSaleItems.map((s) => saleMap.get(s.sale_id)).filter(Boolean) as SaleRow[]
    if (candidates.length === 0) return null
    candidates.sort((a, b) => {
      const da = normalizeDate(a.sale_date)
      const db = normalizeDate(b.sale_date)
      if (da !== db) return db.localeCompare(da)
      return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })
    return candidates[0]
  }

  function getSaleReceiptEntriesForItem(itemId: string): SaleReceiptEntry[] {
    const linkedSaleItems = [...(salesByItem.get(itemId) ?? [])]
    linkedSaleItems.sort((a, b) => {
      const sa = saleMap.get(a.sale_id)
      const sb = saleMap.get(b.sale_id)
      const da = normalizeDate(sa?.sale_date)
      const db = normalizeDate(sb?.sale_date)
      if (da !== db) return db.localeCompare(da)
      return String(sb?.created_at || '').localeCompare(String(sa?.created_at || ''))
    })

    return linkedSaleItems
      .map((saleItem) => {
        const sale = saleMap.get(saleItem.sale_id)
        if (!sale) return null
        const existingFiles = (saleFilesBySaleId.get(sale.id) ?? [])
          .filter((f) => f.file_type === SALE_RECEIPT_TYPE)
          .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        return {
          sale,
          saleItem,
          file: existingFiles[0] ?? null,
        } as SaleReceiptEntry
      })
      .filter(Boolean) as SaleReceiptEntry[]
  }

  function getOtherReceiptEntriesForItem(itemId: string): OtherReceiptEntry[] {
    const costIds = allocByItem.get(itemId) ?? []
    const matched = costIds
      .map((costId) => costMap.get(costId))
      .filter((cost): cost is CostRow => !!cost && normalizeCostType(cost.cost_type) === '기타')

    matched.sort((a, b) => {
      const da = normalizeDate(a.cost_date)
      const db = normalizeDate(b.cost_date)
      if (da !== db) return db.localeCompare(da)
      return String(b.id).localeCompare(String(a.id))
    })

    return matched.map((cost) => {
      const file =
        files
          .filter((f) => f.cost_id === cost.id && f.file_type === '기타비용영수증')
          .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] ?? null
      return { cost, file }
    })
  }

  async function uploadToStorage(file: File, folder: string) {
    const path = `${folder}/${Date.now()}-${safeFileName(file.name)}`
    const res = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true })
    if (res.error) throw res.error
    return path
  }

  async function removeStoragePath(path: string | null | undefined) {
    if (!path) return
    const res = await supabase.storage.from(STORAGE_BUCKET).remove([path])
    if (res.error) throw res.error
  }

  async function savePurchaseFile(params: {
    purchase_id?: string | null
    item_id?: string | null
    cost_id?: string | null
    file_type: string
    file: File
  }) {
    const { purchase_id = null, item_id = null, cost_id = null, file_type, file } = params
    const folder = getFolderByFileType(file_type)
    const existing =
      files.find(
        (f) =>
          (f.purchase_id ?? null) === purchase_id &&
          (f.item_id ?? null) === item_id &&
          (f.cost_id ?? null) === cost_id &&
          f.file_type === file_type,
      ) ?? null

    const path = await uploadToStorage(file, folder)

    if (existing) {
      const upd = await supabase
        .from('purchase_files')
        .update({ file_name: file.name, file_path: path })
        .eq('id', existing.id)
      if (upd.error) throw upd.error
      await removeStoragePath(existing.file_path)
      return
    }

    const ins = await supabase.from('purchase_files').insert({
      purchase_id,
      item_id,
      cost_id,
      file_type,
      file_name: file.name,
      file_path: path,
    })
    if (ins.error) throw ins.error
  }

  async function saveSaleFile(params: { sale_id: string; file_type: string; file: File }) {
    const { sale_id, file_type, file } = params
    const folder = getFolderByFileType(file_type)
    const existing =
      saleFiles
        .filter((f) => f.sale_id === sale_id && f.file_type === file_type)
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] ?? null

    const path = await uploadToStorage(file, folder)

    if (existing) {
      const upd = await supabase.from('sale_files').update({ file_path: path }).eq('id', existing.id)
      if (upd.error) throw upd.error
      await removeStoragePath(existing.file_path)
      return
    }

    const ins = await supabase.from('sale_files').insert({ sale_id, file_type, file_path: path })
    if (ins.error) throw ins.error
  }

  async function deletePurchaseFileRow(file: FileRow, uploadKey: string) {
    const ok = window.confirm('이 파일을 삭제할까?')
    if (!ok) return
    try {
      setDeletingKey(uploadKey)
      setErr(null)
      setMsg(null)
      const del = await supabase.from('purchase_files').delete().eq('id', file.id)
      if (del.error) throw del.error
      await removeStoragePath(file.file_path)
      setMsg('파일 삭제 완료')
      await load()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setDeletingKey(null)
    }
  }

  async function deleteSaleFileRow(file: SaleFileRow, uploadKey: string) {
    const ok = window.confirm('이 파일을 삭제할까?')
    if (!ok) return
    try {
      setDeletingKey(uploadKey)
      setErr(null)
      setMsg(null)
      const del = await supabase.from('sale_files').delete().eq('id', file.id)
      if (del.error) throw del.error
      await removeStoragePath(file.file_path)
      setMsg('파일 삭제 완료')
      await load()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setDeletingKey(null)
    }
  }

  async function handlePurchaseFileUpload(
    file: File,
    params: {
      purchase_id?: string | null
      item_id?: string | null
      cost_id?: string | null
      file_type: string
      uploadKey: string
      enabled?: boolean
      dateText?: string
      countText?: string
    },
  ) {
    try {
      setUploadingKey(params.uploadKey)
      setErr(null)
      setMsg(null)
      await savePurchaseFile({
        purchase_id: params.purchase_id,
        item_id: params.item_id,
        cost_id: params.cost_id,
        file_type: params.file_type,
        file,
      })
      setMsg('업로드 완료')
      await load()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setUploadingKey(null)
    }
  }

  async function handleSaleReceiptUpload(file: File, params: { sale_id: string; uploadKey: string }) {
    try {
      setUploadingKey(params.uploadKey)
      setErr(null)
      setMsg(null)
      await saveSaleFile({ sale_id: params.sale_id, file_type: SALE_RECEIPT_TYPE, file })
      setMsg('업로드 완료')
      await load()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setUploadingKey(null)
    }
  }

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const [itemRes, purchaseRes, costRes, allocRes, fileRes, saleItemRes, saleRes, saleFileRes] =
        await Promise.all([
          supabase
            .from('purchase_items')
            .select('id,purchase_id,item_name,created_at,is_preorder,attachment_url')
            .order('created_at', { ascending: false }),
          supabase.from('purchase').select('id,supplier,purchase_date'),
          supabase.from('purchase_costs').select('id,purchase_id,cost_type,vendor_name,cost_date,amount,currency'),
          supabase.from('cost_allocations').select('purchase_cost_id,purchase_item_id'),
          supabase
            .from('purchase_files')
            .select('id,purchase_id,item_id,cost_id,file_type,file_name,file_path,created_at')
            .order('created_at', { ascending: false }),
          supabase.from('sale_items').select('id,sale_id,purchase_item_id,qty,sale_price,line_total'),
          supabase.from('sales').select('id,sale_date,channel,sales_channel,memo,created_at'),
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
    const searched = !q
      ? items
      : items.filter((it) => {
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

    const list = [...searched]
    list.sort((a, b) => {
      const purchaseA = normalizeDate(purchaseMap.get(a.purchase_id)?.purchase_date)
      const purchaseB = normalizeDate(purchaseMap.get(b.purchase_id)?.purchase_date)

      if (sort === 'name') return String(a.item_name || '').localeCompare(String(b.item_name || ''), 'ko-KR')
      if (sort === 'purchase_asc') return purchaseA.localeCompare(purchaseB)
      return purchaseB.localeCompare(purchaseA)
    })

    return list
  }, [items, search, sort, purchaseMap, salesByItem, saleMap, saleFilesBySaleId])

  const styles: Record<string, CSSProperties> = {
    page: {
      minHeight: '100vh',
      background: '#f7f7fb',
      color: '#111',
      padding: 20,
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
    },
    title: { fontSize: 24, fontWeight: 900, color: '#312e81', marginBottom: 14 },
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
    uploadBtn: {
      border: '1px solid #6d28d9',
      background: '#fff',
      color: '#6d28d9',
      padding: '6px 10px',
      borderRadius: 10,
      cursor: 'pointer',
      fontWeight: 800,
      fontSize: 12,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      width: 'fit-content',
    },
    tinyBtn: {
      border: '1px solid #d8b4fe',
      background: '#fff',
      color: '#6d28d9',
      padding: '3px 7px',
      borderRadius: 8,
      cursor: 'pointer',
      fontWeight: 800,
      fontSize: 10,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 'fit-content',
      lineHeight: 1.15,
    },
    tinyDeleteBtn: {
      border: '1px solid #fecaca',
      background: '#fff',
      color: '#dc2626',
      padding: '3px 7px',
      borderRadius: 8,
      cursor: 'pointer',
      fontWeight: 800,
      fontSize: 10,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 'fit-content',
      lineHeight: 1.15,
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
    tableWrap: { overflowX: 'auto' },
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
    small: { fontSize: 11, color: '#6b7280' },
    ok: { color: '#166534', fontWeight: 800, textDecoration: 'none' },
    no: { color: '#dc2626', fontWeight: 800 },
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
    okBox: {
      background: '#ecfdf5',
      color: '#065f46',
      border: '1px solid #bbf7d0',
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
      flexDirection: 'column',
      gap: 6,
      flexShrink: 0,
    },
    tinyThumbBox: {
      width: 52,
      height: 52,
      borderRadius: 10,
      border: '1px solid #e5e7eb',
      background: '#f3f4f6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      fontWeight: 800,
      color: '#6b7280',
      overflow: 'hidden',
      flexShrink: 0,
      textDecoration: 'none',
    },
    thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
    fileCellWrap: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
    fileActionCol: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' },
    modalPreviewWrap: { display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flexWrap: 'wrap' },
    modalPreviewThumb: {
      width: 180,
      height: 180,
      borderRadius: 16,
      border: '1px solid #e5e7eb',
      background: '#f3f4f6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18,
      fontWeight: 900,
      color: '#6b7280',
      overflow: 'hidden',
      flexShrink: 0,
      textDecoration: 'none',
    },
    modalPreviewImage: { width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#fff' },
    modalBackdrop: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20,
    },
    modalCard: {
      width: 'min(1180px, 100%)',
      maxHeight: '85vh',
      overflow: 'hidden',
      background: '#fff',
      borderRadius: 20,
      border: '1px solid #e6e6ef',
      boxShadow: '0 20px 50px rgba(15, 23, 42, 0.18)',
      display: 'flex',
      flexDirection: 'column',
    },
    modalHeader: {
      padding: '16px 18px',
      borderBottom: '1px solid #ececf3',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalBody: { padding: 16, overflowY: 'auto', display: 'grid', gap: 12 },
    modalItemCard: {
      border: '1px solid #ececf3',
      borderRadius: 16,
      padding: 16,
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      gap: 18,
      alignItems: 'center',
      background: '#fafafe',
    },
  }

  const renderDirectFilePreview = (
    file: FileRow | SaleFileRow | null,
    params: {
      onUpload: (file: File) => Promise<void>
      onDelete: () => Promise<void> | void
      uploadKey: string
      canUpload?: boolean
      dateText?: string
      countText?: string
      variant?: 'compact' | 'large'
    },
  ) => {
    const uploading = uploadingKey === params.uploadKey
    const deleting = deletingKey === params.uploadKey
    const filePath = file?.file_path ?? ''
    const fileUrl = getPublicUrl(filePath)
    const image = isImagePath(filePath)
    const isLarge = params.variant === 'large'

    if (!filePath) {
      if (params.canUpload === false) return <span style={styles.no}>미업로드</span>
      return (
        <label style={{ ...styles.uploadBtn, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '업로드중...' : '업로드'}
          <input
            type="file"
            accept="image/*,.pdf"
            hidden
            disabled={uploading}
            onChange={async (e) => {
              const input = e.target as HTMLInputElement
              const selected = input.files?.[0]
              if (!selected) return
              await params.onUpload(selected)
            }}
          />
        </label>
      )
    }

    if (isLarge) {
      return (
        <div style={styles.modalPreviewWrap}>
          <a href={fileUrl || '#'} target="_blank" rel="noreferrer" style={styles.modalPreviewThumb}>
            {image ? <img src={fileUrl} alt="첨부파일" style={styles.modalPreviewImage} /> : <span>PDF</span>}
          </a>
          <div style={{ ...styles.fileActionCol, gap: 8 }}>
            {params.dateText ? <span style={styles.small}>{params.dateText}</span> : null}
            {params.countText ? <span style={styles.small}>{params.countText}</span> : null}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ ...styles.uploadBtn, opacity: uploading ? 0.6 : 1 }}>
                {uploading ? '업로드중...' : '변경'}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  hidden
                  disabled={uploading}
                  onChange={async (e) => {
                    const input = e.target as HTMLInputElement
                    const selected = input.files?.[0]
                    if (!selected) return
                    await params.onUpload(selected)
                  }}
                />
              </label>
              <button
                type="button"
                style={{ ...styles.tinyDeleteBtn, padding: '8px 12px', fontSize: 12, opacity: deleting ? 0.6 : 1 }}
                disabled={deleting}
                onClick={() => params.onDelete()}
              >
                {deleting ? '삭제중' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div style={styles.fileCellWrap}>
        <a href={fileUrl || '#'} target="_blank" rel="noreferrer" style={styles.tinyThumbBox}>
          {image ? <img src={fileUrl} alt="첨부파일" style={styles.thumbImg} /> : <span>PDF</span>}
        </a>
        <div style={styles.fileActionCol}>
          {params.dateText ? <span style={styles.small}>{params.dateText}</span> : null}
          {params.countText ? <span style={styles.small}>{params.countText}</span> : null}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ ...styles.tinyBtn, opacity: uploading ? 0.6 : 1 }}>
              {uploading ? '업로드중...' : '변경'}
              <input
                type="file"
                accept="image/*,.pdf"
                hidden
                disabled={uploading}
                onChange={async (e) => {
                  const input = e.target as HTMLInputElement
                  const selected = input.files?.[0]
                  if (!selected) return
                  await params.onUpload(selected)
                }}
              />
            </label>
            <button
              type="button"
              style={{ ...styles.tinyDeleteBtn, opacity: deleting ? 0.6 : 1 }}
              disabled={deleting}
              onClick={() => params.onDelete()}
            >
              {deleting ? '삭제중' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderPurchaseFileCell = (
    file: FileRow | null,
    params: {
      purchase_id?: string | null
      item_id?: string | null
      cost_id?: string | null
      file_type: string
      uploadKey: string
      enabled?: boolean
      dateText?: string
      countText?: string
    },
  ) => {
    if (!file?.file_path) {
      if (params.enabled === false) return <span style={styles.no}>미업로드</span>
      return (
        <label style={{ ...styles.uploadBtn, opacity: uploadingKey === params.uploadKey ? 0.6 : 1 }}>
          {uploadingKey === params.uploadKey ? '업로드중...' : '업로드'}
          <input
            type="file"
            accept="image/*,.pdf"
            hidden
            disabled={uploadingKey === params.uploadKey}
            onChange={async (e) => {
              const input = e.target as HTMLInputElement
              const selected = input.files?.[0]
              if (!selected) return
              await handlePurchaseFileUpload(selected, params)
            }}
          />
        </label>
      )
    }

    return renderDirectFilePreview(file, {
      uploadKey: params.uploadKey,
      canUpload: params.enabled,
      dateText: params.dateText,
      countText: params.countText,
      onUpload: async (selected) => handlePurchaseFileUpload(selected, params),
      onDelete: async () => deletePurchaseFileRow(file, params.uploadKey),
    })
  }

  const renderSingleSaleReceiptCell = (entry: SaleReceiptEntry | null, params: { uploadKey: string }) => {
    if (!entry) return <span style={styles.no}>미업로드</span>

    if (!entry.file?.file_path) {
      return (
        <label style={{ ...styles.uploadBtn, opacity: uploadingKey === params.uploadKey ? 0.6 : 1 }}>
          {uploadingKey === params.uploadKey ? '업로드중...' : '업로드'}
          <input
            type="file"
            accept="image/*,.pdf"
            hidden
            disabled={uploadingKey === params.uploadKey}
            onChange={async (e) => {
              const input = e.target as HTMLInputElement
              const selected = input.files?.[0]
              if (!selected) return
              await handleSaleReceiptUpload(selected, { sale_id: entry.sale.id, uploadKey: params.uploadKey })
            }}
          />
        </label>
      )
    }

    return renderDirectFilePreview(entry.file, {
      uploadKey: params.uploadKey,
      dateText: `판매일: ${fmtDate(entry.sale.sale_date)}`,
      onUpload: async (selected) =>
        handleSaleReceiptUpload(selected, { sale_id: entry.sale.id, uploadKey: params.uploadKey }),
      onDelete: async () => deleteSaleFileRow(entry.file!, params.uploadKey),
    })
  }

  const renderPhotoCell = (item: ItemRow, imageUrl: string) => {
    const uploadKey = `photo-${item.id}`
    const uploading = uploadingKey === uploadKey
    const deleting = deletingKey === uploadKey
    const photoFileRow = getItemPhotoFile(item.id)

    if (!imageUrl) {
      return (
        <div style={styles.thumbBox}>
          <span>없음</span>
          <label style={{ ...styles.uploadBtn, opacity: uploading ? 0.6 : 1 }}>
            {uploading ? '업로드중...' : '업로드'}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={uploading}
              onChange={async (e) => {
                const input = e.target as HTMLInputElement
                const selected = input.files?.[0]
                if (!selected) return
                await handlePurchaseFileUpload(selected, {
                  item_id: item.id,
                  file_type: '상품사진',
                  uploadKey,
                })
              }}
            />
          </label>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href={imageUrl} target="_blank" rel="noreferrer" style={styles.thumbBox}>
          <img src={imageUrl} alt={item.item_name || '상품'} style={styles.thumbImg} />
        </a>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
          <label style={{ ...styles.tinyBtn, opacity: uploading ? 0.6 : 1 }}>
            {uploading ? '업로드중...' : '변경'}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={uploading}
              onChange={async (e) => {
                const input = e.target as HTMLInputElement
                const selected = input.files?.[0]
                if (!selected) return
                await handlePurchaseFileUpload(selected, {
                  item_id: item.id,
                  file_type: '상품사진',
                  uploadKey,
                })
              }}
            />
          </label>
          {photoFileRow ? (
            <button
              type="button"
              style={{ ...styles.tinyDeleteBtn, opacity: deleting ? 0.6 : 1 }}
              disabled={deleting}
              onClick={() => deletePurchaseFileRow(photoFileRow, uploadKey)}
            >
              {deleting ? '삭제중' : '삭제'}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  const modalSaleEntries = receiptModal?.kind === 'sale' ? getSaleReceiptEntriesForItem(receiptModal.itemId) : []
  const modalOtherEntries = receiptModal?.kind === 'other' ? getOtherReceiptEntriesForItem(receiptModal.itemId) : []

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.title}>증빙서류관리</div>
        <div style={{ ...styles.card, padding: 16 }}>불러오는 중...</div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.title}>증빙서류관리</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            style={styles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상품명 / 거래처 / 매입일 / 판매일 검색"
          />
          <select
            style={{ ...styles.input, width: 180 }}
            value={sort}
            onChange={(e) => setSort(e.target.value as (typeof EVIDENCE_SORT_OPTIONS)[number]['value'])}
          >
            {EVIDENCE_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button style={styles.btn} onClick={load}>
            새로고침
          </button>
        </div>
      </div>

      {msg ? <div style={styles.okBox}>{msg}</div> : null}
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
                <th style={{ ...styles.th, width: 140 }}>매입영수증</th>
                <th style={{ ...styles.th, width: 140 }}>배송비(거래처)</th>
                <th style={{ ...styles.th, width: 140 }}>배송비(배대지)</th>
                <th style={{ ...styles.th, width: 140 }}>관부과세</th>
                <th style={{ ...styles.th, width: 140 }}>잔금</th>
                <th style={{ ...styles.th, width: 140 }}>수입신고필증</th>
                <th style={{ ...styles.th, width: 140 }}>기타영수증</th>
                <th style={{ ...styles.th, width: 140 }}>매출영수증</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={12}>
                    조건에 맞는 상품이 없어.
                  </td>
                </tr>
              ) : (
                filteredItems.map((it) => {
                  const purchase = purchaseMap.get(it.purchase_id)
                  const purchaseReceipt = getPurchaseFile(it.purchase_id, '매입영수증')

                  const supplierShippingCost = getMatchingCostForItem(it.id, '배송비(거래처)')
                  const forwarderShippingCost = getMatchingCostForItem(it.id, '배송비(배대지)')
                  const customsCost = getMatchingCostForItem(it.id, '관부과세')
                  const balanceCost = getMatchingCostForItem(it.id, '잔금')
                  const customsDocCost = getCostForCustomsDocUpload(it.id)

                  const supplierShippingReceipt = getCostFileForItem(it.id, '배송비(거래처)', '배송비영수증')
                  const forwarderShippingReceipt = getCostFileForItem(it.id, '배송비(배대지)', '배송비영수증')
                  const customsReceipt = getCostFileForItem(it.id, '관부과세', '관부과세영수증')
                  const balanceReceipt = getCostFileForItem(it.id, '잔금', '잔금비용영수증')
                  const otherEntries = getOtherReceiptEntriesForItem(it.id)
                  const otherSingle = otherEntries.length === 1 ? otherEntries[0] : null
                  const customsDoc = getAnyCustomsDocForItem(it.id)
                  const saleEntries = getSaleReceiptEntriesForItem(it.id)
                  const saleSingle = saleEntries.length === 1 ? saleEntries[0] : null
                  const latestSale = getLatestSaleForItem(it.id)
                  const imageUrl = itemPhotoMap.get(it.id) || ''

                  return (
                    <tr key={it.id}>
                      <td style={styles.td}>{renderPhotoCell(it, imageUrl)}</td>
                      <td style={styles.td}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 13 }}>
                            {it.item_name ?? '(이름 없음)'}
                            {it.is_preorder && !hasBalanceByItem.get(it.id) ? (
                              <span style={styles.badge}>예약</span>
                            ) : null}
                          </div>
                          <div style={styles.small}>등록: {new Date(it.created_at).toLocaleString('ko-KR')}</div>
                          <div style={styles.small}>매출 {saleEntries.length}건</div>
                        </div>
                      </td>
                      <td style={styles.td}>{purchase?.supplier ?? '(거래처 없음)'}</td>
                      <td style={styles.td}>{fmtDate(purchase?.purchase_date)}</td>
                      <td style={styles.td}>
                        {renderPurchaseFileCell(purchaseReceipt, {
                          purchase_id: it.purchase_id,
                          file_type: '매입영수증',
                          uploadKey: `purchase-receipt-${it.purchase_id}`,
                          enabled: !!it.purchase_id,
                          dateText: fmtDate(purchase?.purchase_date),
                        })}
                      </td>
                      <td style={styles.td}>
                        {renderPurchaseFileCell(supplierShippingReceipt, {
                          cost_id: supplierShippingCost?.id ?? null,
                          file_type: '배송비영수증',
                          uploadKey: `supplier-shipping-${it.id}-${supplierShippingCost?.id ?? 'none'}`,
                          enabled: !!supplierShippingCost?.id,
                          dateText: fmtDate(supplierShippingCost?.cost_date),
                        })}
                      </td>
                      <td style={styles.td}>
                        {renderPurchaseFileCell(forwarderShippingReceipt, {
                          cost_id: forwarderShippingCost?.id ?? null,
                          file_type: '배송비영수증',
                          uploadKey: `forwarder-shipping-${it.id}-${forwarderShippingCost?.id ?? 'none'}`,
                          enabled: !!forwarderShippingCost?.id,
                          dateText: fmtDate(forwarderShippingCost?.cost_date),
                        })}
                      </td>
                      <td style={styles.td}>
                        {renderPurchaseFileCell(customsReceipt, {
                          cost_id: customsCost?.id ?? null,
                          file_type: '관부과세영수증',
                          uploadKey: `customs-${it.id}-${customsCost?.id ?? 'none'}`,
                          enabled: !!customsCost?.id,
                          dateText: fmtDate(customsCost?.cost_date),
                        })}
                      </td>
                      <td style={styles.td}>
                        {renderPurchaseFileCell(balanceReceipt, {
                          cost_id: balanceCost?.id ?? null,
                          file_type: '잔금비용영수증',
                          uploadKey: `balance-${it.id}-${balanceCost?.id ?? 'none'}`,
                          enabled: !!balanceCost?.id,
                          dateText: fmtDate(balanceCost?.cost_date),
                        })}
                      </td>
                      <td style={styles.td}>
                        {renderPurchaseFileCell(customsDoc, {
                          cost_id: customsDocCost?.id ?? null,
                          file_type: '수입신고필증',
                          uploadKey: `customs-doc-${it.id}-${customsDocCost?.id ?? 'none'}`,
                          enabled: !!customsDocCost?.id,
                        })}
                      </td>
                      <td style={styles.td}>
                        {otherEntries.length > 1 ? (
                          <button
                            type="button"
                            style={styles.uploadBtn}
                            onClick={() =>
                              setReceiptModal({
                                kind: 'other',
                                itemId: it.id,
                                title: `${it.item_name ?? '상품'} / 기타영수증`,
                              })
                            }
                          >
                            보기 ({otherEntries.length})
                          </button>
                        ) : otherSingle ? (
                          renderPurchaseFileCell(otherSingle.file, {
                            cost_id: otherSingle.cost.id,
                            file_type: '기타비용영수증',
                            uploadKey: `other-${it.id}-${otherSingle.cost.id}`,
                            enabled: !!otherSingle.cost.id,
                            dateText: fmtDate(otherSingle.cost.cost_date),
                          })
                        ) : (
                          <span style={styles.no}>미업로드</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {saleEntries.length > 1 ? (
                          <button
                            type="button"
                            style={styles.uploadBtn}
                            onClick={() =>
                              setReceiptModal({
                                kind: 'sale',
                                itemId: it.id,
                                title: `${it.item_name ?? '상품'} / 매출영수증`,
                              })
                            }
                          >
                            보기 ({saleEntries.length})
                          </button>
                        ) : saleSingle ? (
                          renderSingleSaleReceiptCell(saleSingle, {
                            uploadKey: `sale-receipt-${it.id}-${saleSingle.sale.id}`,
                          })
                        ) : latestSale ? (
                          <label style={styles.uploadBtn}>
                            업로드
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              hidden
                              onChange={async (e) => {
                                const input = e.target as HTMLInputElement
                                const selected = input.files?.[0]
                                if (!selected) return
                                await handleSaleReceiptUpload(selected, {
                                  sale_id: latestSale.id,
                                  uploadKey: `sale-receipt-${it.id}-${latestSale.id}`,
                                })
                              }}
                            />
                          </label>
                        ) : (
                          <span style={styles.no}>미업로드</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {receiptModal ? (
        <div style={styles.modalBackdrop} onClick={() => setReceiptModal(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{receiptModal.title}</div>
              <button type="button" style={styles.btn} onClick={() => setReceiptModal(null)}>
                닫기
              </button>
            </div>
            <div style={styles.modalBody}>
              {receiptModal.kind === 'sale' ? (
                modalSaleEntries.length === 0 ? (
                  <div style={{ ...styles.card, padding: 16 }}>매출 내역이 없어.</div>
                ) : (
                  modalSaleEntries.map((entry) => {
                    const uploadKey = `sale-modal-${receiptModal.itemId}-${entry.sale.id}`
                    return (
                      <div key={entry.sale.id} style={styles.modalItemCard}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 8 }}>
                            판매일: {fmtDate(entry.sale.sale_date)}
                          </div>
                          <div style={{ ...styles.small, fontSize: 14 }}>구분: {entry.sale.channel || entry.sale.sales_channel || '미입력'}</div>
                          <div style={{ ...styles.small, fontSize: 14 }}>판매금액: {fmtKRW(entry.saleItem.line_total)}</div>
                          <div style={{ ...styles.small, fontSize: 14 }}>수량: {entry.saleItem.qty ?? 0}</div>
                        </div>
                        {entry.file?.file_path ? (
                          renderDirectFilePreview(entry.file, {
                            uploadKey,
                            variant: 'large',
                            dateText: `판매일: ${fmtDate(entry.sale.sale_date)}`,
                            onUpload: async (selected) =>
                              handleSaleReceiptUpload(selected, { sale_id: entry.sale.id, uploadKey }),
                            onDelete: async () => deleteSaleFileRow(entry.file!, uploadKey),
                          })
                        ) : (
                          <label style={{ ...styles.uploadBtn, opacity: uploadingKey === uploadKey ? 0.6 : 1 }}>
                            {uploadingKey === uploadKey ? '업로드중...' : '업로드'}
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              hidden
                              disabled={uploadingKey === uploadKey}
                              onChange={async (e) => {
                                const input = e.target as HTMLInputElement
                                const selected = input.files?.[0]
                                if (!selected) return
                                await handleSaleReceiptUpload(selected, { sale_id: entry.sale.id, uploadKey })
                              }}
                            />
                          </label>
                        )}
                      </div>
                    )
                  })
                )
              ) : modalOtherEntries.length === 0 ? (
                <div style={{ ...styles.card, padding: 16 }}>기타비용 내역이 없어.</div>
              ) : (
                modalOtherEntries.map((entry) => {
                  const uploadKey = `other-modal-${receiptModal.itemId}-${entry.cost.id}`
                  return (
                    <div key={entry.cost.id} style={styles.modalItemCard}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 8 }}>날짜: {fmtDate(entry.cost.cost_date)}</div>
                        <div style={{ ...styles.small, fontSize: 14 }}>거래처: {entry.cost.vendor_name || '미입력'}</div>
                        <div style={{ ...styles.small, fontSize: 14 }}>
                          금액: {fmtKRW(entry.cost.amount)} {entry.cost.currency ? `(${entry.cost.currency})` : ''}
                        </div>
                      </div>
                      {entry.file?.file_path ? (
                        renderDirectFilePreview(entry.file, {
                          uploadKey,
                          variant: 'large',
                          dateText: `날짜: ${fmtDate(entry.cost.cost_date)}`,
                          onUpload: async (selected) =>
                            handlePurchaseFileUpload(selected, {
                              cost_id: entry.cost.id,
                              file_type: '기타비용영수증',
                              uploadKey,
                            }),
                          onDelete: async () => deletePurchaseFileRow(entry.file!, uploadKey),
                        })
                      ) : (
                        <label style={{ ...styles.uploadBtn, opacity: uploadingKey === uploadKey ? 0.6 : 1 }}>
                          {uploadingKey === uploadKey ? '업로드중...' : '업로드'}
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            hidden
                            disabled={uploadingKey === uploadKey}
                            onChange={async (e) => {
                              const input = e.target as HTMLInputElement
                              const selected = input.files?.[0]
                              if (!selected) return
                              await handlePurchaseFileUpload(selected, {
                                cost_id: entry.cost.id,
                                file_type: '기타비용영수증',
                                uploadKey,
                              })
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
