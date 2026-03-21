'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import SafeModal from '../../components/SafeModal'

type PurchaseItemRow = {
  id: string
  purchase_id: string | null
  item_name: string | null
  qty: number | null
  unit_price: number | null
  line_total: number | null
  memo: string | null
  foreign_total: number | null
  foreign_unit_price: number | null
  is_preorder: boolean | null
  attachment_url: string | null
  online_price: number | null
  online_shipping: number | null
  offline_price: number | null
  product_note?: string | null
  created_at?: string | null
}

type ArrivalRow = {
  id: string
  purchase_item_id: string
  arrived_qty: number | null
  arrived_date: string | null
  memo: string | null
  created_at?: string | null
}

type SaleItemRow = {
  id: string
  sale_id: string
  purchase_item_id: string
  qty: number
  sale_price: number
  shipping_fee: number | null
  discount_amount: number | null
  line_total: number | null
  created_at?: string | null
}

type SaleItemJoined = {
  id: string
  purchase_item_id: string
  qty: number
  sale_price: number
  shipping_fee: number | null
  discount_amount: number | null
  line_total: number | null
  purchase_items?: {
    item_name: string | null
    attachment_url: string | null
    is_preorder: boolean | null
  } | null
}

type SaleRow = {
  id: string
  sale_date: string
  sales_channel?: string | null
  channel?: string | null
  customer_name?: string | null
  memo: string | null
  actual_shipping_fee: number
  discount_amount: number
  prepaid_shipping_fee: number
  selling_fee: number
  total_product_amount: number
  final_amount: number
  purchase_unit_price: number
  purchase_amount: number
  profit_amount: number
  created_at?: string | null
  sale_items?: SaleItemJoined[]
}

type PurchaseCostRow = {
  id: string
  cost_type: string | null
}

type CostAllocationRow = {
  purchase_cost_id: string
  purchase_item_id: string
  allocated_amount?: number | null
}

type FileRow = {
  id: string
  item_id: string | null
  file_type: string | null
  file_path: string | null
  created_at: string | null
}

type ProductOption = {
  purchase_item_id: string
  item_name: string
  attachment_url: string
  online_price: number
  offline_price: number
  online_shipping: number
  purchase_unit_price: number
  stock_qty: number
}

const purpleBtn =
  'inline-flex items-center justify-center rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-violet-700 active:scale-[0.99] disabled:opacity-60'

const whiteBtn =
  'inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-800 hover:bg-slate-50 active:scale-[0.99]'

const inputClass =
  'h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 placeholder:text-slate-500 outline-none focus:border-violet-500'

function getTodayString() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateInput(raw: string) {
  let v = raw.replace(/[^0-9]/g, '').slice(0, 8)
  if (v.length >= 5) v = `${v.slice(0, 4)}-${v.slice(4)}`
  if (v.length >= 8) v = `${v.slice(0, 7)}-${v.slice(7)}`
  return v
}

