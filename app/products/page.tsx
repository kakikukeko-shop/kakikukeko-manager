'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type PurchaseRow = {
  id: string
  purchase_date: string | null
  supplier: string | null
}

type ItemRow = {
  id: string
  purchase_id: string
  item_name: string | null
  qty: number | null
  line_total: number | null
  memo: string | null
  is_preorder: boolean | null
  online_price: number | null
  online_shipping: number | null
  offline_price: number | null
  created_at: string
}

type AllocationRow = {
  purchase_cost_id: string
  purchase_item_id: string
  allocated_amount: number | null
}

type CostRow = {
  id: string
  cost_type: string | null
}

type ArrivalRow = {
  id: string
  purchase_item_id: string
  arrived_qty: number | null
  arrived_date: string | null
  memo: string | null
  created_at: string
}

type FileRow = {
  id: string
  item_id: string | null
  file_type: string | null
  file_path: string | null
  created_at: string
}

type SaleItemRow = {
  id: string
  sale_id: string
  purchase_item_id: string
  qty: number | null
  sale_price: number | null
  shipping_fee: number | null
  discount_amount: number | null
  memo: string | null
  created_at: string
}

const STORAGE_BUCKET = 'purchase-files'

function n(v: any): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function ceilInt(v: number) {
  return Math.ceil(v)
}

function fmtKRW(v: number) {
  return `${Math.round(v).toLocaleString('ko-KR')}원`
}

function fmtNum(v: number) {
  return Number.isFinite(v) ? v.toLocaleString('ko-KR') : '0'
}

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

