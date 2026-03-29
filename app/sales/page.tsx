'use client'

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
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

type SaleFileRow = {
  id: string
  sale_id: string | null
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

type SaleLineForm = {
  rowId: string
  purchase_item_id: string
  qty: string
  sale_price: string
}

type LinePreview = {
  rowId: string
  purchase_item_id: string
  item_name: string
  attachment_url: string
  stock_qty: number
  qty: number
  sale_price: number
  default_sale_price: number
  purchase_unit_price: number
  line_total: number
  purchase_amount: number
  online_shipping: number
}

type AllocatedLine = {
  rowId: string
  purchase_item_id: string
  item_name: string
  attachment_url: string
  qty: number
  sale_price: number
  purchase_unit_price: number
  line_total: number
  purchase_amount: number
  allocated_discount: number
  allocated_prepaid_shipping: number
  allocated_actual_shipping: number
  allocated_selling_fee: number
  final_amount: number
  profit_amount: number
}

const STORAGE_BUCKET = 'purchase-files'
const SALE_RECEIPT_TYPE = '매출영수증'

const purpleBtn =
  'inline-flex items-center justify-center rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-violet-700 active:scale-[0.99] disabled:opacity-60'

const whiteBtn =
  'inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-800 hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60'

const dangerBtn =
  'inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-extrabold text-rose-600 hover:bg-rose-50 active:scale-[0.99] disabled:opacity-60'

const inputClass =
  'h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 placeholder:text-slate-500 outline-none focus:border-violet-500'

const textareaClass =
  'min-h-[96px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-500 outline-none focus:border-violet-500'

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

function makeRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function num(v: string | number | null | undefined) {
  return Number(v || 0)
}

function publicUrl(path: string | null | undefined) {
  if (!path) return ''
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

function formatMoney(value: number | null | undefined) {
  return `${Number(value || 0).toLocaleString()}원`
}

function getSaleChannelLabel(row: SaleRow) {
  return (row.channel || row.sales_channel || '온라인') as '온라인' | '오프라인'
}

function allocateBySalesAmount(totalAmount: number, baseAmounts: number[]) {
  const safeTotal = Math.round(totalAmount || 0)
  const safeBases = baseAmounts.map((v) => Math.max(0, Math.round(v || 0)))
  const baseSum = safeBases.reduce((sum, v) => sum + v, 0)

  if (safeBases.length === 0) return []
  if (safeTotal <= 0 || baseSum <= 0) return safeBases.map(() => 0)

  const raw = safeBases.map((base) => Math.floor((safeTotal * base) / baseSum))
  let remain = safeTotal - raw.reduce((sum, v) => sum + v, 0)

  const sortedIndexes = safeBases
    .map((base, idx) => ({ idx, base }))
    .sort((a, b) => {
      if (b.base !== a.base) return b.base - a.base
      return a.idx - b.idx
    })

  let cursor = 0
  while (remain > 0 && sortedIndexes.length > 0) {
    const target = sortedIndexes[cursor % sortedIndexes.length]
    raw[target.idx] += 1
    remain -= 1
    cursor += 1
  }

  return raw
}

function ProductSearchSelect({
  products,
  value,
  onChange,
  excludeIds = [],
}: {
  products: ProductOption[]
  value: string
  onChange: (id: string) => void
  excludeIds?: string[]
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
    return products.filter((p) => {
      if (excludeIds.includes(p.purchase_item_id) && p.purchase_item_id !== value) return false
      if (!q) return true
      return p.item_name.toLowerCase().includes(q)
    })
  }, [products, keyword, excludeIds, value])

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
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-slate-300 bg-white px-4 text-left text-sm font-medium text-slate-900"
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
        <div className="absolute left-0 top-[52px] z-50 w-full rounded-2xl border border-slate-300 bg-white shadow-xl">
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
                      className="h-11 w-11 rounded-xl border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-xs font-bold text-slate-500">
                      없음
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold text-slate-900">
                      {p.item_name}
                    </div>
                    <div className="mt-1 text-xs font-medium text-slate-600">
                      재고 {p.stock_qty} / 온라인 {p.online_price.toLocaleString()}원 / 오프라인{' '}
                      {p.offline_price.toLocaleString()}원
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
  const [saleFiles, setSaleFiles] = useState<SaleFileRow[]>([])

  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<'전체' | '온라인' | '오프라인'>('전체')

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  const [editingSaleId, setEditingSaleId] = useState<string | null>(null)
  const [originalSale, setOriginalSale] = useState<SaleRow | null>(null)

  const [channel, setChannel] = useState<'온라인' | '오프라인'>('온라인')
  const [saleDate, setSaleDate] = useState(getTodayString())
  const [saleLines, setSaleLines] = useState<SaleLineForm[]>([
    { rowId: makeRowId(), purchase_item_id: '', qty: '1', sale_price: '' },
  ])
  const [discountAmount, setDiscountAmount] = useState('')
  const [prepaidShippingFee, setPrepaidShippingFee] = useState('')
  const [actualShippingFee, setActualShippingFee] = useState('')
  const [sellingFee, setSellingFee] = useState('')
  const [memo, setMemo] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [deleteExistingReceipt, setDeleteExistingReceipt] = useState(false)

  const saleFileMap = useMemo(() => {
    const map = new Map<string, SaleFileRow[]>()
    for (const row of saleFiles) {
      if (!row.sale_id) continue
      if (!map.has(row.sale_id)) map.set(row.sale_id, [])
      map.get(row.sale_id)!.push(row)
    }
    return map
  }, [saleFiles])

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
      map.set(f.item_id, publicUrl(f.file_path))
    }

    return map
  }, [files])

  const editingSaleItemIdSet = useMemo(() => {
    return new Set((originalSale?.sale_items || []).map((item) => String(item.purchase_item_id || '')))
  }, [originalSale])

  const productOptions = useMemo<ProductOption[]>(() => {
    const arrivedMap = new Map<string, number>()
    for (const a of arrivals) {
      arrivedMap.set(
        a.purchase_item_id,
        (arrivedMap.get(a.purchase_item_id) ?? 0) + Number(a.arrived_qty || 0)
      )
    }

    const soldMap = new Map<string, number>()
    for (const s of saleItems) {
      soldMap.set(
        s.purchase_item_id,
        (soldMap.get(s.purchase_item_id) ?? 0) + Number(s.qty || 0)
      )
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
          isEditingTarget: editingSaleItemIdSet.has(item.id),
        }
      })
      .filter(
        (item) =>
          item.item_name &&
          !item.isBlockedPreorder &&
          (item.stock_qty > 0 || item.isEditingTarget)
      )
      .map(({ isBlockedPreorder: _drop, isEditingTarget: _editDrop, ...rest }) => rest)
      .sort((a, b) => a.item_name.localeCompare(b.item_name, 'ko'))
  }, [
    purchaseItems,
    arrivals,
    saleItems,
    balanceDoneItemIdSet,
    costAllocations,
    itemPhotoMap,
    editingSaleItemIdSet,
  ])

  const selectedProductMap = useMemo(() => {
    const map = new Map<string, ProductOption>()
    for (const p of productOptions) map.set(p.purchase_item_id, p)
    return map
  }, [productOptions])

  const lineEditingOriginalQtyMap = useMemo(() => {
    const map = new Map<string, number>()
    if (!editingSaleId || !originalSale?.sale_items) return map
    for (const item of originalSale.sale_items || []) {
      map.set(item.purchase_item_id, Number(item.qty || 0))
    }
    return map
  }, [editingSaleId, originalSale])

  const existingReceiptFiles = useMemo(() => {
    if (!editingSaleId) return []
    return (saleFileMap.get(editingSaleId) || []).filter(
      (file) => file.file_type === SALE_RECEIPT_TYPE
    )
  }, [editingSaleId, saleFileMap])

  const existingReceiptUrl = useMemo(() => {
    const target = existingReceiptFiles[0]
    return target?.file_path ? publicUrl(target.file_path) : ''
  }, [existingReceiptFiles])

  const selectedIds = useMemo(
    () => saleLines.map((line) => line.purchase_item_id).filter(Boolean),
    [saleLines]
  )

  const linePreview = useMemo<LinePreview[]>(() => {
    return saleLines.map((line) => {
      const product = selectedProductMap.get(line.purchase_item_id) || null
      const qtyNumber = Math.max(0, Number(line.qty || 0))
      const defaultSaleUnitPrice = product
        ? channel === '온라인'
          ? Number(product.online_price || 0)
          : Number(product.offline_price || 0)
        : 0

      const saleUnitPrice = Math.max(
        0,
        Number(line.sale_price === '' ? defaultSaleUnitPrice : line.sale_price)
      )

      const purchaseUnitPrice = product ? Number(product.purchase_unit_price || 0) : 0
      const lineTotal = Math.round(saleUnitPrice * qtyNumber)
      const purchaseAmount = Math.round(purchaseUnitPrice * qtyNumber)

      return {
        rowId: line.rowId,
        purchase_item_id: line.purchase_item_id,
        item_name: product?.item_name || '',
        attachment_url: product?.attachment_url || '',
        stock_qty: product?.stock_qty || 0,
        qty: qtyNumber,
        sale_price: saleUnitPrice,
        default_sale_price: defaultSaleUnitPrice,
        purchase_unit_price: purchaseUnitPrice,
        line_total: lineTotal,
        purchase_amount: purchaseAmount,
        online_shipping: Number(product?.online_shipping || 0),
      }
    })
  }, [saleLines, selectedProductMap, channel])

  useEffect(() => {
    setSaleLines((prev) =>
      prev.map((line) => {
        const product = selectedProductMap.get(line.purchase_item_id)
        if (!product) return line

        const autoPrice =
          channel === '온라인'
            ? Number(product.online_price || 0)
            : Number(product.offline_price || 0)

        if (line.sale_price === '') {
          return { ...line, sale_price: String(autoPrice || 0) }
        }
        return line
      })
    )
  }, [channel, selectedProductMap])

  useEffect(() => {
    const validLines = linePreview.filter((line) => line.purchase_item_id && line.qty > 0)

    if (channel === '오프라인') {
      if (prepaidShippingFee !== '0') setPrepaidShippingFee('0')
      if (actualShippingFee !== '0') setActualShippingFee('0')
      return
    }

    if (editingSaleId) return

    if (validLines.length === 1) {
      const autoShip = Number(validLines[0].online_shipping || 0)
      if (String(autoShip) !== prepaidShippingFee) {
        setPrepaidShippingFee(String(autoShip))
      }
    }
  }, [linePreview, channel, editingSaleId, prepaidShippingFee, actualShippingFee])

  const totalProductAmount = useMemo(
    () => linePreview.reduce((sum, line) => sum + line.line_total, 0),
    [linePreview]
  )

  const totalPurchaseAmount = useMemo(
    () => linePreview.reduce((sum, line) => sum + line.purchase_amount, 0),
    [linePreview]
  )

  const discountNumber = Math.round(num(discountAmount))
  const prepaidShippingNumber = channel === '온라인' ? Math.round(num(prepaidShippingFee)) : 0
  const actualShippingNumber = channel === '온라인' ? Math.round(num(actualShippingFee)) : 0
  const sellingFeeNumber = Math.round(num(sellingFee))

  const allocatedLines = useMemo<AllocatedLine[]>(() => {
    const validLines = linePreview.filter((line) => line.purchase_item_id && line.qty > 0)
    const bases = validLines.map((line) => line.line_total)

    const allocatedDiscounts = allocateBySalesAmount(discountNumber, bases)
    const allocatedPrepaids = allocateBySalesAmount(prepaidShippingNumber, bases)
    const allocatedActuals = allocateBySalesAmount(actualShippingNumber, bases)
    const allocatedFees = allocateBySalesAmount(sellingFeeNumber, bases)

    return validLines.map((line, idx) => {
      const finalAmount =
        line.line_total -
        allocatedDiscounts[idx] +
        allocatedPrepaids[idx] -
        allocatedActuals[idx] -
        allocatedFees[idx]

      const profitAmount = finalAmount - line.purchase_amount

      return {
        rowId: line.rowId,
        purchase_item_id: line.purchase_item_id,
        item_name: line.item_name,
        attachment_url: line.attachment_url,
        qty: line.qty,
        sale_price: line.sale_price,
        purchase_unit_price: line.purchase_unit_price,
        line_total: line.line_total,
        purchase_amount: line.purchase_amount,
        allocated_discount: allocatedDiscounts[idx] || 0,
        allocated_prepaid_shipping: allocatedPrepaids[idx] || 0,
        allocated_actual_shipping: allocatedActuals[idx] || 0,
        allocated_selling_fee: allocatedFees[idx] || 0,
        final_amount: Math.round(finalAmount),
        profit_amount: Math.round(profitAmount),
      }
    })
  }, [
    linePreview,
    discountNumber,
    prepaidShippingNumber,
    actualShippingNumber,
    sellingFeeNumber,
  ])

  const finalAmount = useMemo(
    () => allocatedLines.reduce((sum, line) => sum + line.final_amount, 0),
    [allocatedLines]
  )

  const profitAmount = useMemo(
    () => allocatedLines.reduce((sum, line) => sum + line.profit_amount, 0),
    [allocatedLines]
  )

  function onDirty() {
    if (!isDirty) setIsDirty(true)
  }

  function setLineValue(rowId: string, patch: Partial<SaleLineForm>) {
    setSaleLines((prev) =>
      prev.map((line) => (line.rowId === rowId ? { ...line, ...patch } : line))
    )
    onDirty()
  }

  function addSaleLine() {
    setSaleLines((prev) => [
      ...prev,
      { rowId: makeRowId(), purchase_item_id: '', qty: '1', sale_price: '' },
    ])
    onDirty()
  }

  function removeSaleLine(rowId: string) {
    setSaleLines((prev) => {
      if (prev.length === 1) {
        return [{ rowId: makeRowId(), purchase_item_id: '', qty: '1', sale_price: '' }]
      }
      return prev.filter((line) => line.rowId !== rowId)
    })
    onDirty()
  }

  function resetForm() {
    setEditingSaleId(null)
    setOriginalSale(null)
    setChannel('온라인')
    setSaleDate(getTodayString())
    setSaleLines([{ rowId: makeRowId(), purchase_item_id: '', qty: '1', sale_price: '' }])
    setDiscountAmount('')
    setPrepaidShippingFee('')
    setActualShippingFee('')
    setSellingFee('')
    setMemo('')
    setReceiptFile(null)
    setDeleteExistingReceipt(false)
    setIsDirty(false)
  }

  async function refreshAll() {
    setLoading(true)

    const [piRes, arRes, siRes, sRes, pcRes, caRes, pfRes, sfRes] = await Promise.all([
      supabase
        .from('purchase_items')
        .select(
          'id,purchase_id,item_name,qty,unit_price,line_total,memo,foreign_total,foreign_unit_price,is_preorder,attachment_url,online_price,online_shipping,offline_price,product_note,created_at'
        )
        .order('id', { ascending: false }),

      supabase
        .from('purchase_item_arrivals')
        .select('id,purchase_item_id,arrived_qty,arrived_date,memo,created_at')
        .order('id', { ascending: false }),

      supabase
        .from('sale_items')
        .select(
          'id,sale_id,purchase_item_id,qty,sale_price,shipping_fee,discount_amount,line_total,created_at'
        )
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

      supabase.from('purchase_costs').select('id,cost_type').order('created_at', { ascending: false }),
      supabase.from('cost_allocations').select('purchase_cost_id,purchase_item_id,allocated_amount'),
      supabase.from('purchase_files').select('id,item_id,file_type,file_path,created_at').order('created_at', { ascending: false }),
      supabase.from('sale_files').select('id,sale_id,file_type,file_path,created_at').order('created_at', { ascending: false }),
    ])

    if (piRes.error) console.error(piRes.error)
    if (arRes.error) console.error(arRes.error)
    if (siRes.error) console.error(siRes.error)
    if (sRes.error) console.error(sRes.error)
    if (pcRes.error) console.error(pcRes.error)
    if (caRes.error) console.error(caRes.error)
    if (pfRes.error) console.error(pfRes.error)
    if (sfRes.error) console.error(sfRes.error)

    setPurchaseItems((piRes.data as PurchaseItemRow[]) || [])
    setArrivals((arRes.data as ArrivalRow[]) || [])
    setSaleItems((siRes.data as SaleItemRow[]) || [])
    setSales((sRes.data as SaleRow[]) || [])
    setPurchaseCosts((pcRes.data as PurchaseCostRow[]) || [])
    setCostAllocations((caRes.data as CostAllocationRow[]) || [])
    setFiles((pfRes.data as FileRow[]) || [])
    setSaleFiles((sfRes.data as SaleFileRow[]) || [])

    setLoading(false)
  }

  useEffect(() => {
    refreshAll()
  }, [])

  function openCreateModal() {
    resetForm()
    setOpen(true)
  }

  function openEditModal(row: SaleRow) {
    const saleItemsJoined = row.sale_items || []

    const nextLines: SaleLineForm[] =
      saleItemsJoined.length > 0
        ? saleItemsJoined.map((item) => ({
            rowId: makeRowId(),
            purchase_item_id: String(item.purchase_item_id || ''),
            qty: String(item.qty ?? 1),
            sale_price: String(item.sale_price ?? 0),
          }))
        : [{ rowId: makeRowId(), purchase_item_id: '', qty: '1', sale_price: '' }]

    setEditingSaleId(row.id)
    setOriginalSale(row)
    setChannel((row.channel || row.sales_channel || '온라인') as '온라인' | '오프라인')
    setSaleDate(row.sale_date || getTodayString())
    setSaleLines(nextLines)
    setDiscountAmount(String(row.discount_amount ?? 0))
    setPrepaidShippingFee(String(row.prepaid_shipping_fee ?? 0))
    setActualShippingFee(String(row.actual_shipping_fee ?? 0))
    setSellingFee(String(row.selling_fee ?? 0))
    setMemo(row.memo || '')
    setReceiptFile(null)
    setDeleteExistingReceipt(false)
    setIsDirty(false)
    setOpen(true)
  }

  function validateBeforeSave() {
    if (!saleDate || saleDate.length !== 10) {
      alert('판매일을 YYYY-MM-DD 형식으로 입력해줘')
      return false
    }

    const validLines = saleLines.filter((line) => line.purchase_item_id)
    if (validLines.length === 0) {
      alert('상품을 1개 이상 선택해줘')
      return false
    }

    const duplicateSet = new Set<string>()
    for (const line of validLines) {
      if (duplicateSet.has(line.purchase_item_id)) {
        alert('같은 상품을 두 줄로 넣을 수 없어. 수량으로 합쳐줘')
        return false
      }
      duplicateSet.add(line.purchase_item_id)
    }

    for (const line of validLines) {
      const qtyNumber = Number(line.qty || 0)
      if (qtyNumber <= 0) {
        alert('수량을 확인해줘')
        return false
      }

      const salePrice = Number(line.sale_price || 0)
      if (salePrice < 0) {
        alert('판매가를 확인해줘')
        return false
      }

      const product = selectedProductMap.get(line.purchase_item_id)
      if (!product) {
        alert('선택한 상품 정보를 찾을 수 없어')
        return false
      }

      const originalQty = lineEditingOriginalQtyMap.get(line.purchase_item_id) ?? 0
      const available = editingSaleId ? product.stock_qty + originalQty : product.stock_qty

      if (available < qtyNumber) {
        alert(`${product.item_name} 재고보다 많이 판매할 수 없어`)
        return false
      }
    }

    return true
  }

  async function uploadReceiptIfNeeded(saleId: string) {
    const existing = existingReceiptFiles[0] || null

    if (deleteExistingReceipt && existing?.file_path) {
      await supabase.storage.from(STORAGE_BUCKET).remove([existing.file_path])
      await supabase.from('sale_files').delete().eq('id', existing.id)
    }

    if (!receiptFile) return

    if (existing?.file_path) {
      await supabase.storage.from(STORAGE_BUCKET).remove([existing.file_path])
      await supabase.from('sale_files').delete().eq('id', existing.id)
    }

    const safeFileName = `${Date.now()}-${receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const filePath = `sale-receipts/${saleId}/${safeFileName}`

    const uploadRes = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, receiptFile, {
      upsert: true,
    })

    if (uploadRes.error) throw new Error(uploadRes.error.message)

    const insertRes = await supabase.from('sale_files').insert({
      sale_id: saleId,
      file_type: SALE_RECEIPT_TYPE,
      file_path: filePath,
    })

    if (insertRes.error) throw new Error(insertRes.error.message)
  }

  async function insertSaleItems(saleId: string, lines: AllocatedLine[]) {
    const insertRows = lines.map((line) => ({
      sale_id: saleId,
      purchase_item_id: line.purchase_item_id,
      qty: line.qty,
      sale_price: Math.round(line.sale_price),
      shipping_fee: Math.round(line.allocated_prepaid_shipping),
      discount_amount: Math.round(line.allocated_discount),
      line_total: Math.round(line.line_total),
    }))

    const insertRes = await supabase.from('sale_items').insert(insertRows)
    if (insertRes.error) throw new Error(insertRes.error.message)
  }

  async function createSale() {
    if (!validateBeforeSave()) return
    setSaving(true)

    try {
      const purchaseUnitAverage =
        allocatedLines.length > 0
          ? Math.ceil(
              totalPurchaseAmount /
                Math.max(1, allocatedLines.reduce((sum, line) => sum + line.qty, 0))
            )
          : 0

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
          purchase_unit_price: Math.round(purchaseUnitAverage),
          purchase_amount: Math.round(totalPurchaseAmount),
          profit_amount: Math.round(profitAmount),
          memo: memo.trim() || null,
        })
        .select('id')
        .single()

      if (saleRes.error) throw new Error(saleRes.error.message)

      const saleId = saleRes.data.id as string

      try {
        await insertSaleItems(saleId, allocatedLines)
        await uploadReceiptIfNeeded(saleId)
      } catch (innerError: any) {
        await supabase.from('sales').delete().eq('id', saleId)
        throw innerError
      }

      await refreshAll()
      setOpen(false)
      resetForm()
    } catch (e: any) {
      console.error(e)
      alert(`매출 등록 실패\n${e?.message || '알 수 없는 오류'}`)
    } finally {
      setSaving(false)
    }
  }

  async function updateSale() {
    if (!editingSaleId) return
    if (!validateBeforeSave()) return

    setSaving(true)

    try {
      const purchaseUnitAverage =
        allocatedLines.length > 0
          ? Math.ceil(
              totalPurchaseAmount /
                Math.max(1, allocatedLines.reduce((sum, line) => sum + line.qty, 0))
            )
          : 0

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
          purchase_unit_price: Math.round(purchaseUnitAverage),
          purchase_amount: Math.round(totalPurchaseAmount),
          profit_amount: Math.round(profitAmount),
          memo: memo.trim() || null,
        })
        .eq('id', editingSaleId)

      if (updateSaleRes.error) throw new Error(updateSaleRes.error.message)

      const deleteOldItems = await supabase.from('sale_items').delete().eq('sale_id', editingSaleId)
      if (deleteOldItems.error) throw new Error(deleteOldItems.error.message)

      await insertSaleItems(editingSaleId, allocatedLines)
      await uploadReceiptIfNeeded(editingSaleId)

      await refreshAll()
      setOpen(false)
      resetForm()
    } catch (e: any) {
      console.error(e)
      alert(`매출 수정 실패\n${e?.message || '알 수 없는 오류'}`)
    } finally {
      setSaving(false)
    }
  }

  async function saveSale() {
    if (editingSaleId) await updateSale()
    else await createSale()
  }

  async function deleteSale(row: SaleRow) {
    const ok = window.confirm('이 매출을 삭제할까요?')
    if (!ok) return

    const targetFiles = (saleFileMap.get(row.id) || []).filter((file) => file.file_path)

    if (targetFiles.length > 0) {
      await supabase.storage.from(STORAGE_BUCKET).remove(
        targetFiles.map((file) => String(file.file_path))
      )
      await supabase.from('sale_files').delete().eq('sale_id', row.id)
    }

    const delRes = await supabase.from('sales').delete().eq('id', row.id)
    if (delRes.error) {
      alert(`삭제 실패\n${delRes.error.message}`)
      return
    }

    await refreshAll()
  }

  function receiptInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null
    setReceiptFile(file)
    onDirty()
  }

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase()

    return sales.filter((row) => {
      const itemNames = (row.sale_items || [])
        .map((item) => String(item.purchase_items?.item_name || ''))
        .join(' ')
        .toLowerCase()

      const memoText = String(row.memo || '').toLowerCase()
      const channelText = String(row.channel || row.sales_channel || '').toLowerCase()
      const dateText = String(row.sale_date || '').toLowerCase()

      const searchOk =
        !q ||
        itemNames.includes(q) ||
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
              다중상품 / 판매금액 비율 배분 / 매출영수증 반영
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
          <div className="max-h-[620px] overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-slate-700">
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-3 text-left font-extrabold">상품</th>
                  <th className="px-2 py-3 text-left font-extrabold">구분</th>
                  <th className="px-2 py-3 text-left font-extrabold">판매일</th>
                  <th className="px-2 py-3 text-right font-extrabold">수량</th>
                  <th className="px-2 py-3 text-right font-extrabold">매입금액</th>
                  <th className="px-2 py-3 text-right font-extrabold">총상품금액</th>
                  <th className="px-2 py-3 text-right font-extrabold">할인</th>
                  <th className="px-2 py-3 text-right font-extrabold">미리배송비</th>
                  <th className="px-2 py-3 text-right font-extrabold">실제배송비</th>
                  <th className="px-2 py-3 text-right font-extrabold">수수료</th>
                  <th className="px-2 py-3 text-right font-extrabold">실입금액</th>
                  <th className="px-2 py-3 text-right font-extrabold">실이익</th>
                  <th className="px-2 py-3 text-left font-extrabold">영수증</th>
                  <th className="px-2 py-3 text-left font-extrabold">메모</th>
                  <th className="px-2 py-3 text-center font-extrabold">액션</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={15} className="px-4 py-10 text-center text-slate-500">
                      불러오는 중...
                    </td>
                  </tr>
                ) : filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-4 py-10 text-center text-slate-500">
                      매출 내역이 없어
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((row) => {
                    const items = row.sale_items || []
                    const rowChannel = getSaleChannelLabel(row)
                    const receiptFiles = (saleFileMap.get(row.id) || []).filter(
                      (file) => file.file_type === SALE_RECEIPT_TYPE
                    )
                    const receiptUrl = receiptFiles[0]?.file_path
                      ? publicUrl(receiptFiles[0].file_path)
                      : ''
                    const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
                    const saleMemo = row.memo || '-'

                    if (items.length === 0) {
                      return (
                        <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-2 py-3 align-top">
                            <div className="text-sm font-bold text-slate-500">상품 없음</div>
                          </td>
                          <td className="px-2 py-3 align-top">
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
                          <td className="px-2 py-3 align-top font-medium text-slate-800">{row.sale_date}</td>
                          <td className="px-2 py-3 align-top text-right font-bold text-slate-900">0</td>
                          <td className="px-2 py-3 align-top text-right font-bold text-slate-900">{formatMoney(row.purchase_amount)}</td>
                          <td className="px-2 py-3 align-top text-right font-bold text-slate-900">{formatMoney(row.total_product_amount)}</td>
                          <td className="px-2 py-3 align-top text-right font-bold text-rose-600">- {formatMoney(row.discount_amount)}</td>
                          <td className="px-2 py-3 align-top text-right font-bold text-slate-800">+ {formatMoney(row.prepaid_shipping_fee)}</td>
                          <td className="px-2 py-3 align-top text-right font-bold text-amber-600">- {formatMoney(row.actual_shipping_fee)}</td>
                          <td className="px-2 py-3 align-top text-right font-bold text-amber-600">- {formatMoney(row.selling_fee)}</td>
                          <td className="px-2 py-3 align-top text-right font-extrabold text-slate-900">{formatMoney(row.final_amount)}</td>
                          <td
                            className={`px-2 py-3 align-top text-right font-extrabold ${
                              Number(row.profit_amount || 0) >= 0
                                ? 'text-emerald-700'
                                : 'text-rose-600'
                            }`}
                          >
                            {formatMoney(row.profit_amount)}
                          </td>
                          <td className="px-2 py-3 align-top">
                            {receiptUrl ? (
                              <a
                                href={receiptUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-extrabold text-emerald-700"
                              >
                                보기
                              </a>
                            ) : (
                              <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-extrabold text-rose-600">
                                미업로드
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-3 align-top font-medium text-slate-700">
                            <div className="max-w-[160px] break-words whitespace-normal">{saleMemo}</div>
                          </td>
                          <td className="px-2 py-3 align-top">
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
                    }

                    return items.map((item, idx) => {
                      const imageId = String(item.purchase_item_id || '')
                      const imageUrl =
                        itemPhotoMap.get(imageId) || String(item.purchase_items?.attachment_url || '')
                      const itemName = String(item.purchase_items?.item_name || '-')
                      const itemQty = Number(item.qty || 0)
                      const saleUnitPrice = Number(item.sale_price || 0)
                      const itemLineTotal = Number(item.line_total || saleUnitPrice * itemQty)

                      return (
                        <tr key={`${row.id}-${item.id}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-2 py-3 align-top">
                            <div className="flex min-w-0 items-start gap-2">
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
                              <div className="min-w-0">
                                <div className="whitespace-normal break-words font-extrabold text-slate-900">{itemName}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  수량 {itemQty}개 / 판매가 {formatMoney(saleUnitPrice)} / 상품금액 {formatMoney(itemLineTotal)}
                                </div>
                              </div>
                            </div>
                          </td>

                          {idx === 0 ? (
                            <>
                              <td rowSpan={items.length} className="px-2 py-3 align-top">
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
                              <td rowSpan={items.length} className="px-2 py-3 align-top font-medium text-slate-800">{row.sale_date}</td>
                              <td rowSpan={items.length} className="px-2 py-3 align-top text-right font-bold text-slate-900">{totalQty}</td>
                              <td rowSpan={items.length} className="px-2 py-3 align-top text-right font-bold text-slate-900">{formatMoney(row.purchase_amount)}</td>
                              <td rowSpan={items.length} className="px-2 py-3 align-top text-right font-bold text-slate-900">{formatMoney(row.total_product_amount)}</td>
                              <td rowSpan={items.length} className="px-2 py-3 align-top text-right font-bold text-rose-600">- {formatMoney(row.discount_amount)}</td>
                              <td rowSpan={items.length} className="px-2 py-3 align-top text-right font-bold text-slate-800">+ {formatMoney(row.prepaid_shipping_fee)}</td>
                              <td rowSpan={items.length} className="px-2 py-3 align-top text-right font-bold text-amber-600">- {formatMoney(row.actual_shipping_fee)}</td>
                              <td rowSpan={items.length} className="px-2 py-3 align-top text-right font-bold text-amber-600">- {formatMoney(row.selling_fee)}</td>
                              <td rowSpan={items.length} className="px-2 py-3 align-top text-right font-extrabold text-slate-900">{formatMoney(row.final_amount)}</td>
                              <td
                                rowSpan={items.length}
                                className={`px-2 py-3 align-top text-right font-extrabold ${
                                  Number(row.profit_amount || 0) >= 0
                                    ? 'text-emerald-700'
                                    : 'text-rose-600'
                                }`}
                              >
                                {formatMoney(row.profit_amount)}
                              </td>
                              <td rowSpan={items.length} className="px-2 py-3 align-top">
                                {receiptUrl ? (
                                  <a
                                    href={receiptUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-extrabold text-emerald-700"
                                  >
                                    보기
                                  </a>
                                ) : (
                                  <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-extrabold text-rose-600">
                                    미업로드
                                  </span>
                                )}
                              </td>
                              <td rowSpan={items.length} className="px-2 py-3 align-top font-medium text-slate-700">
                                <div className="max-w-[160px] break-words whitespace-normal">{saleMemo}</div>
                              </td>
                              <td rowSpan={items.length} className="px-2 py-3 align-top">
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
                            </>
                          ) : null}
                        </tr>
                      )
                    })
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
        onClose={() => {
          if (isDirty) {
            const ok = window.confirm('작성 중인 내용이 있어요.\n저장하지 않고 닫을까요?')
            if (!ok) return
          }
          setOpen(false)
          resetForm()
        }}
      >
        <div className="grid gap-6">
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-extrabold text-slate-800">
                  판매구분
                </label>
                <select
                  className={inputClass}
                  value={channel}
                  onChange={(e) => {
                    const next = e.target.value as '온라인' | '오프라인'
                    setChannel(next)
                    if (next === '오프라인') {
                      setPrepaidShippingFee('0')
                      setActualShippingFee('0')
                    }
                    onDirty()
                  }}
                >
                  <option value="온라인">온라인</option>
                  <option value="오프라인">오프라인</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-extrabold text-slate-800">
                  판매일
                </label>
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
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-extrabold text-slate-900">상품</div>
                  <div className="mt-1 text-xs font-medium text-slate-500">
                    판매가 직접 수정 가능 / 상품금액 = 판매가 × 수량
                  </div>
                </div>

                <button type="button" className={whiteBtn} onClick={addSaleLine}>
                  + 상품 추가
                </button>
              </div>

              <div className="max-h-[420px] overflow-y-auto overflow-x-hidden pr-1">
                <div className="grid gap-3">
                {saleLines.map((line, idx) => {
                  const preview = linePreview.find((v) => v.rowId === line.rowId)
                  const excludeIds = selectedIds.filter((id) => id && id !== line.purchase_item_id)

                  return (
                    <div
                      key={line.rowId}
                      className="rounded-[20px] border border-slate-200 bg-white p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-extrabold text-slate-800">
                          상품 {idx + 1}
                        </div>
                        <button
                          type="button"
                          className={dangerBtn}
                          onClick={() => removeSaleLine(line.rowId)}
                        >
                          삭제
                        </button>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[120px_minmax(0,1fr)_90px_140px_140px]">
                        <div>
                          <label className="mb-2 block text-xs font-extrabold text-slate-700">
                            상품사진
                          </label>
                          <div className="flex h-[92px] w-[92px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                            {preview?.attachment_url ? (
                              <img
                                src={preview.attachment_url}
                                alt={preview?.item_name || '상품'}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-bold text-slate-400">없음</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-extrabold text-slate-700">
                            상품 선택
                          </label>
                          <ProductSearchSelect
                            products={productOptions}
                            value={line.purchase_item_id}
                            onChange={(id) => {
                              const product = selectedProductMap.get(id) || null
                              const autoPrice = product
                                ? channel === '온라인'
                                  ? Number(product.online_price || 0)
                                  : Number(product.offline_price || 0)
                                : 0

                              setLineValue(line.rowId, {
                                purchase_item_id: id,
                                sale_price: String(autoPrice),
                              })
                            }}
                            excludeIds={excludeIds}
                          />
                          <div className="mt-2 min-h-[40px] whitespace-normal break-words text-sm font-bold text-slate-700">
                            {preview?.item_name || '상품 선택 전'}
                          </div>
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-extrabold text-slate-700">
                            수량
                          </label>
                          <input
                            className={inputClass}
                            type="number"
                            min={1}
                            value={line.qty}
                            onChange={(e) => setLineValue(line.rowId, { qty: e.target.value })}
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-extrabold text-slate-700">
                            판매가(수정 가능)
                          </label>
                          <input
                            className={inputClass}
                            type="number"
                            min={0}
                            value={line.sale_price}
                            onChange={(e) =>
                              setLineValue(line.rowId, { sale_price: e.target.value })
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-extrabold text-slate-700">
                            상품금액(자동)
                          </label>
                          <input
                            className={`${inputClass} bg-slate-50`}
                            readOnly
                            value={preview?.line_total || 0}
                          />
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs font-medium text-slate-600 md:grid-cols-3">
                        <div>재고: {preview?.stock_qty || 0}</div>
                        <div>매입단가: {(preview?.purchase_unit_price || 0).toLocaleString()}원</div>
                        <div>매입금액: {(preview?.purchase_amount || 0).toLocaleString()}원</div>
                      </div>
                    </div>
                  )
                })}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-extrabold text-slate-800">
                  총할인금액
                </label>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  placeholder="주문 전체 할인, 없으면 0"
                  value={discountAmount}
                  onChange={(e) => {
                    setDiscountAmount(e.target.value)
                    onDirty()
                  }}
                />
                <div className="mt-1 text-xs text-slate-500">
                  여러 상품이면 판매금액 비율로 자동 배분
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-extrabold text-slate-800">
                  미리받은배송비
                </label>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  disabled={channel === '오프라인'}
                  placeholder={
                    channel === '오프라인'
                      ? '오프라인은 0'
                      : '상품 1개면 상품/재고 배송비 자동 불러옴'
                  }
                  value={channel === '오프라인' ? '0' : prepaidShippingFee}
                  onChange={(e) => {
                    setPrepaidShippingFee(e.target.value)
                    onDirty()
                  }}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-extrabold text-slate-800">
                  실제배송비
                </label>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  disabled={channel === '오프라인'}
                  placeholder={channel === '오프라인' ? '오프라인은 0' : '실제로 쓴 배송비'}
                  value={channel === '오프라인' ? '0' : actualShippingFee}
                  onChange={(e) => {
                    setActualShippingFee(e.target.value)
                    onDirty()
                  }}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-extrabold text-slate-800">
                  판매수수료
                </label>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  placeholder="플랫폼 수수료, 빼는 금액"
                  value={sellingFee}
                  onChange={(e) => {
                    setSellingFee(e.target.value)
                    onDirty()
                  }}
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-extrabold text-slate-800">
                  매출영수증
                </label>
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                  <input
                    className="block w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 file:mr-3 file:rounded-xl file:border-0 file:bg-violet-100 file:px-3 file:py-2 file:text-sm file:font-extrabold file:text-violet-700"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={receiptInputChange}
                  />

                  {existingReceiptUrl ? (
                    <div className="flex items-center gap-2">
                      <a
                        href={existingReceiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={whiteBtn}
                      >
                        기존 영수증 보기
                      </a>
                      <label className="inline-flex items-center gap-2 text-sm font-bold text-rose-600">
                        <input
                          type="checkbox"
                          checked={deleteExistingReceipt}
                          onChange={(e) => {
                            setDeleteExistingReceipt(e.target.checked)
                            onDirty()
                          }}
                        />
                        기존 영수증 삭제
                      </label>
                    </div>
                  ) : null}
                </div>

                {receiptFile ? (
                  <div className="mt-2 text-xs font-medium text-slate-600">
                    새 파일: {receiptFile.name}
                  </div>
                ) : null}
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-extrabold text-slate-800">
                  메모
                </label>
                <textarea
                  className={textareaClass}
                  value={memo}
                  onChange={(e) => {
                    setMemo(e.target.value)
                    onDirty()
                  }}
                  placeholder="선택"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-violet-100 bg-violet-50 p-5">
            <div className="mb-3 text-sm font-extrabold text-violet-700">자동 계산</div>

            <div className="mb-3 text-xs font-medium text-slate-600">
              상품금액 비율로 할인 / 미리받은배송비 / 실제배송비 / 수수료가 자동 배분돼
            </div>

            <div className="grid gap-3">
              {allocatedLines.length === 0 ? (
                <div className="rounded-2xl border border-violet-100 bg-white px-4 py-8 text-center text-sm font-medium text-slate-500">
                  상품을 선택하면 계산돼
                </div>
              ) : (
                allocatedLines.map((line, idx) => (
                  <div
                    key={line.rowId}
                    className="rounded-2xl border border-violet-100 bg-white p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="whitespace-normal break-words text-sm font-extrabold text-slate-900">
                          상품 {idx + 1} · {line.item_name}
                        </div>
                        <div className="mt-1 text-xs font-medium text-slate-500">
                          상품금액 비율로 자동 배분
                        </div>
                      </div>
                      <div
                        className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                          line.profit_amount >= 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-600'
                        }`}
                      >
                        실이익 {line.profit_amount.toLocaleString()}원
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <div className="text-[11px] font-bold text-slate-500">수량</div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">
                          {line.qty}
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <div className="text-[11px] font-bold text-slate-500">판매가</div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">
                          {line.sale_price.toLocaleString()}원
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <div className="text-[11px] font-bold text-slate-500">상품금액</div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">
                          {line.line_total.toLocaleString()}원
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <div className="text-[11px] font-bold text-slate-500">매입금액</div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">
                          {line.purchase_amount.toLocaleString()}원
                        </div>
                      </div>

                      <div className="rounded-xl bg-rose-50 px-3 py-3">
                        <div className="text-[11px] font-bold text-rose-500">할인 배분</div>
                        <div className="mt-1 text-sm font-extrabold text-rose-600">
                          - {line.allocated_discount.toLocaleString()}원
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <div className="text-[11px] font-bold text-slate-500">
                          미리받은배송비 배분
                        </div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">
                          + {line.allocated_prepaid_shipping.toLocaleString()}원
                        </div>
                      </div>

                      <div className="rounded-xl bg-amber-50 px-3 py-3">
                        <div className="text-[11px] font-bold text-amber-600">
                          실제배송비 배분
                        </div>
                        <div className="mt-1 text-sm font-extrabold text-amber-700">
                          - {line.allocated_actual_shipping.toLocaleString()}원
                        </div>
                      </div>

                      <div className="rounded-xl bg-amber-50 px-3 py-3">
                        <div className="text-[11px] font-bold text-amber-600">
                          판매수수료 배분
                        </div>
                        <div className="mt-1 text-sm font-extrabold text-amber-700">
                          - {line.allocated_selling_fee.toLocaleString()}원
                        </div>
                      </div>

                      <div className="rounded-xl bg-violet-50 px-3 py-3">
                        <div className="text-[11px] font-bold text-violet-600">실입금액</div>
                        <div className="mt-1 text-sm font-extrabold text-violet-700">
                          {line.final_amount.toLocaleString()}원
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-800">
                <span>총상품금액</span>
                <span>{totalProductAmount.toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-800">
                <span>매입금액</span>
                <span>{totalPurchaseAmount.toLocaleString()}원</span>
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
                <span className="text-2xl font-extrabold">
                  {finalAmount.toLocaleString()}원
                </span>
              </div>

              <div
                className={`flex items-center justify-between rounded-2xl px-5 py-4 text-white ${
                  profitAmount >= 0 ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              >
                <span className="text-sm font-extrabold">실이익금액</span>
                <span className="text-2xl font-extrabold">
                  {profitAmount.toLocaleString()}원
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              className={whiteBtn}
              type="button"
              onClick={() => {
                if (isDirty) {
                  const ok = window.confirm('작성 중인 내용이 있어요.\n저장하지 않고 닫을까요?')
                  if (!ok) return
                }
                setOpen(false)
                resetForm()
              }}
            >
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