function ProductSearchSelect({
  products,
  value,
  onChange,
}: {
  products: ProductOption[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const selected = useMemo(
    () => products.find((p) => p.purchase_item_id === value) || null,
    [products, value]
  )

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => p.item_name.toLowerCase().includes(q))
  }, [products, keyword])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-12 w-full items-center justify-between rounded-2xl border border-slate-300 bg-white px-4 text-left text-sm font-medium text-slate-900"
      >
        <span className="flex min-w-0 items-center gap-3">
          {selected ? (
            <>
              {selected.attachment_url ? (
                <img
                  src={selected.attachment_url}
                  alt={selected.item_name}
                  className="h-8 w-8 rounded-lg border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-[11px] font-bold text-slate-500">
                  없음
                </div>
              )}
              <span className="truncate">
                {selected.item_name} / 재고 {selected.stock_qty}
              </span>
            </>
          ) : (
            <span className="text-slate-500">상품 선택</span>
          )}
        </span>
        <span className="ml-3 text-slate-500">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-[56px] z-50 w-full rounded-2xl border border-slate-300 bg-white shadow-xl">
          <div className="border-b border-slate-200 p-3">
            <input
              className={inputClass}
              placeholder="상품명 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm font-medium text-slate-500">
                검색 결과가 없어
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.purchase_item_id}
                  type="button"
                  onClick={() => {
                    onChange(p.purchase_item_id)
                    setOpen(false)
                    setKeyword('')
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-violet-50"
                >
                  {p.attachment_url ? (
                    <img
                      src={p.attachment_url}
                      alt={p.item_name}
                      className="h-12 w-12 rounded-xl border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-xs font-bold text-slate-500">
                      없음
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold text-slate-900">
                      {p.item_name}
                    </div>
                    <div className="mt-1 text-xs font-medium text-slate-600">
                      재고 {p.stock_qty} / 온라인 {p.online_price.toLocaleString()}원 / 오프라인 {p.offline_price.toLocaleString()}원
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SalesPage() {
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemRow[]>([])
  const [arrivals, setArrivals] = useState<ArrivalRow[]>([])
  const [saleItems, setSaleItems] = useState<SaleItemRow[]>([])
  const [sales, setSales] = useState<SaleRow[]>([])
  const [purchaseCosts, setPurchaseCosts] = useState<PurchaseCostRow[]>([])
  const [costAllocations, setCostAllocations] = useState<CostAllocationRow[]>([])
  const [files, setFiles] = useState<FileRow[]>([])

  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<'전체' | '온라인' | '오프라인'>('전체')

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  const [editingSaleId, setEditingSaleId] = useState<string | null>(null)
  const [originalSale, setOriginalSale] = useState<SaleRow | null>(null)

  const [purchaseItemId, setPurchaseItemId] = useState('')
  const [channel, setChannel] = useState<'온라인' | '오프라인'>('온라인')
  const [saleDate, setSaleDate] = useState(getTodayString())
  const [qty, setQty] = useState('1')
  const [discountAmount, setDiscountAmount] = useState('')
  const [prepaidShippingFee, setPrepaidShippingFee] = useState('')
  const [actualShippingFee, setActualShippingFee] = useState('')
  const [sellingFee, setSellingFee] = useState('')
  const [memo, setMemo] = useState('')

  const balanceDoneItemIdSet = useMemo(() => {
    const balanceCostIdSet = new Set(
      purchaseCosts.filter((c) => c.cost_type === '잔금').map((c) => c.id)
    )

    return new Set(
      costAllocations
        .filter((a) => balanceCostIdSet.has(a.purchase_cost_id))
        .map((a) => a.purchase_item_id)
    )
  }, [purchaseCosts, costAllocations])

  const itemPhotoMap = useMemo(() => {
    const map = new Map<string, string>()

    const imageFiles = files.filter(
      (f) => f.file_type === '상품사진' && f.item_id && f.file_path
    )

    for (const f of imageFiles) {
      if (!f.item_id || !f.file_path) continue
      if (map.has(f.item_id)) continue

      const { data } = supabase.storage.from('purchase-files').getPublicUrl(f.file_path)
      map.set(f.item_id, data.publicUrl)
    }

    return map
  }, [files])

  const productOptions = useMemo<ProductOption[]>(() => {
    const arrivedMap = new Map<string, number>()
    for (const a of arrivals) {
      arrivedMap.set(a.purchase_item_id, (arrivedMap.get(a.purchase_item_id) ?? 0) + Number(a.arrived_qty || 0))
    }

    const soldMap = new Map<string, number>()
    for (const s of saleItems) {
      soldMap.set(s.purchase_item_id, (soldMap.get(s.purchase_item_id) ?? 0) + Number(s.qty || 0))
    }

    return purchaseItems
      .map((item) => {
        const arrivedQty = arrivedMap.get(item.id) ?? 0
        const soldQty = soldMap.get(item.id) ?? 0
        const stockQty = arrivedQty - soldQty

        const isBlockedPreorder =
          Boolean(item.is_preorder) && !balanceDoneItemIdSet.has(item.id)

        const allocatedCost = costAllocations
          .filter((a) => a.purchase_item_id === item.id)
          .reduce((sum, a) => sum + Number(a.allocated_amount || 0), 0)

        const qty = Math.max(1, Number(item.qty || 0))
        const baseLineTotal = Number(item.line_total || 0)
        const finalUnitPrice = Math.ceil((baseLineTotal + allocatedCost) / qty)

        return {
          purchase_item_id: item.id,
          item_name: String(item.item_name || '').trim(),
          attachment_url: itemPhotoMap.get(item.id) || String(item.attachment_url || ''),
          online_price: Number(item.online_price || 0),
          offline_price: Number(item.offline_price || 0),
          online_shipping: Number(item.online_shipping || 0),
          purchase_unit_price: finalUnitPrice,
          stock_qty: stockQty,
          isBlockedPreorder,
        }
      })
      .filter((item) => item.item_name && item.stock_qty > 0 && !item.isBlockedPreorder)
      .map(({ isBlockedPreorder: _drop, ...rest }) => rest)
      .sort((a, b) => a.item_name.localeCompare(b.item_name, 'ko'))
  }, [purchaseItems, arrivals, saleItems, balanceDoneItemIdSet, costAllocations, itemPhotoMap])

  const selectedProduct = useMemo(
    () => productOptions.find((p) => p.purchase_item_id === purchaseItemId) || null,
    [productOptions, purchaseItemId]
  )

  const saleUnitPrice = useMemo(() => {
    if (!selectedProduct) return 0
    return channel === '온라인' ? selectedProduct.online_price : selectedProduct.offline_price
  }, [selectedProduct, channel])

  const purchaseUnitPrice = useMemo(() => {
    return Number(selectedProduct?.purchase_unit_price || 0)
  }, [selectedProduct])

  const qtyNumber = Number(qty || 0)
  const discountNumber = Number(discountAmount || 0)
  const prepaidShippingNumber = channel === '온라인' ? Number(prepaidShippingFee || 0) : 0
  const actualShippingNumber = channel === '온라인' ? Number(actualShippingFee || 0) : 0
  const sellingFeeNumber = Number(sellingFee || 0)

  const totalProductAmount = Math.round(saleUnitPrice * qtyNumber)
  const purchaseAmount = Math.round(purchaseUnitPrice * qtyNumber)
  const finalAmount = Math.round(
    totalProductAmount -
      discountNumber +
      prepaidShippingNumber -
      actualShippingNumber -
      sellingFeeNumber
  )
  const profitAmount = Math.round(finalAmount - purchaseAmount)

  const onDirty = () => {
    if (!isDirty) setIsDirty(true)
  }

  const resetForm = () => {
    setEditingSaleId(null)
    setOriginalSale(null)
    setPurchaseItemId('')
    setChannel('온라인')
    setSaleDate(getTodayString())
    setQty('1')
    setDiscountAmount('')
    setPrepaidShippingFee('')
    setActualShippingFee('')
    setSellingFee('')
    setMemo('')
    setIsDirty(false)
  }

  const requestCloseModal = () => {
    if (isDirty) {
      const ok = window.confirm('작성 중인 내용이 있어요.\n저장하지 않고 닫을까요?')
      if (!ok) return
    }
    setOpen(false)
    resetForm()
  }

  const refreshAll = async () => {
    setLoading(true)

    const [piRes, arRes, siRes, sRes, pcRes, caRes, pfRes] = await Promise.all([
      supabase
        .from('purchase_items')
        .select('id,purchase_id,item_name,qty,unit_price,line_total,memo,foreign_total,foreign_unit_price,is_preorder,attachment_url,online_price,online_shipping,offline_price,product_note,created_at')
        .order('id', { ascending: false }),

      supabase
        .from('purchase_item_arrivals')
        .select('id,purchase_item_id,arrived_qty,arrived_date,memo,created_at')
        .order('id', { ascending: false }),

      supabase
        .from('sale_items')
        .select('id,sale_id,purchase_item_id,qty,sale_price,shipping_fee,discount_amount,line_total,created_at')
        .order('id', { ascending: false }),

      supabase
        .from('sales')
        .select(`
          *,
          sale_items (
            id,
            purchase_item_id,
            qty,
            sale_price,
            shipping_fee,
            discount_amount,
            line_total,
            purchase_items (
              item_name,
              attachment_url,
              is_preorder
            )
          )
        `)
        .order('created_at', { ascending: false }),

      supabase
        .from('purchase_costs')
        .select('id,cost_type')
        .order('created_at', { ascending: false }),

      supabase
        .from('cost_allocations')
        .select('purchase_cost_id,purchase_item_id,allocated_amount'),

      supabase
        .from('purchase_files')
        .select('id,item_id,file_type,file_path,created_at')
        .order('created_at', { ascending: false }),
    ])

    if (piRes.error) console.error(piRes.error)
    if (arRes.error) console.error(arRes.error)
    if (siRes.error) console.error(siRes.error)
    if (sRes.error) console.error(sRes.error)
    if (pcRes.error) console.error(pcRes.error)
    if (caRes.error) console.error(caRes.error)
    if (pfRes.error) console.error(pfRes.error)

    setPurchaseItems((piRes.data as PurchaseItemRow[]) || [])
    setArrivals((arRes.data as ArrivalRow[]) || [])
    setSaleItems((siRes.data as SaleItemRow[]) || [])
    setSales((sRes.data as SaleRow[]) || [])
    setPurchaseCosts((pcRes.data as PurchaseCostRow[]) || [])
    setCostAllocations((caRes.data as CostAllocationRow[]) || [])
    setFiles((pfRes.data as FileRow[]) || [])

    setLoading(false)
  }

  useEffect(() => {
    refreshAll()
  }, [])

  const openCreateModal = () => {
    resetForm()
    setOpen(true)
  }

  const openEditModal = (row: SaleRow) => {
    const firstItem = row.sale_items?.[0]

    setEditingSaleId(row.id)
    setOriginalSale(row)
    setPurchaseItemId(String(firstItem?.purchase_item_id || ''))
    setChannel((row.channel || row.sales_channel || '온라인') as '온라인' | '오프라인')
    setSaleDate(row.sale_date || getTodayString())
    setQty(String(firstItem?.qty ?? 1))
    setDiscountAmount(String(row.discount_amount ?? 0))
    setPrepaidShippingFee(String(row.prepaid_shipping_fee ?? 0))
    setActualShippingFee(String(row.actual_shipping_fee ?? 0))
    setSellingFee(String(row.selling_fee ?? 0))
    setMemo(row.memo || '')
    setIsDirty(false)
    setOpen(true)
  }

  const createSale = async () => {
    if (!selectedProduct) {
      alert('상품을 선택해줘')
      return
    }

    if (!saleDate || saleDate.length !== 10) {
      alert('판매일을 YYYY-MM-DD 형식으로 입력해줘')
      return
    }

    if (qtyNumber <= 0) {
      alert('수량을 확인해줘')
      return
    }

    if (selectedProduct.stock_qty < qtyNumber) {
      alert('재고보다 많이 판매할 수 없어')
      return
    }

    setSaving(true)

    const saleRes = await supabase
      .from('sales')
      .insert({
        sale_date: saleDate,
        sales_channel: channel,
        channel,
        discount_amount: Math.round(discountNumber),
        prepaid_shipping_fee: Math.round(prepaidShippingNumber),
        actual_shipping_fee: Math.round(actualShippingNumber),
        selling_fee: Math.round(sellingFeeNumber),
        total_product_amount: Math.round(totalProductAmount),
        final_amount: Math.round(finalAmount),
        purchase_unit_price: Math.round(purchaseUnitPrice),
        purchase_amount: Math.round(purchaseAmount),
        profit_amount: Math.round(profitAmount),
        memo: memo.trim() || null,
      })
      .select('id')
      .single()

    if (saleRes.error) {
      setSaving(false)
      console.error('sales insert error:', saleRes.error)
      alert(`매출 등록 실패\n${saleRes.error.message}`)
      return
    }

    const saleId = saleRes.data.id as string

    const saleItemRes = await supabase.from('sale_items').insert({
      sale_id: saleId,
      purchase_item_id: selectedProduct.purchase_item_id,
      qty: qtyNumber,
      sale_price: Math.round(saleUnitPrice),
      shipping_fee: Math.round(prepaidShippingNumber),
      discount_amount: Math.round(discountNumber),
      line_total: Math.round(totalProductAmount),
    })

    setSaving(false)

    if (saleItemRes.error) {
      await supabase.from('sales').delete().eq('id', saleId)
      console.error('sale_items insert error:', saleItemRes.error)
      alert(`매출상품 저장 실패\n${saleItemRes.error.message}`)
      return
    }

    await refreshAll()
    setOpen(false)
    resetForm()
  }

  const updateSale = async () => {
    if (!editingSaleId || !originalSale) return
    if (!selectedProduct) {
      alert('상품을 선택해줘')
      return
    }
    if (!saleDate || saleDate.length !== 10) {
      alert('판매일을 YYYY-MM-DD 형식으로 입력해줘')
      return
    }
    if (qtyNumber <= 0) {
      alert('수량을 확인해줘')
      return
    }

    const originalItem = originalSale.sale_items?.[0]
    if (!originalItem) {
      alert('기존 매출상품 정보가 없어')
      return
    }

    const currentOptionsMap = new Map(productOptions.map((p) => [p.purchase_item_id, p]))
    const currentTarget = currentOptionsMap.get(selectedProduct.purchase_item_id)

    let availableStock = currentTarget?.stock_qty ?? 0
    if (originalItem.purchase_item_id === selectedProduct.purchase_item_id) {
      availableStock += Number(originalItem.qty || 0)
    }

    if (availableStock < qtyNumber) {
      alert('재고보다 많이 판매할 수 없어')
      return
    }

    setSaving(true)

    const updateSaleRes = await supabase
      .from('sales')
      .update({
        sale_date: saleDate,
        sales_channel: channel,
        channel,
        discount_amount: Math.round(discountNumber),
        prepaid_shipping_fee: Math.round(prepaidShippingNumber),
        actual_shipping_fee: Math.round(actualShippingNumber),
        selling_fee: Math.round(sellingFeeNumber),
        total_product_amount: Math.round(totalProductAmount),
        final_amount: Math.round(finalAmount),
        purchase_unit_price: Math.round(purchaseUnitPrice),
        purchase_amount: Math.round(purchaseAmount),
        profit_amount: Math.round(profitAmount),
        memo: memo.trim() || null,
      })
      .eq('id', editingSaleId)

    if (updateSaleRes.error) {
      setSaving(false)
      console.error('sales update error:', updateSaleRes.error)
      alert(`매출 수정 실패\n${updateSaleRes.error.message}`)
      return
    }

    const updateItemRes = await supabase
      .from('sale_items')
      .update({
        purchase_item_id: selectedProduct.purchase_item_id,
        qty: qtyNumber,
        sale_price: Math.round(saleUnitPrice),
        shipping_fee: Math.round(prepaidShippingNumber),
        discount_amount: Math.round(discountNumber),
        line_total: Math.round(totalProductAmount),
      })
      .eq('id', originalItem.id)

    setSaving(false)

    if (updateItemRes.error) {
      console.error('sale_items update error:', updateItemRes.error)
      alert(`매출상품 수정 실패\n${updateItemRes.error.message}`)
      return
    }

    await refreshAll()
    setOpen(false)
    resetForm()
  }

  const saveSale = async () => {
    if (editingSaleId) {
      await updateSale()
    } else {
      await createSale()
    }
  }

  const deleteSale = async (row: SaleRow) => {
    const ok = window.confirm('이 매출을 삭제할까요?')
    if (!ok) return

    const delRes = await supabase.from('sales').delete().eq('id', row.id)
    if (delRes.error) {
      alert(`삭제 실패\n${delRes.error.message}`)
      return
    }

    await refreshAll()
  }

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase()

    return sales.filter((row) => {
      const firstItem = row.sale_items?.[0]
      const itemName = String(firstItem?.purchase_items?.item_name || '').toLowerCase()
      const memoText = String(row.memo || '').toLowerCase()
      const channelText = String(row.channel || row.sales_channel || '').toLowerCase()
      const dateText = String(row.sale_date || '').toLowerCase()

      const searchOk =
        !q ||
        itemName.includes(q) ||
        memoText.includes(q) ||
        channelText.includes(q) ||
        dateText.includes(q)

      const rowChannel = (row.channel || row.sales_channel || '') as '온라인' | '오프라인' | ''
      const channelOk = channelFilter === '전체' ? true : rowChannel === channelFilter

      return searchOk && channelOk
    })
  }, [sales, search, channelFilter])

  return (
    <div className="min-h-screen bg-[#f6f5fb] p-4 md:p-5">
      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">매출관리</h1>
            <p className="mt-1 text-sm font-medium text-slate-600">
              예약상품 제외 / 사진 표시 / 배분포함원가 반영
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className={purpleBtn} onClick={openCreateModal}>
              + 매출 등록
            </button>
            <button className={whiteBtn} onClick={refreshAll}>
              새로고침
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px]">
          <input
            className={inputClass}
            placeholder="상품명 / 메모 / 판매일 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className={inputClass}
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as '전체' | '온라인' | '오프라인')}
          >
            <option value="전체">전체</option>
            <option value="온라인">온라인</option>
            <option value="오프라인">오프라인</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
          <div className="overflow-x-hidden">
            <table className="w-full table-fixed text-[13px]">
              <colgroup>
                <col className="w-[190px]" />
                <col className="w-[78px]" />
                <col className="w-[88px]" />
                <col className="w-[52px]" />
                <col className="w-[88px]" />
                <col className="w-[88px]" />
                <col className="w-[88px]" />
                <col className="w-[96px]" />
                <col className="w-[72px]" />
                <col className="w-[98px]" />
                <col className="w-[88px]" />
                <col className="w-[78px]" />
                <col className="w-[98px]" />
                <col className="w-[98px]" />
                <col className="w-[100px]" />
                <col className="w-[110px]" />
                <col className="w-[88px]" />
              </colgroup>

              <thead className="bg-slate-50 text-slate-700">
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-3 text-left font-extrabold">상품</th>
                  <th className="px-2 py-3 text-left font-extrabold">판매구분</th>
                  <th className="px-2 py-3 text-left font-extrabold">판매일</th>
                  <th className="px-2 py-3 text-right font-extrabold">수량</th>
                  <th className="px-2 py-3 text-right font-extrabold">매입가격</th>
                  <th className="px-2 py-3 text-right font-extrabold">매입금액</th>
                  <th className="px-2 py-3 text-right font-extrabold">판매가</th>
                  <th className="px-2 py-3 text-right font-extrabold">총상품금액</th>
                  <th className="px-2 py-3 text-right font-extrabold">할인</th>
                  <th className="px-2 py-3 text-right font-extrabold">미리받은배송비</th>
                  <th className="px-2 py-3 text-right font-extrabold">실제배송비</th>
                  <th className="px-2 py-3 text-right font-extrabold">수수료</th>
                  <th className="px-2 py-3 text-right font-extrabold">실입금액</th>
                  <th className="px-2 py-3 text-right font-extrabold">실이익금액</th>
                  <th className="px-2 py-3 text-left font-extrabold">상태</th>
                  <th className="px-2 py-3 text-left font-extrabold">메모</th>
                  <th className="px-2 py-3 text-center font-extrabold">액션</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={17} className="px-4 py-10 text-center text-slate-500">
                      불러오는 중...
                    </td>
                  </tr>
                ) : filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="px-4 py-10 text-center text-slate-500">
                      매출 내역이 없어
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((row) => {
                    const firstItem = row.sale_items?.[0]
                    const itemName = firstItem?.purchase_items?.item_name || '-'
                    const purchaseItemId = String(firstItem?.purchase_item_id || '')
                    const imageUrl =
                      itemPhotoMap.get(purchaseItemId) ||
                      String(firstItem?.purchase_items?.attachment_url || '')
                    const rowChannel = (row.channel || row.sales_channel || '온라인') as '온라인' | '오프라인'
                    const actualFee = rowChannel === '온라인' ? Number(row.actual_shipping_fee || 0) : 0
                    const shippingMissing = rowChannel === '온라인' && actualFee <= 0

                    return (
                      <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={itemName}
                                className="h-11 w-11 rounded-xl border border-slate-200 object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-[11px] font-bold text-slate-500">
                                없음
                              </div>
                            )}
                            <div className="truncate font-extrabold text-slate-900">{itemName}</div>
                          </div>
                        </td>

                        <td className="px-2 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-extrabold ${
                              rowChannel === '온라인'
                                ? 'bg-violet-100 text-violet-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {rowChannel}
                          </span>
                        </td>

                        <td className="px-2 py-3 font-medium text-slate-800">{row.sale_date}</td>
                        <td className="px-2 py-3 text-right font-bold text-slate-900">{firstItem?.qty || 0}</td>
                        <td className="px-2 py-3 text-right font-bold text-slate-900">
                          {Number(row.purchase_unit_price || 0).toLocaleString()}원
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-slate-900">
                          {Number(row.purchase_amount || 0).toLocaleString()}원
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-slate-900">
                          {Number(firstItem?.sale_price || 0).toLocaleString()}원
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-slate-900">
                          {Number(row.total_product_amount || 0).toLocaleString()}원
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-rose-600">
                          - {Number(row.discount_amount || 0).toLocaleString()}원
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-slate-800">
                          + {Number(row.prepaid_shipping_fee || 0).toLocaleString()}원
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-amber-600">
                          - {actualFee.toLocaleString()}원
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-amber-600">
                          - {Number(row.selling_fee || 0).toLocaleString()}원
                        </td>
                        <td className="px-2 py-3 text-right font-extrabold text-slate-900">
                          {Number(row.final_amount || 0).toLocaleString()}원
                        </td>
                        <td
                          className={`px-2 py-3 text-right font-extrabold ${
                            Number(row.profit_amount || 0) >= 0 ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {Number(row.profit_amount || 0).toLocaleString()}원
                        </td>
                        <td className="px-2 py-3">
                          {rowChannel === '오프라인' ? (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-extrabold text-slate-700">
                              배송비 없음
                            </span>
                          ) : shippingMissing ? (
                            <span className="rounded-full bg-orange-100 px-2 py-1 text-[11px] font-extrabold text-orange-700">
                              배송비 미입력
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-extrabold text-emerald-700">
                              배송비 입력완료
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3 font-medium text-slate-700 truncate">{row.memo || '-'}</td>
                        <td className="px-2 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              className="rounded-2xl border border-slate-300 px-2 py-2 text-[11px] font-extrabold text-slate-800 hover:bg-slate-50"
                              onClick={() => openEditModal(row)}
                            >
                              수정
                            </button>
                            <button
                              className="rounded-2xl border border-rose-200 px-2 py-2 text-[11px] font-extrabold text-rose-600 hover:bg-rose-50"
                              onClick={() => deleteSale(row)}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <SafeModal
        open={open}
        title={editingSaleId ? '매출 수정' : '매출 등록'}
        onClose={requestCloseModal}
      >
        <div className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-extrabold text-slate-800">상품</label>
              <ProductSearchSelect
                products={productOptions}
                value={purchaseItemId}
                onChange={(id) => {
                  setPurchaseItemId(id)
                  const selected = productOptions.find((p) => p.purchase_item_id === id) || null
                  if (selected && !editingSaleId) {
                    setPrepaidShippingFee(channel === '온라인' ? String(selected.online_shipping || 0) : '0')
                    setActualShippingFee('0')
                  }
                  onDirty()
                }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-extrabold text-slate-800">판매구분</label>
              <select
                className={inputClass}
                value={channel}
                onChange={(e) => {
                  const next = e.target.value as '온라인' | '오프라인'
                  setChannel(next)
                  if (next === '오프라인') {
                    setPrepaidShippingFee('0')
                    setActualShippingFee('0')
                  } else if (selectedProduct && !editingSaleId) {
                    setPrepaidShippingFee(String(selectedProduct.online_shipping || 0))
                  }
                  onDirty()
                }}
              >
                <option value="온라인">온라인</option>
                <option value="오프라인">오프라인</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-extrabold text-slate-800">판매일</label>
              <input
                className={inputClass}
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                value={saleDate}
                onChange={(e) => {
                  setSaleDate(formatDateInput(e.target.value))
                  onDirty()
                }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-extrabold text-slate-800">수량</label>
              <input
                className={inputClass}
                type="number"
                min={1}
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value)
                  onDirty()
                }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-extrabold text-slate-800">판매가(자동)</label>
              <input
                className={`${inputClass} bg-slate-50 text-slate-900 font-extrabold`}
                readOnly
                value={saleUnitPrice}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-extrabold text-slate-800">총상품금액(자동)</label>
              <input
                className={`${inputClass} bg-slate-50 text-slate-900 font-extrabold`}
                readOnly
                value={totalProductAmount}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-extrabold text-slate-800">매입가격(자동)</label>
              <input
                className={`${inputClass} bg-slate-50 text-slate-900 font-extrabold`}
                readOnly
                value={purchaseUnitPrice}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-extrabold text-slate-800">매입금액(자동)</label>
              <input
                className={`${inputClass} bg-slate-50 text-slate-900 font-extrabold`}
                readOnly
                value={purchaseAmount}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-extrabold text-slate-800">총할인금액</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                placeholder="없으면 0"
                value={discountAmount}
                onChange={(e) => {
                  setDiscountAmount(e.target.value)
                  onDirty()
                }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-extrabold text-slate-800">미리받은배송비</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                disabled={channel === '오프라인'}
                value={channel === '오프라인' ? '0' : prepaidShippingFee}
                onChange={(e) => {
                  setPrepaidShippingFee(e.target.value)
                  onDirty()
                }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-extrabold text-slate-800">실제배송비</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                disabled={channel === '오프라인'}
                placeholder={channel === '오프라인' ? '오프라인은 없음' : '나중에 수정으로 입력 가능'}
                value={channel === '오프라인' ? '0' : actualShippingFee}
                onChange={(e) => {
                  setActualShippingFee(e.target.value)
                  onDirty()
                }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-extrabold text-slate-800">판매수수료</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                placeholder="빼는 금액"
                value={sellingFee}
                onChange={(e) => {
                  setSellingFee(e.target.value)
                  onDirty()
                }}
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-extrabold text-slate-800">메모</label>
              <input
                className={inputClass}
                value={memo}
                onChange={(e) => {
                  setMemo(e.target.value)
                  onDirty()
                }}
                placeholder="선택"
              />
            </div>
          </div>

          <div className="rounded-[24px] border border-violet-100 bg-violet-50 p-5">
            <div className="mb-3 text-sm font-extrabold text-violet-700">자동 계산</div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-800">
                <span>총상품금액</span>
                <span>{totalProductAmount.toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-800">
                <span>매입금액</span>
                <span>{purchaseAmount.toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-800">
                <span>총할인금액</span>
                <span>- {discountNumber.toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-800">
                <span>미리받은배송비</span>
                <span>+ {prepaidShippingNumber.toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-800">
                <span>실제배송비</span>
                <span>- {actualShippingNumber.toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-800">
                <span>판매수수료</span>
                <span>- {sellingFeeNumber.toLocaleString()}원</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl bg-violet-600 px-5 py-4 text-white">
                <span className="text-sm font-extrabold">실입금액</span>
                <span className="text-2xl font-extrabold">{finalAmount.toLocaleString()}원</span>
              </div>

              <div
                className={`flex items-center justify-between rounded-2xl px-5 py-4 text-white ${
                  profitAmount >= 0 ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              >
                <span className="text-sm font-extrabold">실이익금액</span>
                <span className="text-2xl font-extrabold">{profitAmount.toLocaleString()}원</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button className={whiteBtn} type="button" onClick={requestCloseModal}>
              취소
            </button>
            <button className={purpleBtn} type="button" onClick={saveSale} disabled={saving}>
              {saving ? '저장 중...' : editingSaleId ? '매출 수정' : '매출 등록'}
            </button>
          </div>
        </div>
      </SafeModal>
    </div>
  )
}