function formatDateTyping(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

type FlatRow = {
  item: ItemRow
  purchase: PurchaseRow | null
  finalUnitCost: number
  totalQty: number
  arrivedQty: number
  soldQty: number
  stockQty: number
  remainingArrivalQty: number
  lastArrivedDate: string | null
  isComplete: boolean
  photoUrl: string | null
  isReservationOpen: boolean
}

export default function ProductsPage() {
  const [items, setItems] = useState<ItemRow[]>([])
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [costs, setCosts] = useState<CostRow[]>([])
  const [arrivals, setArrivals] = useState<ArrivalRow[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [saleItems, setSaleItems] = useState<SaleItemRow[]>([])

  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<'전체' | '미도착있음' | '입고완료' | '예약포함' | '재고있음' | '재고없음'>('전체')

  const [arrivalModalOpen, setArrivalModalOpen] = useState(false)
  const [arrivalTarget, setArrivalTarget] = useState<ItemRow | null>(null)
  const [arrivalQty, setArrivalQty] = useState('')
  const [arrivalDate, setArrivalDate] = useState('')
  const [arrivalMemo, setArrivalMemo] = useState('')

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ItemRow | null>(null)
  const [eOnlinePrice, setEOnlinePrice] = useState('')
  const [eOnlineShipping, setEOnlineShipping] = useState('')
  const [eOfflinePrice, setEOfflinePrice] = useState('')

  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyTarget, setHistoryTarget] = useState<ItemRow | null>(null)

  const [editArrivalModalOpen, setEditArrivalModalOpen] = useState(false)
  const [editArrivalTarget, setEditArrivalTarget] = useState<ArrivalRow | null>(null)
  const [editArrivalQty, setEditArrivalQty] = useState('')
  const [editArrivalDate, setEditArrivalDate] = useState('')
  const [editArrivalMemo, setEditArrivalMemo] = useState('')

  const purchaseMap = useMemo(() => {
    const m = new Map<string, PurchaseRow>()
    purchases.forEach((p) => m.set(p.id, p))
    return m
  }, [purchases])

  const costTypeMap = useMemo(() => {
    const m = new Map<string, string | null>()
    costs.forEach((c) => m.set(c.id, c.cost_type))
    return m
  }, [costs])

  const allocationSumByItem = useMemo(() => {
    const m = new Map<string, number>()
    allocations.forEach((a) => {
      m.set(a.purchase_item_id, (m.get(a.purchase_item_id) ?? 0) + n(a.allocated_amount))
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

  const arrivalsByItem = useMemo(() => {
    const m = new Map<string, ArrivalRow[]>()
    arrivals.forEach((a) => {
      if (!m.has(a.purchase_item_id)) m.set(a.purchase_item_id, [])
      m.get(a.purchase_item_id)!.push(a)
    })

    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => {
        const da = normalizeDate(a.arrived_date)
        const db = normalizeDate(b.arrived_date)
        if (da && db) return da < db ? 1 : -1
        return a.created_at < b.created_at ? 1 : -1
      })
      m.set(k, arr)
    }

    return m
  }, [arrivals])

  const soldQtyByItem = useMemo(() => {
    const m = new Map<string, number>()
    saleItems.forEach((s) => {
      m.set(s.purchase_item_id, (m.get(s.purchase_item_id) ?? 0) + n(s.qty))
    })
    return m
  }, [saleItems])

  const itemPhotoMap = useMemo(() => {
    const m = new Map<string, string>()
    const itemImageFiles = files.filter((f) => f.file_type === '상품사진' && f.item_id && f.file_path)

    itemImageFiles.forEach((f) => {
      if (!f.item_id || !f.file_path) return
      if (m.has(f.item_id)) return
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(f.file_path)
      m.set(f.item_id, data.publicUrl)
    })

    return m
  }, [files])

  async function load() {
    setLoading(true)
    setErr(null)
    setMsg(null)

    try {
      const [itemRes, purchaseRes, allocRes, costRes, arrivalRes, fileRes, saleItemRes] = await Promise.all([
        supabase
          .from('purchase_items')
          .select('id,purchase_id,item_name,qty,line_total,memo,is_preorder,online_price,online_shipping,offline_price,created_at')
          .order('created_at', { ascending: false }),

        supabase
          .from('purchase')
          .select('id,purchase_date,supplier')
          .order('created_at', { ascending: false }),

        supabase
          .from('cost_allocations')
          .select('purchase_cost_id,purchase_item_id,allocated_amount'),

        supabase
          .from('purchase_costs')
          .select('id,cost_type'),

        supabase
          .from('purchase_item_arrivals')
          .select('id,purchase_item_id,arrived_qty,arrived_date,memo,created_at')
          .order('created_at', { ascending: false }),

        supabase
          .from('purchase_files')
          .select('id,item_id,file_type,file_path,created_at')
          .order('created_at', { ascending: false }),

        supabase
          .from('sale_items')
          .select('id,sale_id,purchase_item_id,qty,sale_price,shipping_fee,discount_amount,memo,created_at')
          .order('created_at', { ascending: false }),
      ])

      if (itemRes.error) throw itemRes.error
      if (purchaseRes.error) throw purchaseRes.error
      if (allocRes.error) throw allocRes.error
      if (costRes.error) throw costRes.error
      if (arrivalRes.error) throw arrivalRes.error
      if (fileRes.error) throw fileRes.error
      if (saleItemRes.error) throw saleItemRes.error

      setItems((itemRes.data ?? []) as ItemRow[])
      setPurchases((purchaseRes.data ?? []) as PurchaseRow[])
      setAllocations((allocRes.data ?? []) as AllocationRow[])
      setCosts((costRes.data ?? []) as CostRow[])
      setArrivals((arrivalRes.data ?? []) as ArrivalRow[])
      setFiles((fileRes.data ?? []) as FileRow[])
      setSaleItems((saleItemRes.data ?? []) as SaleItemRow[])
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const rows = useMemo(() => {
    const mapped: FlatRow[] = items.map((item) => {
      const purchase = purchaseMap.get(item.purchase_id) ?? null
      const totalQty = Math.max(0, n(item.qty))
      const alloc = allocationSumByItem.get(item.id) ?? 0
      const finalLineTotal = n(item.line_total) + alloc
      const finalUnitCost = totalQty > 0 ? ceilInt(finalLineTotal / totalQty) : 0

      const myArrivals = arrivalsByItem.get(item.id) ?? []
      const arrivedQty = myArrivals.reduce((acc, a) => acc + n(a.arrived_qty), 0)
      const remainingArrivalQty = Math.max(0, totalQty - arrivedQty)

      const soldQty = soldQtyByItem.get(item.id) ?? 0
      const stockQty = Math.max(0, arrivedQty - soldQty)

      const lastArrivedDate = myArrivals.length > 0 ? normalizeDate(myArrivals[0].arrived_date) : null
      const isComplete = remainingArrivalQty <= 0 && totalQty > 0

      return {
        item,
        purchase,
        finalUnitCost,
        totalQty,
        arrivedQty,
        soldQty,
        stockQty,
        remainingArrivalQty,
        lastArrivedDate,
        isComplete,
        photoUrl: itemPhotoMap.get(item.id) ?? null,
        isReservationOpen: !!item.is_preorder && !hasBalanceByItem.get(item.id),
      }
    })

    const q = search.trim().toLowerCase()

    const filtered = mapped.filter((row) => {
      const name = (row.item.item_name ?? '').toLowerCase()
      const supplier = (row.purchase?.supplier ?? '').toLowerCase()

      const matchSearch = !q || name.includes(q) || supplier.includes(q)
      if (!matchSearch) return false

      if (filterMode === '미도착있음') return row.remainingArrivalQty > 0
      if (filterMode === '입고완료') return row.isComplete
      if (filterMode === '예약포함') return row.isReservationOpen
      if (filterMode === '재고있음') return row.stockQty > 0
      if (filterMode === '재고없음') return row.stockQty <= 0
      return true
    })

    filtered.sort((a, b) => {
      const nameCompare = (a.item.item_name ?? '').localeCompare(b.item.item_name ?? '', 'ko')
      if (nameCompare !== 0) return nameCompare

      const da = normalizeDate(a.purchase?.purchase_date)
      const db = normalizeDate(b.purchase?.purchase_date)
      if (da && db) return da < db ? 1 : -1

      return a.item.created_at < b.item.created_at ? 1 : -1
    })

    return filtered
  }, [items, purchaseMap, allocationSumByItem, arrivalsByItem, itemPhotoMap, search, filterMode, hasBalanceByItem, soldQtyByItem])

  function openArrivalModal(item: ItemRow) {
    setArrivalTarget(item)
    setArrivalQty('')
    setArrivalDate('')
    setArrivalMemo('')
    setArrivalModalOpen(true)
  }

  async function saveArrival() {
    if (!arrivalTarget) return

    const totalQty = Math.max(0, n(arrivalTarget.qty))
    const currentArrived = (arrivalsByItem.get(arrivalTarget.id) ?? []).reduce((acc, a) => acc + n(a.arrived_qty), 0)
    const remain = Math.max(0, totalQty - currentArrived)
    const qty = n(arrivalQty)

    if (qty <= 0) {
      setErr('입고수량을 입력해줘.')
      return
    }
    if (qty > remain) {
      setErr(`남은 미도착 수량(${remain}개)보다 크게 입력했어.`)
      return
    }

    try {
      setLoading(true)
      setErr(null)
      setMsg(null)

      const ins = await supabase.from('purchase_item_arrivals').insert({
        purchase_item_id: arrivalTarget.id,
        arrived_qty: qty,
        arrived_date: normalizeDate(arrivalDate) || null,
        memo: arrivalMemo || null,
      })

      if (ins.error) throw ins.error

      setMsg('부분입고 저장 완료')
      setArrivalModalOpen(false)
      await load()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  async function completeArrival(item: ItemRow) {
    const totalQty = Math.max(0, n(item.qty))
    const currentArrived = (arrivalsByItem.get(item.id) ?? []).reduce((acc, a) => acc + n(a.arrived_qty), 0)
    const remain = Math.max(0, totalQty - currentArrived)

    if (remain <= 0) {
      setErr('이미 전량 입고완료 상태야.')
      return
    }

    try {
      setLoading(true)
      setErr(null)
      setMsg(null)

      const ins = await supabase.from('purchase_item_arrivals').insert({
        purchase_item_id: item.id,
        arrived_qty: remain,
        arrived_date: new Date().toISOString().slice(0, 10),
        memo: '입고완료 버튼',
      })

      if (ins.error) throw ins.error

      setMsg('전량 입고완료 처리됨')
      await load()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  async function deleteArrival(arrivalId: string) {
    if (!confirm('이 입고이력을 삭제할까?')) return

    try {
      setLoading(true)
      setErr(null)
      setMsg(null)

      const del = await supabase.from('purchase_item_arrivals').delete().eq('id', arrivalId)
      if (del.error) throw del.error

      setMsg('입고이력 삭제 완료')
      await load()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  async function revertToUndelivered(itemId: string) {
    const histories = arrivalsByItem.get(itemId) ?? []
    if (histories.length === 0) {
      setErr('되돌릴 입고이력이 없어.')
      return
    }

    const latest = histories[0]

    if (!confirm('가장 최근 입고처리를 취소하고 미도착으로 되돌릴까?')) return

    try {
      setLoading(true)
      setErr(null)
      setMsg(null)

      const del = await supabase.from('purchase_item_arrivals').delete().eq('id', latest.id)
      if (del.error) throw del.error

      setMsg('가장 최근 입고처리를 취소했어.')
      await load()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  function openEditModal(item: ItemRow) {
    setEditTarget(item)
    setEOnlinePrice(String(item.online_price ?? ''))
    setEOnlineShipping(String(item.online_shipping ?? ''))
    setEOfflinePrice(String(item.offline_price ?? ''))
    setEditModalOpen(true)
  }

  async function saveEdit() {
    if (!editTarget) return

    try {
      setLoading(true)
      setErr(null)
      setMsg(null)

      const upd = await supabase
        .from('purchase_items')
        .update({
          online_price: eOnlinePrice === '' ? null : n(eOnlinePrice),
          online_shipping: eOnlineShipping === '' ? null : n(eOnlineShipping),
          offline_price: eOfflinePrice === '' ? null : n(eOfflinePrice),
        })
        .eq('id', editTarget.id)

      if (upd.error) throw upd.error

      setMsg('상품/재고 정보 수정 완료')
      setEditModalOpen(false)
      await load()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  function openHistoryModal(item: ItemRow) {
    setHistoryTarget(item)
    setHistoryModalOpen(true)
  }

  function openEditArrivalModal(a: ArrivalRow) {
    setEditArrivalTarget(a)
    setEditArrivalQty(String(a.arrived_qty ?? ''))
    setEditArrivalDate(normalizeDate(a.arrived_date))
    setEditArrivalMemo(a.memo ?? '')
    setEditArrivalModalOpen(true)
  }

  async function saveEditArrival() {
    if (!editArrivalTarget) return

    const qty = n(editArrivalQty)
    if (qty <= 0) {
      setErr('입고수량을 입력해줘.')
      return
    }

    try {
      setLoading(true)
      setErr(null)
      setMsg(null)

      const upd = await supabase
        .from('purchase_item_arrivals')
        .update({
          arrived_qty: qty,
          arrived_date: normalizeDate(editArrivalDate) || null,
          memo: editArrivalMemo || null,
        })
        .eq('id', editArrivalTarget.id)

      if (upd.error) throw upd.error

      setMsg('입고이력 수정 완료')
      setEditArrivalModalOpen(false)
      await load()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  const styles = {
    page: {
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #f8f7ff 0%, #f7fbff 100%)',
      color: '#111',
      padding: 20,
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Apple SD Gothic Neo, Noto Sans KR, 'Malgun Gothic', sans-serif",
    } as React.CSSProperties,
    title: { fontSize: 24, fontWeight: 900, color: '#312e81' } as React.CSSProperties,
    topbar: {
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      marginBottom: 14,
    } as React.CSSProperties,
    btn: (kind: 'primary' | 'ghost' | 'green' = 'ghost') =>
      ({
        border: '1px solid',
        borderColor: kind === 'primary' ? '#6d28d9' : kind === 'green' ? '#16a34a' : '#ddd',
        background: kind === 'primary' ? '#6d28d9' : kind === 'green' ? '#16a34a' : '#fff',
        color: kind === 'primary' || kind === 'green' ? '#fff' : '#111',
        padding: '9px 12px',
        borderRadius: 12,
        cursor: 'pointer',
        fontWeight: 800,
        fontSize: 14,
      }) as React.CSSProperties,
    smallBtn: {
      border: '1px solid #ddd',
      background: '#fff',
      color: '#111',
      padding: '7px 10px',
      borderRadius: 10,
      cursor: 'pointer',
      fontWeight: 800,
      fontSize: 12,
    } as React.CSSProperties,
    dangerSmallBtn: {
      border: '1px solid #fecaca',
      background: '#fff',
      color: '#dc2626',
      padding: '7px 10px',
      borderRadius: 10,
      cursor: 'pointer',
      fontWeight: 800,
      fontSize: 12,
    } as React.CSSProperties,
    card: {
      background: '#fff',
      border: '1px solid #e6e6ef',
      borderRadius: 18,
      padding: 14,
      boxShadow: '0 8px 24px rgba(124, 58, 237, 0.05)',
    } as React.CSSProperties,
    tableWrap: { overflowX: 'auto' } as React.CSSProperties,
    table: {
      width: '100%',
      minWidth: 1520,
      borderCollapse: 'separate',
      borderSpacing: 0,
      background: '#fff',
      border: '1px solid #e6e6ef',
      borderRadius: 18,
      overflow: 'hidden',
    } as React.CSSProperties,
    th: {
      textAlign: 'left',
      fontSize: 12,
      color: '#374151',
      padding: '12px 10px',
      borderBottom: '1px solid #e6e6ef',
      background: '#fafafa',
      fontWeight: 900,
      whiteSpace: 'nowrap',
    } as React.CSSProperties,
    td: {
      padding: '12px 10px',
      borderBottom: '1px solid #f0f0f5',
      fontSize: 14,
      verticalAlign: 'middle',
      whiteSpace: 'nowrap',
    } as React.CSSProperties,
    small: { fontSize: 12, color: '#6b7280' } as React.CSSProperties,
    input: {
      border: '1px solid #d9d9e6',
      borderRadius: 12,
      padding: '10px 12px',
      outline: 'none',
      fontSize: 14,
      background: '#fff',
      width: '100%',
      boxSizing: 'border-box',
    } as React.CSSProperties,
    field: { display: 'grid', gap: 6 } as React.CSSProperties,
    label: { fontSize: 12, color: '#374151', fontWeight: 800 } as React.CSSProperties,
    modalOverlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      zIndex: 50,
    } as React.CSSProperties,
    modal: {
      width: 'min(1100px, 96vw)',
      maxHeight: '90vh',
      overflow: 'auto',
      background: '#fff',
      borderRadius: 18,
      border: '1px solid #e6e6ef',
      boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      padding: 16,
    } as React.CSSProperties,
    modalHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    } as React.CSSProperties,
    grid2: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      alignItems: 'start',
    } as React.CSSProperties,
    badge: (kind: 'orange' | 'green' | 'gray' = 'gray') =>
      ({
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: kind === 'orange' ? '#ffedd5' : kind === 'green' ? '#dcfce7' : '#f3f4f6',
        color: kind === 'orange' ? '#9a3412' : kind === 'green' ? '#166534' : '#374151',
      }) as React.CSSProperties,
    thumbCell: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      minWidth: 220,
    } as React.CSSProperties,
    thumb: {
      width: 48,
      height: 48,
      objectFit: 'cover',
      borderRadius: 10,
      border: '1px solid #ddd',
      background: '#f3f4f6',
      flexShrink: 0,
    } as React.CSSProperties,
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.title}>상품 / 재고관리</div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...styles.input, width: 240 }}
            placeholder="상품명 / 거래처 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            style={{ ...styles.input, width: 160 }}
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as any)}
          >
            <option value="전체">전체</option>
            <option value="미도착있음">미도착있음</option>
            <option value="입고완료">입고완료</option>
            <option value="예약포함">예약포함</option>
            <option value="재고있음">재고있음</option>
            <option value="재고없음">재고없음</option>
          </select>

          <button style={styles.btn('ghost')} onClick={load} disabled={loading}>
            새로고침
          </button>
        </div>
      </div>

      {msg ? (
        <div style={{ ...styles.card, marginBottom: 12, background: '#ecfdf5', borderColor: '#bbf7d0', color: '#065f46', fontWeight: 800 }}>
          ✅ {msg}
        </div>
      ) : null}

      {err ? (
        <div style={{ ...styles.card, marginBottom: 12, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b', fontWeight: 800 }}>
          ❌ {err}
        </div>
      ) : null}

      {loading ? (
        <div style={styles.card}>불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div style={styles.card}>조건에 맞는 상품이 없어.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>상품</th>
                <th style={styles.th}>매입일</th>
                <th style={styles.th}>거래처</th>
                <th style={styles.th}>원가</th>
                <th style={styles.th}>총수량</th>
                <th style={styles.th}>입고수량</th>
                <th style={styles.th}>판매수량</th>
                <th style={styles.th}>현재재고</th>
                <th style={styles.th}>미도착</th>
                <th style={styles.th}>온라인판매가</th>
                <th style={styles.th}>배송비</th>
                <th style={styles.th}>온라인이익</th>
                <th style={styles.th}>오프라인판매가</th>
                <th style={styles.th}>오프라인이익</th>
                <th style={styles.th}>마지막입고일</th>
                <th style={styles.th}>상태</th>
                <th style={styles.th}>액션</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const onlineProfit = n(row.item.online_price) - n(row.item.online_shipping) - row.finalUnitCost
                const offlineProfit = n(row.item.offline_price) - row.finalUnitCost

                return (
                  <tr key={row.item.id}>
                    <td style={styles.td}>
                      <div style={styles.thumbCell}>
                        {row.photoUrl ? (
                          <img src={row.photoUrl} alt={row.item.item_name ?? '상품'} style={styles.thumb} />
                        ) : (
                          <div
                            style={{
                              ...styles.thumb,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#888',
                              fontSize: 12,
                            }}
                          >
                            없음
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 900 }}>{row.item.item_name ?? '(이름 없음)'}</div>
                          {row.isReservationOpen ? (
                            <div style={{ marginTop: 4 }}>
                              <span style={styles.badge('orange')}>예약</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    <td style={styles.td}>{fmtDate(row.purchase?.purchase_date)}</td>
                    <td style={styles.td}>{row.purchase?.supplier ?? '(거래처 없음)'}</td>
                    <td style={styles.td}>
                      <div><b>{fmtKRW(row.finalUnitCost)}</b></div>
                      <div style={styles.small}>배분포함</div>
                    </td>
                    <td style={styles.td}>{fmtNum(row.totalQty)}</td>
                    <td style={styles.td}>{fmtNum(row.arrivedQty)}</td>
                    <td style={styles.td}>{fmtNum(row.soldQty)}</td>
                    <td style={styles.td}><b>{fmtNum(row.stockQty)}</b></td>
                    <td style={styles.td}>{fmtNum(row.remainingArrivalQty)}</td>
                    <td style={styles.td}>{n(row.item.online_price) > 0 ? fmtKRW(n(row.item.online_price)) : '미입력'}</td>
                    <td style={styles.td}>{n(row.item.online_shipping) > 0 ? fmtKRW(n(row.item.online_shipping)) : '미입력'}</td>
                    <td style={styles.td}>{n(row.item.online_price) > 0 ? <b>{fmtKRW(onlineProfit)}</b> : '미입력'}</td>
                    <td style={styles.td}>{n(row.item.offline_price) > 0 ? fmtKRW(n(row.item.offline_price)) : '미입력'}</td>
                    <td style={styles.td}>{n(row.item.offline_price) > 0 ? <b>{fmtKRW(offlineProfit)}</b> : '미입력'}</td>
                    <td style={styles.td}>{fmtDate(row.lastArrivedDate)}</td>
                    <td style={styles.td}>
                      {row.isComplete ? (
                        <span style={styles.badge('green')}>입고완료</span>
                      ) : row.arrivedQty > 0 ? (
                        <span style={styles.badge('orange')}>부분입고</span>
                      ) : (
                        <span style={styles.badge('gray')}>미도착</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {!row.isComplete ? (
                          <>
                            <button style={styles.smallBtn} onClick={() => openArrivalModal(row.item)}>
                              부분입고
                            </button>
                            <button style={styles.btn('green')} onClick={() => completeArrival(row.item)}>
                              입고완료
                            </button>
                          </>
                        ) : null}

                        {row.arrivedQty > 0 ? (
                          <button style={styles.smallBtn} onClick={() => revertToUndelivered(row.item.id)}>
                            미도착으로
                          </button>
                        ) : null}

                        <button style={styles.smallBtn} onClick={() => openHistoryModal(row.item)}>
                          입고이력
                        </button>
                        <button style={styles.smallBtn} onClick={() => openEditModal(row.item)}>
                          수정
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {arrivalModalOpen && arrivalTarget && (
        <div style={styles.modalOverlay} onMouseDown={() => setArrivalModalOpen(false)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>부분입고 등록</div>
              <button style={styles.btn('ghost')} onClick={() => setArrivalModalOpen(false)}>
                닫기
              </button>
            </div>

            <div style={{ ...styles.card, marginBottom: 12 }}>
              <div style={{ fontWeight: 900 }}>{arrivalTarget.item_name ?? '(이름 없음)'}</div>
              <div style={styles.small}>
                총수량: {fmtNum(n(arrivalTarget.qty))} / 현재입고:{' '}
                {fmtNum((arrivalsByItem.get(arrivalTarget.id) ?? []).reduce((acc, a) => acc + n(a.arrived_qty), 0))}
              </div>
            </div>

            <div style={styles.grid2}>
              <div style={styles.field}>
                <div style={styles.label}>입고수량</div>
                <input style={styles.input} value={arrivalQty} onChange={(e) => setArrivalQty(e.target.value)} placeholder="숫자만" />
              </div>

              <div style={styles.field}>
                <div style={styles.label}>입고날짜</div>
                <input
                  style={styles.input}
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="YYYY-MM-DD"
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(formatDateTyping(e.target.value))}
                />
              </div>
            </div>

            <div style={{ ...styles.field, marginTop: 12 }}>
              <div style={styles.label}>메모</div>
              <input style={styles.input} value={arrivalMemo} onChange={(e) => setArrivalMemo(e.target.value)} placeholder="선택" />
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button style={styles.btn('primary')} onClick={saveArrival}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && editTarget && (
        <div style={styles.modalOverlay} onMouseDown={() => setEditModalOpen(false)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>상품 / 재고 정보 수정</div>
              <button style={styles.btn('ghost')} onClick={() => setEditModalOpen(false)}>
                닫기
              </button>
            </div>

            <div style={{ ...styles.card, marginBottom: 12 }}>
              <div style={{ fontWeight: 900 }}>{editTarget.item_name ?? '(이름 없음)'}</div>
              <div style={styles.small}>매입줄 기준으로 저장돼.</div>
            </div>

            <div style={styles.grid2}>
              <div style={styles.field}>
                <div style={styles.label}>온라인판매가</div>
                <input style={styles.input} value={eOnlinePrice} onChange={(e) => setEOnlinePrice(e.target.value)} placeholder="숫자만" />
              </div>

              <div style={styles.field}>
                <div style={styles.label}>온라인배송비</div>
                <input style={styles.input} value={eOnlineShipping} onChange={(e) => setEOnlineShipping(e.target.value)} placeholder="숫자만" />
              </div>

              <div style={styles.field}>
                <div style={styles.label}>오프라인판매가</div>
                <input style={styles.input} value={eOfflinePrice} onChange={(e) => setEOfflinePrice(e.target.value)} placeholder="숫자만" />
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button style={styles.btn('primary')} onClick={saveEdit}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {historyModalOpen && historyTarget && (
        <div style={styles.modalOverlay} onMouseDown={() => setHistoryModalOpen(false)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>입고이력</div>
              <button style={styles.btn('ghost')} onClick={() => setHistoryModalOpen(false)}>
                닫기
              </button>
            </div>

            <div style={{ ...styles.card, marginBottom: 12 }}>
              <div style={{ fontWeight: 900 }}>{historyTarget.item_name ?? '(이름 없음)'}</div>
            </div>

            <table
              style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 0,
                background: '#fff',
                border: '1px solid #e6e6ef',
                borderRadius: 18,
                overflow: 'hidden',
                tableLayout: 'fixed',
              }}
            >
              <colgroup>
                <col style={{ width: '16%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...styles.th, fontSize: 14 }}>입고일</th>
                  <th style={{ ...styles.th, fontSize: 14 }}>입고수량</th>
                  <th style={{ ...styles.th, fontSize: 14 }}>메모</th>
                  <th style={{ ...styles.th, fontSize: 14 }}>등록시각</th>
                  <th style={{ ...styles.th, fontSize: 14 }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {(arrivalsByItem.get(historyTarget.id) ?? []).length === 0 ? (
                  <tr>
                    <td style={styles.td} colSpan={5}>입고이력이 없어.</td>
                  </tr>
                ) : (
                  (arrivalsByItem.get(historyTarget.id) ?? []).map((a) => (
                    <tr key={a.id}>
                      <td style={{ ...styles.td, fontSize: 14 }}>{fmtDate(a.arrived_date)}</td>
                      <td style={{ ...styles.td, fontSize: 14 }}>{fmtNum(n(a.arrived_qty))}</td>
                      <td
                        style={{
                          ...styles.td,
                          fontSize: 14,
                          whiteSpace: 'normal',
                          wordBreak: 'keep-all',
                        }}
                      >
                        {a.memo ?? ''}
                      </td>
                      <td style={{ ...styles.td, fontSize: 14 }}>
                        {new Date(a.created_at).toLocaleString('ko-KR')}
                      </td>
                      <td style={{ ...styles.td, fontSize: 14 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button style={styles.smallBtn} onClick={() => openEditArrivalModal(a)}>
                            수정
                          </button>
                          <button style={styles.dangerSmallBtn} onClick={() => deleteArrival(a.id)}>
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editArrivalModalOpen && editArrivalTarget && (
        <div style={styles.modalOverlay} onMouseDown={() => setEditArrivalModalOpen(false)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>입고이력 수정</div>
              <button style={styles.btn('ghost')} onClick={() => setEditArrivalModalOpen(false)}>
                닫기
              </button>
            </div>

            <div style={styles.grid2}>
              <div style={styles.field}>
                <div style={styles.label}>입고수량</div>
                <input
                  style={styles.input}
                  value={editArrivalQty}
                  onChange={(e) => setEditArrivalQty(e.target.value)}
                  placeholder="숫자만"
                />
              </div>

              <div style={styles.field}>
                <div style={styles.label}>입고날짜</div>
                <input
                  style={styles.input}
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="YYYY-MM-DD"
                  value={editArrivalDate}
                  onChange={(e) => setEditArrivalDate(formatDateTyping(e.target.value))}
                />
              </div>
            </div>

            <div style={{ ...styles.field, marginTop: 12 }}>
              <div style={styles.label}>메모</div>
              <input
                style={styles.input}
                value={editArrivalMemo}
                onChange={(e) => setEditArrivalMemo(e.target.value)}
                placeholder="선택"
              />
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button style={styles.btn('primary')} onClick={saveEditArrival}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}