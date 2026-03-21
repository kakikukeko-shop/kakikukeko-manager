'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SafeModal from '../../components/SafeModal'
import PageBackButton from '../../components/PageBackButton'

type PurchaseRow = {
  id: string
  created_at: string
  supplier: string | null
  purchase_date: string | null
  payment_met: string | null
  card_name: string | null
  currency: string | null
  fx_rate: number | null
  total_foreign: number | null
  total_amount: number | null
  memo: string | null
}

type PurchaseItemRow = {
  id: string
  created_at: string
  purchase_id: string
  item_name: string | null
  qty: number | null
  foreign_total: number | null
  foreign_unit_price: number | null
  unit_price: number | null
  line_total: number | null
  memo: string | null
  is_preorder: boolean | null
}

type PurchaseCostRow = {
  id: string
  created_at: string
  purchase_id: string | null
  cost_type: string | null
  amount: number | null
  currency: string | null
  fx_rate: number | null
  memo: string | null
  vendor_name: string | null
  cost_date?: string | null
}

type CostAllocationRow = {
  purchase_cost_id: string
  purchase_item_id: string
  allocated_amount: number | null
}

type VendorRow = {
  id: string
  created_at: string
  name: string | null
  is_product_supplier: boolean | null
  is_forwarder: boolean | null
  is_carry_in: boolean | null
  is_active: boolean | null
}

type FileRow = {
  id: string
  item_id: string | null
  file_type: string | null
  file_path: string | null
  created_at: string
}

type DraftItem = {
  id?: string
  key: string
  item_name: string
  qty: string
  foreign_total: string
  memo: string
  is_preorder: boolean
}

type ItemAllocationView = {
  cost_type: string | null
  amount_krw: number
  created_at: string
  memo: string | null
  vendor_name: string | null
  related_item_names: string[]
  cost_date?: string | null
}

const STORAGE_BUCKET = 'purchase-files'

const CURRENCY_OPTIONS = [
  { value: 'KRW', label: 'KRW(원)' },
  { value: 'USD', label: 'USD(달러)' },
  { value: 'JPY', label: 'JPY(엔)' },
  { value: 'CNY', label: 'CNY(위안)' },
  { value: 'EUR', label: 'EUR(유로)' },
  { value: '직접입력', label: '직접입력' },
] as const

const COST_TYPE_OPTIONS = ['배송비', '관부과세', '잔금', '기타'] as const

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

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('ko-KR')
  } catch {
    return iso
  }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '미입력'
  return iso
}

function normalizeCurrencyCode(raw: string | null | undefined) {
  const v = (raw ?? '').trim().toUpperCase()
  if (v === 'RMB') return 'CNY'
  return v
}

function normalizeCurrencySelectValue(raw: string | null | undefined) {
  const normalized = normalizeCurrencyCode(raw)
  const builtIn = CURRENCY_OPTIONS.map((x) => x.value)
  if (builtIn.includes(normalized as any)) return normalized
  if (!raw) return 'USD'
  return '직접입력'
}

function currencyValue(sel: string, custom: string) {
  if (sel === '직접입력') return custom.trim().toUpperCase()
  return normalizeCurrencyCode(sel)
}

function currencyLabel(raw: string | null | undefined) {
  const normalized = normalizeCurrencyCode(raw)
  const found = CURRENCY_OPTIONS.find((x) => x.value === normalized)
  if (found) return found.label
  return raw?.trim() || '미입력'
}

function calcFxRate(totalKRW: number, totalForeign: number) {
  if (totalKRW > 0 && totalForeign > 0) return totalKRW / totalForeign
  return 0
}

function toKRW(amount: number, cur: string, fxRate: number) {
  if (normalizeCurrencyCode(cur) === 'KRW') return amount
  return amount * fxRate
}

function formatDateInput(raw: string) {
  let v = raw.replace(/[^0-9]/g, '').slice(0, 8)
  if (v.length >= 5) v = `${v.slice(0, 4)}-${v.slice(4)}`
  if (v.length >= 8) v = `${v.slice(0, 7)}-${v.slice(7)}`
  return v
}

export default function DocumentsPage() {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [items, setItems] = useState<PurchaseItemRow[]>([])
  const [costs, setCosts] = useState<PurchaseCostRow[]>([])
  const [allocations, setAllocations] = useState<CostAllocationRow[]>([])
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [files, setFiles] = useState<FileRow[]>([])

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [itemSearch, setItemSearch] = useState('')

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const [buyMode, setBuyMode] = useState<'create' | 'edit'>('create')
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null)
  const [buyDirty, setBuyDirty] = useState(false)

  const [costModalOpen, setCostModalOpen] = useState(false)
  const [costDirty, setCostDirty] = useState(false)

  const [costEditModalOpen, setCostEditModalOpen] = useState(false)
  const [editingCost, setEditingCost] = useState<PurchaseCostRow | null>(null)
  const [ecType, setEcType] = useState('배송비')
  const [ecAmount, setEcAmount] = useState('')
  const [ecCurrency, setEcCurrency] = useState('KRW')
  const [ecCurrencyCustom, setEcCurrencyCustom] = useState('')
  const [ecFxRate, setEcFxRate] = useState('1')
  const [ecMemo, setEcMemo] = useState('')
  const [ecVendorName, setEcVendorName] = useState('')
  const [ecDate, setEcDate] = useState('')
  const [costEditDirty, setCostEditDirty] = useState(false)

  const [itemDetailOpen, setItemDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<PurchaseItemRow | null>(null)
  const [detailAlloc, setDetailAlloc] = useState<ItemAllocationView[]>([])

  const [fSupplier, setFSupplier] = useState('')
  const [fPurchaseDate, setFPurchaseDate] = useState('')
  const [fPaymentMet, setFPaymentMet] = useState('카드')
  const [fCardName, setFCardName] = useState('')
  const [fCurrency, setFCurrency] = useState('USD')
  const [fCurrencyCustom, setFCurrencyCustom] = useState('')
  const [fTotalForeign, setFTotalForeign] = useState('')
  const [fTotalKRW, setFTotalKRW] = useState('')
  const [fMemo, setFMemo] = useState('')
  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    { key: crypto.randomUUID(), item_name: '', qty: '1', foreign_total: '', memo: '', is_preorder: false },
  ])

  const [cType, setCType] = useState('배송비')
  const [cAmount, setCAmount] = useState('')
  const [cCurrency, setCCurrency] = useState('KRW')
  const [cCurrencyCustom, setCCurrencyCustom] = useState('')
  const [cFxRate, setCFxRate] = useState('1')
  const [cMemo, setCMemo] = useState('')
  const [cVendorName, setCVendorName] = useState('')
  const [cDate, setCDate] = useState('')

  const purchaseMap = useMemo(() => {
    const map = new Map<string, PurchaseRow>()
    for (const p of purchases) map.set(p.id, p)
    return map
  }, [purchases])

  const itemMap = useMemo(() => {
    const map = new Map<string, PurchaseItemRow>()
    for (const it of items) map.set(it.id, it)
    return map
  }, [items])

  const selectedPurchase = useMemo(
    () => purchases.find((p) => p.id === selectedPurchaseId) ?? null,
    [purchases, selectedPurchaseId]
  )

  const itemsByPurchase = useMemo(() => {
    const map = new Map<string, PurchaseItemRow[]>()
    for (const it of items) {
      if (!map.has(it.purchase_id)) map.set(it.purchase_id, [])
      map.get(it.purchase_id)!.push(it)
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      map.set(k, arr)
    }
    return map
  }, [items])

  const selectedPurchaseItems = useMemo(() => {
    if (!selectedPurchaseId) return []
    return itemsByPurchase.get(selectedPurchaseId) ?? []
  }, [itemsByPurchase, selectedPurchaseId])

  const selectedPurchaseItemIds = useMemo(
    () => new Set(selectedPurchaseItems.map((it) => it.id)),
    [selectedPurchaseItems]
  )

  const visibleItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return selectedPurchaseItems

    return items.filter((it) => {
      const p = purchaseMap.get(it.purchase_id)
      const name = (it.item_name ?? '').toLowerCase()
      const memo = (it.memo ?? '').toLowerCase()
      const supplier = (p?.supplier ?? '').toLowerCase()
      const purchaseMemo = (p?.memo ?? '').toLowerCase()

      return (
        name.includes(q) ||
        memo.includes(q) ||
        supplier.includes(q) ||
        purchaseMemo.includes(q)
      )
    })
  }, [itemSearch, selectedPurchaseItems, items, purchaseMap])

  const selectedItems = useMemo(() => {
    const set = new Set(selectedItemIds)
    return items.filter((it) => set.has(it.id))
  }, [items, selectedItemIds])

  const selectedItemsLineTotalSum = useMemo(() => {
    return selectedItems.reduce((acc, it) => acc + n(it.line_total), 0)
  }, [selectedItems])

  const allocationSumByItem = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of allocations) {
      map.set(a.purchase_item_id, (map.get(a.purchase_item_id) ?? 0) + n(a.allocated_amount))
    }
    return map
  }, [allocations])

  const selectedPurchaseRelatedCosts = useMemo(() => {
    if (!selectedPurchaseId) return costs

    const relatedCostIds = new Set<string>()

    for (const c of costs) {
      if (c.purchase_id === selectedPurchaseId) relatedCostIds.add(c.id)
    }

    for (const a of allocations) {
      if (selectedPurchaseItemIds.has(a.purchase_item_id)) {
        relatedCostIds.add(a.purchase_cost_id)
      }
    }

    return costs.filter((c) => relatedCostIds.has(c.id))
  }, [costs, allocations, selectedPurchaseId, selectedPurchaseItemIds])

  const costTypeMap = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const c of costs) map.set(c.id, c.cost_type ?? null)
    return map
  }, [costs])

  const hasBalanceByItem = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const a of allocations) {
      const type = costTypeMap.get(a.purchase_cost_id)
      if (type === '잔금') map.set(a.purchase_item_id, true)
    }
    return map
  }, [allocations, costTypeMap])

  const itemPhotoMap = useMemo(() => {
    const map = new Map<string, string>()
    const imageFiles = files.filter(
      (f) => f.file_type === '상품사진' && f.item_id && f.file_path
    )

    for (const f of imageFiles) {
      if (!f.item_id || !f.file_path) continue
      if (map.has(f.item_id)) continue
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(f.file_path)
      map.set(f.item_id, data.publicUrl)
    }
    return map
  }, [files])

  const purchaseCardCounts = useMemo(() => {
    const map = new Map<string, { itemKinds: number; hasPreorder: boolean }>()

    for (const p of purchases) {
      const its = itemsByPurchase.get(p.id) ?? []
      map.set(p.id, {
        itemKinds: its.length,
        hasPreorder: its.some((x) => !!x.is_preorder && !hasBalanceByItem.get(x.id)),
      })
    }

    return map
  }, [purchases, itemsByPurchase, hasBalanceByItem])

  const supplierVendorOptions = useMemo(() => {
    return vendors.filter((v) => !!v.is_product_supplier)
  }, [vendors])

  const costVendorOptions = useMemo(() => {
    if (cType === '배송비' || cType === '관부과세') {
      return vendors.filter((v) => !!v.is_forwarder || !!v.is_carry_in)
    }
    if (cType === '잔금') {
      return vendors.filter((v) => !!v.is_product_supplier)
    }
    return vendors
  }, [vendors, cType])

  const editCostVendorOptions = useMemo(() => {
    if (ecType === '배송비' || ecType === '관부과세') {
      return vendors.filter((v) => !!v.is_forwarder || !!v.is_carry_in)
    }
    if (ecType === '잔금') {
      return vendors.filter((v) => !!v.is_product_supplier)
    }
    return vendors
  }, [vendors, ecType])

  async function refreshAll() {
    setLoading(true)
    setErr(null)
    setMsg(null)

    try {
      const [pRes, iRes, cRes, aRes, vRes, fRes] = await Promise.all([
        supabase
          .from('purchase')
          .select('id,created_at,supplier,purchase_date,payment_met,card_name,currency,fx_rate,total_foreign,total_amount,memo')
          .order('created_at', { ascending: false }),

        supabase
          .from('purchase_items')
          .select('id,created_at,purchase_id,item_name,qty,foreign_total,foreign_unit_price,unit_price,line_total,memo,is_preorder')
          .order('created_at', { ascending: false }),

        supabase
          .from('purchase_costs')
          .select('id,created_at,purchase_id,cost_type,amount,currency,fx_rate,memo,vendor_name,cost_date')
          .order('created_at', { ascending: false })
          .limit(100),

        supabase
          .from('cost_allocations')
          .select('purchase_cost_id,purchase_item_id,allocated_amount'),

        supabase
          .from('vendors')
          .select('id,created_at,name,is_product_supplier,is_forwarder,is_carry_in,is_active')
          .order('name', { ascending: true }),

        supabase
          .from('purchase_files')
          .select('id,item_id,file_type,file_path,created_at')
          .order('created_at', { ascending: false }),
      ])

      if (pRes.error) throw pRes.error
      if (iRes.error) throw iRes.error
      if (cRes.error) throw cRes.error
      if (aRes.error) throw aRes.error
      if (vRes.error) throw vRes.error
      if (fRes.error) throw fRes.error

      const p = (pRes.data ?? []) as PurchaseRow[]
      const it = (iRes.data ?? []) as PurchaseItemRow[]
      const cs = (cRes.data ?? []) as PurchaseCostRow[]
      const as = (aRes.data ?? []) as CostAllocationRow[]
      const vs = (vRes.data ?? []) as VendorRow[]
      const fs = (fRes.data ?? []) as FileRow[]

      const sortedPurchases = [...p].sort((a, b) => {
        if (a.purchase_date && b.purchase_date) {
          return a.purchase_date < b.purchase_date ? 1 : -1
        }
        if (a.purchase_date && !b.purchase_date) return -1
        if (!a.purchase_date && b.purchase_date) return 1
        return a.created_at < b.created_at ? 1 : -1
      })

      setPurchases(sortedPurchases)
      setItems(it)
      setCosts(cs)
      setAllocations(as)
      setVendors(vs.filter((x) => x.is_active !== false))
      setFiles(fs)

      if (!selectedPurchaseId && sortedPurchases.length > 0) {
        setSelectedPurchaseId(sortedPurchases[0].id)
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  function toggleSelectedItem(id: string) {
    setSelectedItemIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function clearSelection() {
    setSelectedItemIds([])
  }

  function resetBuyForm() {
    setBuyMode('create')
    setEditingPurchaseId(null)
    setFSupplier('')
    setFPurchaseDate('')
    setFPaymentMet('카드')
    setFCardName('')
    setFCurrency('USD')
    setFCurrencyCustom('')
    setFTotalForeign('')
    setFTotalKRW('')
    setFMemo('')
    setDraftItems([
      {
        key: crypto.randomUUID(),
        item_name: '',
        qty: '1',
        foreign_total: '',
        memo: '',
        is_preorder: false,
      },
    ])
    setBuyDirty(false)
  }

  function openCreatePurchaseModal() {
    resetBuyForm()
    setBuyMode('create')
    setBuyModalOpen(true)
  }

  function openPurchaseEditModal(p: PurchaseRow) {
    const purchaseItems = itemsByPurchase.get(p.id) ?? []

    setBuyMode('edit')
    setEditingPurchaseId(p.id)

    setFSupplier(p.supplier ?? '')
    setFPurchaseDate(p.purchase_date ?? '')
    setFPaymentMet(p.payment_met ?? '카드')
    setFCardName(p.card_name ?? '')
    setFCurrency(normalizeCurrencySelectValue(p.currency))
    setFCurrencyCustom(
      normalizeCurrencySelectValue(p.currency) === '직접입력' ? (p.currency ?? '') : ''
    )
    setFTotalForeign(String(p.total_foreign ?? ''))
    setFTotalKRW(String(p.total_amount ?? ''))
    setFMemo(p.memo ?? '')

    setDraftItems(
      purchaseItems.length > 0
        ? purchaseItems.map((it) => ({
            id: it.id,
            key: it.id,
            item_name: it.item_name ?? '',
            qty: String(it.qty ?? 1),
            foreign_total: String(it.foreign_total ?? ''),
            memo: it.memo ?? '',
            is_preorder: !!it.is_preorder,
          }))
        : [
            {
              key: crypto.randomUUID(),
              item_name: '',
              qty: '1',
              foreign_total: '',
              memo: '',
              is_preorder: false,
            },
          ]
    )

    setBuyDirty(false)
    setBuyModalOpen(true)
  }

  function requestCloseBuyModal() {
    if (buyDirty) {
      const ok = window.confirm('작성 중인 내용이 있어요.\n저장하지 않고 닫을까요?')
      if (!ok) return
    }
    setBuyModalOpen(false)
    setBuyDirty(false)
  }

  function requestCloseCostModal() {
    if (costDirty) {
      const ok = window.confirm('작성 중인 내용이 있어요.\n저장하지 않고 닫을까요?')
      if (!ok) return
    }
    setCostModalOpen(false)
    setCostDirty(false)
  }

  function requestCloseCostEditModal() {
    if (costEditDirty) {
      const ok = window.confirm('작성 중인 내용이 있어요.\n저장하지 않고 닫을까요?')
      if (!ok) return
    }
    setCostEditModalOpen(false)
    setCostEditDirty(false)
  }

  async function savePurchaseWithItems() {
    setErr(null)
    setMsg(null)

    const totalKRW = n(fTotalKRW)
    const totalForeign = n(fTotalForeign)
    const cur = currencyValue(fCurrency, fCurrencyCustom)
    const fx = calcFxRate(totalKRW, totalForeign)

    const cleaned = draftItems
      .map((d) => ({
        ...d,
        item_name: d.item_name.trim(),
        qty: d.qty.trim(),
        foreign_total: d.foreign_total.trim(),
        memo: d.memo.trim(),
      }))
      .filter((d) => d.item_name.length > 0)

    if (cleaned.length === 0) {
      setErr('상품을 1개 이상 입력해야 해.')
      return
    }
    if (!cur) {
      setErr('통화를 선택하거나 직접 입력해줘.')
      return
    }
    if (totalKRW <= 0 || totalForeign <= 0 || fx <= 0) {
      setErr('원화총액/외화총액을 둘 다 입력해야 환율을 자동 계산할 수 있어.')
      return
    }

    setLoading(true)
    try {
      if (buyMode === 'edit' && editingPurchaseId) {
        const updP = await supabase
          .from('purchase')
          .update({
            supplier: fSupplier || null,
            purchase_date: fPurchaseDate || null,
            payment_met: fPaymentMet || null,
            card_name: fCardName || null,
            currency: cur,
            fx_rate: fx,
            total_foreign: totalForeign,
            total_amount: totalKRW,
            memo: fMemo || null,
          })
          .eq('id', editingPurchaseId)

        if (updP.error) throw updP.error

        const prevItems = itemsByPurchase.get(editingPurchaseId) ?? []
        const prevIds = new Set(prevItems.map((x) => x.id))
        const nextIds = new Set(cleaned.filter((x) => x.id).map((x) => x.id as string))

        const deleteIds = [...prevIds].filter((id) => !nextIds.has(id))
        if (deleteIds.length > 0) {
          const delRes = await supabase.from('purchase_items').delete().in('id', deleteIds)
          if (delRes.error) throw delRes.error
        }

        for (const d of cleaned) {
          const q = Math.max(1, n(d.qty))
          const ft = Math.max(0, n(d.foreign_total))
          const foreignUnit = q > 0 ? ft / q : 0
          const lineKRW = ft * fx
          const unitKRW = q > 0 ? lineKRW / q : 0

          const payload = {
            purchase_id: editingPurchaseId,
            item_name: d.item_name,
            qty: q,
            foreign_total: ft,
            foreign_unit_price: foreignUnit,
            unit_price: unitKRW,
            line_total: lineKRW,
            memo: d.memo || null,
            is_preorder: d.is_preorder,
          }

          if (d.id) {
            const updI = await supabase.from('purchase_items').update(payload).eq('id', d.id)
            if (updI.error) throw updI.error
          } else {
            const insI = await supabase.from('purchase_items').insert(payload)
            if (insI.error) throw insI.error
          }
        }

        setMsg('매입 수정 완료')
      } else {
        const insP = await supabase
          .from('purchase')
          .insert({
            supplier: fSupplier || null,
            purchase_date: fPurchaseDate || null,
            payment_met: fPaymentMet || null,
            card_name: fCardName || null,
            currency: cur,
            fx_rate: fx,
            total_foreign: totalForeign,
            total_amount: totalKRW,
            memo: fMemo || null,
          })
          .select('id')
          .single()

        if (insP.error) throw insP.error

        const purchaseId = insP.data.id as string

        const rows = cleaned.map((d) => {
          const q = Math.max(1, n(d.qty))
          const ft = Math.max(0, n(d.foreign_total))
          const foreignUnit = q > 0 ? ft / q : 0
          const lineKRW = ft * fx
          const unitKRW = q > 0 ? lineKRW / q : 0

          return {
            purchase_id: purchaseId,
            item_name: d.item_name,
            qty: q,
            foreign_total: ft,
            foreign_unit_price: foreignUnit,
            unit_price: unitKRW,
            line_total: lineKRW,
            memo: d.memo || null,
            is_preorder: d.is_preorder,
          }
        })

        const insI = await supabase.from('purchase_items').insert(rows)
        if (insI.error) throw insI.error

        setMsg(`매입 저장 완료 (환율 자동 계산: ${fx.toFixed(4)})`)
        setSelectedPurchaseId(purchaseId)
      }

      setBuyModalOpen(false)
      resetBuyForm()
      await refreshAll()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  async function deletePurchase(purchaseId: string) {
    if (!confirm('이 매입을 삭제할까? (연결된 상품/추가비용/배분도 같이 삭제될 수 있어)')) return

    setLoading(true)
    setErr(null)
    setMsg(null)
    try {
      const del = await supabase.from('purchase').delete().eq('id', purchaseId)
      if (del.error) throw del.error

      setSelectedItemIds((prev) => prev.filter((id) => items.find((x) => x.id === id)?.purchase_id !== purchaseId))
      if (selectedPurchaseId === purchaseId) setSelectedPurchaseId(null)

      setMsg('매입 삭제 완료')
      await refreshAll()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  async function deleteCost(costId: string) {
    if (!confirm('이 추가비용을 삭제할까?')) return

    setLoading(true)
    setErr(null)
    setMsg(null)
    try {
      const del = await supabase.from('purchase_costs').delete().eq('id', costId)
      if (del.error) throw del.error

      setMsg('추가비용 삭제 완료')
      await refreshAll()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  function openCostEditModal(cost: PurchaseCostRow) {
    setEditingCost(cost)
    setEcType(cost.cost_type ?? '배송비')
    setEcAmount(String(cost.amount ?? ''))
    setEcCurrency(normalizeCurrencySelectValue(cost.currency || 'KRW'))
    setEcCurrencyCustom(
      normalizeCurrencySelectValue(cost.currency) === '직접입력' ? (cost.currency ?? '') : ''
    )
    setEcFxRate(String(cost.fx_rate ?? 1))
    setEcMemo(cost.memo ?? '')
    setEcVendorName(cost.vendor_name ?? '')
    setEcDate(cost.cost_date ?? '')
    setCostEditDirty(false)
    setCostEditModalOpen(true)
  }

  async function saveCostEdit() {
    if (!editingCost) return

    const cur = currencyValue(ecCurrency, ecCurrencyCustom)
    const amount = n(ecAmount)
    const fx = n(ecFxRate)

    if (!ecType.trim()) {
      setErr('추가비용 종류를 선택해줘.')
      return
    }
    if (!cur) {
      setErr('통화를 선택하거나 직접 입력해줘.')
      return
    }
    if (amount <= 0) {
      setErr('금액을 입력해줘.')
      return
    }
    if (normalizeCurrencyCode(cur) !== 'KRW' && fx <= 0) {
      setErr('외화면 환율이 필요해.')
      return
    }
    if (!ecDate || ecDate.length !== 10) {
      setErr('날짜를 YYYY-MM-DD 형식으로 입력해줘.')
      return
    }

    try {
      setLoading(true)
      setErr(null)
      setMsg(null)

      const upd = await supabase
        .from('purchase_costs')
        .update({
          cost_type: ecType,
          amount,
          currency: cur,
          fx_rate: normalizeCurrencyCode(cur) === 'KRW' ? 1 : fx,
          memo: ecMemo || null,
          vendor_name: ecVendorName || null,
          cost_date: ecDate,
        })
        .eq('id', editingCost.id)

      if (upd.error) throw upd.error

      setMsg('추가비용 수정 완료')
      setCostEditModalOpen(false)
      setEditingCost(null)
      setCostEditDirty(false)
      await refreshAll()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  async function openItemDetail(it: PurchaseItemRow) {
    setDetailItem(it)
    setDetailAlloc([])
    setItemDetailOpen(true)
    setErr(null)

    try {
      const allocRes = await supabase
        .from('cost_allocations')
        .select('purchase_cost_id,purchase_item_id,allocated_amount')
        .eq('purchase_item_id', it.id)

      if (allocRes.error) throw allocRes.error

      const myAllocRows = (allocRes.data ?? []) as CostAllocationRow[]
      if (myAllocRows.length === 0) {
        setDetailAlloc([])
        return
      }

      const costIds = Array.from(new Set(myAllocRows.map((a) => a.purchase_cost_id)))

      const allCostAllocRes = await supabase
        .from('cost_allocations')
        .select('purchase_cost_id,purchase_item_id,allocated_amount')
        .in('purchase_cost_id', costIds)

      if (allCostAllocRes.error) throw allCostAllocRes.error

      const costRes = await supabase
        .from('purchase_costs')
        .select('id,created_at,cost_type,amount,currency,fx_rate,memo,vendor_name,cost_date')
        .in('id', costIds)

      if (costRes.error) throw costRes.error

      const allAlloc = (allCostAllocRes.data ?? []) as CostAllocationRow[]
      const costMap = new Map<string, PurchaseCostRow>()
      for (const c of (costRes.data ?? []) as PurchaseCostRow[]) costMap.set(c.id, c)

      const view: ItemAllocationView[] = myAllocRows
        .map((a) => {
          const c = costMap.get(a.purchase_cost_id)
          const related = allAlloc
            .filter((x) => x.purchase_cost_id === a.purchase_cost_id && x.purchase_item_id !== it.id)
            .map((x) => itemMap.get(x.purchase_item_id)?.item_name ?? '(이름 없음)')

          return {
            cost_type: c?.cost_type ?? null,
            amount_krw: n(a.allocated_amount),
            created_at: c?.created_at ?? '',
            memo: c?.memo ?? null,
            vendor_name: c?.vendor_name ?? null,
            related_item_names: related,
            cost_date: c?.cost_date ?? null,
          }
        })
        .sort((x, y) => (x.created_at < y.created_at ? 1 : -1))

      setDetailAlloc(view)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    }
  }

  async function saveCostAndAllocate() {
    setErr(null)
    setMsg(null)

    const cur = currencyValue(cCurrency, cCurrencyCustom)
    const amount = n(cAmount)
    const fx = n(cFxRate)
    const costKRW = toKRW(amount, cur, fx)

    if (!cType.trim()) {
      setErr('추가비용 종류를 선택해줘.')
      return
    }
    if (!cur) {
      setErr('통화를 선택하거나 직접 입력해줘.')
      return
    }
    if (amount <= 0) {
      setErr('금액을 입력해줘.')
      return
    }
    if (normalizeCurrencyCode(cur) !== 'KRW' && fx <= 0) {
      setErr('외화면 환율이 필요해.')
      return
    }
    if (!cDate || cDate.length !== 10) {
      setErr('날짜를 YYYY-MM-DD 형식으로 입력해줘.')
      return
    }
    if (selectedItemIds.length === 0) {
      setErr('자동분배하려면 상품을 1개 이상 체크해야 해.')
      return
    }
    if (costKRW <= 0) {
      setErr('원화 환산 금액이 0이야.')
      return
    }

    const chosen = selectedItems
    const baseSum = chosen.reduce((acc, it) => acc + n(it.line_total), 0)

    if (baseSum <= 0) {
      setErr('선택된 상품의 원화합계가 0이야.')
      return
    }

    setLoading(true)
    try {
      const linkedPurchaseIds = Array.from(new Set(chosen.map((it) => it.purchase_id)))
      const linkedPurchaseId = linkedPurchaseIds.length === 1 ? linkedPurchaseIds[0] : null

      const insCost = await supabase
        .from('purchase_costs')
        .insert({
          purchase_id: linkedPurchaseId,
          cost_type: cType,
          amount,
          currency: cur,
          fx_rate: normalizeCurrencyCode(cur) === 'KRW' ? 1 : fx,
          memo: cMemo || null,
          vendor_name: cVendorName || null,
          cost_date: cDate,
        })
        .select('id')
        .single()

      if (insCost.error) throw insCost.error
      const costId = insCost.data.id as string

      const sorted = [...chosen].sort((a, b) => n(b.line_total) - n(a.line_total))
      const maxItem = sorted[0]

      const raw = sorted.map((it) => ({
        item_id: it.id,
        raw: (n(it.line_total) / baseSum) * costKRW,
      }))

      const alloc = raw.map((r) => ({ item_id: r.item_id, amt: ceilInt(r.raw) }))
      const allocSum = alloc.reduce((acc, a) => acc + a.amt, 0)
      const diff = allocSum - Math.round(costKRW)

      if (maxItem) {
        const idx = alloc.findIndex((a) => a.item_id === maxItem.id)
        if (idx >= 0) {
          alloc[idx].amt = Math.max(0, alloc[idx].amt - diff)
        }
      }

      const insAlloc = await supabase.from('cost_allocations').insert(
        alloc.map((a) => ({
          purchase_cost_id: costId,
          purchase_item_id: a.item_id,
          allocated_amount: a.amt,
        }))
      )

      if (insAlloc.error) throw insAlloc.error

      setMsg(`추가비용 저장 완료 (${fmtKRW(Math.round(costKRW))})`)
      setCostModalOpen(false)
      setCostDirty(false)
      setCType('배송비')
      setCAmount('')
      setCCurrency('KRW')
      setCCurrencyCustom('')
      setCFxRate('1')
      setCMemo('')
      setCVendorName('')
      setCDate('')
      await refreshAll()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  const styles = {
    page: {
      minHeight: '100vh',
      background: '#f7f7fb',
      color: '#111',
      padding: 20,
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
    } as React.CSSProperties,
    topbar: {
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      marginBottom: 14,
      flexWrap: 'wrap',
    } as React.CSSProperties,
    title: { fontSize: 24, fontWeight: 900, marginRight: 10, color: '#312e81' } as React.CSSProperties,
    btn: (kind: 'primary' | 'ghost' | 'danger' = 'ghost') =>
      ({
        border: '1px solid',
        borderColor: kind === 'primary' ? '#6d28d9' : kind === 'danger' ? '#ef4444' : '#ddd',
        background: kind === 'primary' ? '#6d28d9' : '#fff',
        color: kind === 'primary' ? '#fff' : kind === 'danger' ? '#dc2626' : '#111',
        padding: kind === 'danger' ? '7px 10px' : '10px 12px',
        borderRadius: 12,
        cursor: 'pointer',
        fontWeight: 800,
        fontSize: kind === 'danger' ? 12 : 14,
        whiteSpace: 'nowrap',
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
    layout: {
      display: 'grid',
      gridTemplateColumns: '700px minmax(0, 1fr)',
      gap: 16,
      alignItems: 'start',
    } as React.CSSProperties,
    card: {
      background: '#fff',
      border: '1px solid #e6e6ef',
      borderRadius: 18,
      padding: 14,
      boxShadow: '0 8px 24px rgba(124, 58, 237, 0.05)',
    } as React.CSSProperties,
    purchaseCard: (active: boolean) =>
      ({
        background: active ? '#f3e8ff' : '#fff',
        border: active ? '2px solid #7c3aed' : '1px solid #e6e6ef',
        borderRadius: 16,
        padding: 14,
        cursor: 'pointer',
        maxWidth: '100%',
        overflow: 'hidden'
      }) as React.CSSProperties,
    badge: (color: 'purple' | 'orange' | 'green' | 'gray' = 'gray') =>
      ({
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background:
          color === 'purple'
            ? '#ede9fe'
            : color === 'orange'
            ? '#ffedd5'
            : color === 'green'
            ? '#dcfce7'
            : '#f3f4f6',
        color:
          color === 'purple'
            ? '#5b21b6'
            : color === 'orange'
            ? '#9a3412'
            : color === 'green'
            ? '#166534'
            : '#374151',
      }) as React.CSSProperties,
    small: { fontSize: 12, color: '#4b5563' } as React.CSSProperties,
    h2: { fontSize: 16, fontWeight: 900, marginBottom: 10 } as React.CSSProperties,
    table: {
      width: '100%',
      borderCollapse: 'separate',
      borderSpacing: 0,
      overflow: 'hidden',
      borderRadius: 14,
      border: '1px solid #e6e6ef',
      background: '#fff',
    } as React.CSSProperties,
    th: {
      textAlign: 'left',
      fontSize: 12,
      color: '#374151',
      padding: '10px 12px',
      borderBottom: '1px solid #e6e6ef',
      background: '#fafafa',
      fontWeight: 900,
      whiteSpace: 'nowrap',
    } as React.CSSProperties,
    td: {
      padding: '10px 12px',
      borderBottom: '1px solid #f0f0f5',
      fontSize: 14,
      verticalAlign: 'top',
    } as React.CSSProperties,
    grid2: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      alignItems: 'start',
    } as React.CSSProperties,
    field: { display: 'grid', gap: 6 } as React.CSSProperties,
    label: { fontSize: 12, color: '#374151', fontWeight: 800 } as React.CSSProperties,
    input: {
      border: '1px solid #d9d9e6',
      borderRadius: 12,
      padding: '10px 12px',
      outline: 'none',
      fontSize: 14,
      background: '#fff',
      width: '100%',
      color: '#111',
      boxSizing: 'border-box',
    } as React.CSSProperties,
    select: {
      border: '1px solid #d9d9e6',
      borderRadius: 12,
      padding: '10px 12px',
      outline: 'none',
      fontSize: 14,
      background: '#fff',
      width: '100%',
      color: '#111',
      boxSizing: 'border-box',
    } as React.CSSProperties,
    textarea: {
      border: '1px solid #d9d9e6',
      borderRadius: 12,
      padding: '10px 12px',
      outline: 'none',
      fontSize: 14,
      minHeight: 80,
      resize: 'vertical',
      width: '100%',
      color: '#111',
      boxSizing: 'border-box',
    } as React.CSSProperties,
    hr: { border: 'none', borderTop: '1px solid #eee', margin: '14px 0' } as React.CSSProperties,
  }

  return (
    <div style={styles.page}>
      <PageBackButton />

      <div style={styles.topbar}>
        <div style={styles.title}>매입관리</div>

        <button style={styles.btn('primary')} onClick={openCreatePurchaseModal}>
          + 매입 등록(안에 상품까지)
        </button>

        <button style={styles.btn('primary')} onClick={() => setCostModalOpen(true)}>
          + 추가비용(자동분배)
        </button>

        <button style={styles.btn('ghost')} onClick={refreshAll} disabled={loading}>
          새로고침
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={styles.small}>
            선택된 상품: <b>{selectedItemIds.length}개</b> / 선택 합계(상품 원화합계): <b>{fmtKRW(selectedItemsLineTotalSum)}</b>
          </span>
          <button style={styles.btn('ghost')} onClick={clearSelection}>
            선택 해제
          </button>
        </div>
      </div>

      {msg && (
        <div
          style={{
            ...styles.card,
            borderColor: '#bbf7d0',
            background: '#ecfdf5',
            color: '#065f46',
            fontWeight: 800,
            marginBottom: 12,
          }}
        >
          ✅ {msg}
        </div>
      )}

      {err && (
        <div
          style={{
            ...styles.card,
            borderColor: '#fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            fontWeight: 800,
            marginBottom: 12,
          }}
        >
          ❌ {err}
        </div>
      )}

      <div style={styles.layout}>
        <div
          style={{
            ...styles.card,
            position: 'sticky',
            top: 16,
            maxHeight: 'calc(100vh - 40px)',
            overflowY: 'auto',
            overflowX: 'auto',
            minWidth: 0,
          }}
        >
          <div style={styles.h2}>매입목록</div>

          <div style={{ minWidth: 580, display: 'grid', gap: 10 }}>
            {purchases.length === 0 && <div style={styles.small}>아직 매입이 없어.</div>}

            {purchases.map((p) => {
              const active = p.id === selectedPurchaseId
              const cnt = purchaseCardCounts.get(p.id)

              return (
                <div key={p.id} style={styles.purchaseCard(active)} onClick={() => setSelectedPurchaseId(p.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>
                        {p.supplier?.trim() ? p.supplier : '(거래처 없음)'}{' '}
                        {cnt?.hasPreorder ? <span style={styles.badge('orange')}>예약 포함</span> : null}
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          color: '#6b7280',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        결제일 {fmtDate(p.purchase_date)} /
                        결제수단 {p.payment_met || '미입력'} /
                        카드 {p.card_name || '미입력'} /
                        상품수 {cnt?.itemKinds ?? 0}개 /
                        총원화 {fmtKRW(Number(p.total_amount || 0))}
                      </div>

                      {p.memo ? <div style={{ ...styles.small, marginTop: 4 }}>{p.memo}</div> : null}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button
                        style={styles.smallBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          openPurchaseEditModal(p)
                        }}
                      >
                        수정
                      </button>
                      <button
                        style={styles.dangerSmallBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          deletePurchase(p.id)
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <div style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <div style={styles.h2}>상품목록</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  style={{ ...styles.input, width: 260 }}
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="전체 상품 검색 (상품명/메모/거래처)"
                />
                <div style={styles.small}>
                  {itemSearch.trim()
                    ? <>전체 상품 검색 결과: <b>{visibleItems.length}개</b></>
                    : selectedPurchase
                    ? <>현재 매입: <b>{selectedPurchase.supplier?.trim() ? selectedPurchase.supplier : '(거래처 없음)'}</b> / 상품 <b>{selectedPurchaseItems.length}개</b></>
                    : '왼쪽에서 매입을 선택해줘.'}
                </div>
              </div>
            </div>

            <div style={{ ...styles.small, marginBottom: 10 }}>
              ✅ 체크는 매입을 바꿔도 유지돼. 검색해도 체크 유지됨.
            </div>

            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: 44 }}>선택</th>
                  <th style={styles.th}>상품</th>
                  <th style={{ ...styles.th, width: 70 }}>수량</th>
                  <th style={{ ...styles.th, width: 110 }}>결제일</th>
                  <th style={{ ...styles.th, width: 130 }}>원화합계</th>
                  <th style={{ ...styles.th, width: 100 }}>배분</th>
                  <th style={{ ...styles.th, width: 120 }}>최종단가</th>
                  <th style={{ ...styles.th, width: 100 }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.length === 0 ? (
                  <tr>
                    <td style={styles.td} colSpan={8}>
                      <span style={styles.small}>조건에 맞는 상품이 없어.</span>
                    </td>
                  </tr>
                ) : (
                  visibleItems.map((it) => {
                    const checked = selectedItemIds.includes(it.id)
                    const lineTotal = n(it.line_total)
                    const allocSum = allocationSumByItem.get(it.id) ?? 0
                    const finalUnit = ceilInt((lineTotal + allocSum) / Math.max(1, n(it.qty)))
                    const parentPurchase = purchaseMap.get(it.purchase_id)
                    const currency = currencyLabel(parentPurchase?.currency)

                    return (
                      <tr key={it.id}>
                        <td style={styles.td}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelectedItem(it.id)}
                            style={{ width: 18, height: 18 }}
                          />
                        </td>

                        <td style={styles.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 220 }}>
                            {itemPhotoMap.get(it.id) ? (
                              <img
                                src={itemPhotoMap.get(it.id)}
                                alt={it.item_name ?? '상품'}
                                style={{
                                  width: 58,
                                  height: 58,
                                  objectFit: 'cover',
                                  borderRadius: 12,
                                  border: '1px solid #ddd',
                                  background: '#f3f4f6',
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 58,
                                  height: 58,
                                  borderRadius: 12,
                                  border: '1px solid #ddd',
                                  background: '#f3f4f6',
                                  color: '#888',
                                  fontSize: 11,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                없음
                              </div>
                            )}

                            <div>
                              <div style={{ fontWeight: 900 }}>
                                {it.item_name ?? '(이름 없음)'}{' '}
                                {it.is_preorder && !hasBalanceByItem.get(it.id) ? (
                                  <span style={styles.badge('orange')}>예약</span>
                                ) : null}
                              </div>
                              <div style={styles.small}>거래처: {parentPurchase?.supplier ?? '(거래처 없음)'}</div>
                            </div>
                          </div>
                        </td>

                        <td style={styles.td}>{fmtNum(n(it.qty))}</td>
                        <td style={styles.td}>{fmtDate(parentPurchase?.purchase_date)}</td>

                        <td style={styles.td}>
                          <div style={{ fontWeight: 900 }}>{fmtKRW(lineTotal)}</div>
                          <div style={styles.small}>
                            외화총액: {fmtNum(n(it.foreign_total))} {currency}
                          </div>
                        </td>

                        <td style={styles.td}>
                          <div style={{ fontWeight: 900 }}>{fmtKRW(allocSum)}</div>
                        </td>

                        <td style={styles.td}>
                          <div style={{ fontWeight: 900 }}>{fmtKRW(finalUnit)}</div>
                          <div style={styles.small}>(배분 포함)</div>
                        </td>

                        <td style={styles.td}>
                          <button style={styles.smallBtn} onClick={() => openItemDetail(it)}>
                            상세
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button style={styles.btn('primary')} onClick={() => setCostModalOpen(true)}>
                선택 상품에 추가비용 자동분배 →
              </button>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.h2}>{selectedPurchase ? '선택 매입 관련 추가비용' : '추가비용'}</div>

            <div style={{ display: 'grid', gap: 10 }}>
              {selectedPurchaseRelatedCosts.length === 0 && <div style={styles.small}>추가비용이 없어.</div>}

              {selectedPurchaseRelatedCosts.map((cost) => {
                const krw =
                  normalizeCurrencyCode(cost.currency) === 'KRW'
                    ? n(cost.amount)
                    : n(cost.amount) * n(cost.fx_rate)

                const allocItemCount = allocations.filter((a) => a.purchase_cost_id === cost.id).length

                return (
                  <div key={cost.id} style={{ ...styles.card, padding: 12, background: '#fcfcff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                      <div>
                        <div style={{ fontWeight: 900, marginBottom: 6 }}>
                          {cost.cost_type ?? '추가비용'}{' '}
                          {allocItemCount > 0 ? <span style={styles.badge('purple')}>배분 {allocItemCount}건</span> : null}
                        </div>
                        <div style={styles.small}>
                          날짜: <b>{fmtDate(cost.cost_date)}</b> / 금액: <b>{fmtNum(n(cost.amount))}</b> {currencyLabel(cost.currency)} / 환율: <b>{fmtNum(n(cost.fx_rate))}</b> / 환산: <b>{fmtKRW(krw)}</b>
                        </div>
                        {cost.vendor_name ? (
                          <div style={styles.small}>
                            거래처: <b>{cost.vendor_name}</b>
                          </div>
                        ) : null}
                        {cost.memo ? <div style={{ marginTop: 6 }}>{cost.memo}</div> : null}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button style={styles.smallBtn} onClick={() => openCostEditModal(cost)}>
                          수정
                        </button>
                        <button style={styles.dangerSmallBtn} onClick={() => deleteCost(cost.id)}>
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <SafeModal
        open={buyModalOpen}
        title={buyMode === 'edit' ? '매입 수정' : '매입 등록 (안에 상품까지)'}
        onClose={requestCloseBuyModal}
      >
        <div
          onInputCapture={() => setBuyDirty(true)}
          onChangeCapture={() => setBuyDirty(true)}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 14 }}>
            <button style={styles.btn('ghost')} onClick={requestCloseBuyModal}>
              닫기
            </button>
            <button style={styles.btn('primary')} onClick={savePurchaseWithItems} disabled={loading}>
              {buyMode === 'edit' ? '수정 저장' : '저장'}
            </button>
          </div>

          <div style={styles.grid2}>
            <div style={styles.field}>
              <div style={styles.label}>거래처(선택)</div>
              <input
                list="supplier-vendor-list"
                style={styles.input}
                value={fSupplier}
                onChange={(e) => setFSupplier(e.target.value)}
                placeholder="거래처관리에서 등록한 거래처 선택 또는 직접 입력"
              />
              <datalist id="supplier-vendor-list">
                {supplierVendorOptions.map((v) => (
                  <option key={v.id} value={v.name ?? ''} />
                ))}
              </datalist>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>결제일(선택)</div>
              <input
                style={styles.input}
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                value={fPurchaseDate}
                onChange={(e) => setFPurchaseDate(formatDateInput(e.target.value))}
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>결제수단(선택)</div>
              <select style={styles.select} value={fPaymentMet} onChange={(e) => setFPaymentMet(e.target.value)}>
                <option value="카드">카드</option>
                <option value="현금">현금</option>
                <option value="계좌이체">계좌이체</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>카드명(선택)</div>
              <input style={styles.input} value={fCardName} onChange={(e) => setFCardName(e.target.value)} placeholder="예: 신한/토스/트래블카드" />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>통화</div>
              <select style={styles.select} value={fCurrency} onChange={(e) => setFCurrency(e.target.value)}>
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {fCurrency === '직접입력' && (
                <input style={styles.input} value={fCurrencyCustom} onChange={(e) => setFCurrencyCustom(e.target.value)} placeholder="예: THB" />
              )}
            </div>

            <div style={styles.field}>
              <div style={styles.label}>외화 총액</div>
              <input style={styles.input} value={fTotalForeign} onChange={(e) => setFTotalForeign(e.target.value)} placeholder="숫자만" />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>원화 총액(실결제)</div>
              <input style={styles.input} value={fTotalKRW} onChange={(e) => setFTotalKRW(e.target.value)} placeholder="숫자만" />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>환율(자동 계산)</div>
              <input
                style={{ ...styles.input, background: '#f3f4f6' }}
                readOnly
                value={
                  calcFxRate(n(fTotalKRW), n(fTotalForeign)) > 0
                    ? calcFxRate(n(fTotalKRW), n(fTotalForeign)).toFixed(4)
                    : ''
                }
                placeholder="자동 계산"
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div style={styles.label}>메모</div>
              <textarea style={styles.textarea} value={fMemo} onChange={(e) => setFMemo(e.target.value)} />
            </div>
          </div>

          <div style={styles.hr} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 900 }}>상품 등록</div>
            <button
              style={styles.btn('ghost')}
              onClick={() =>
                setDraftItems((prev) => [
                  ...prev,
                  { key: crypto.randomUUID(), item_name: '', qty: '1', foreign_total: '', memo: '', is_preorder: false },
                ])
              }
            >
              + 상품 추가
            </button>
          </div>

          <div style={{ ...styles.small, marginTop: 6 }}>
            상품 외화 총액을 적으면 외화단가 / 원화단가 / 상품 원화합계가 자동 계산돼.
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {draftItems.map((d, idx) => {
              const fx = calcFxRate(n(fTotalKRW), n(fTotalForeign))
              const q = Math.max(1, n(d.qty))
              const ft = Math.max(0, n(d.foreign_total))
              const foreignUnit = q > 0 ? ft / q : 0
              const lineKRW = ft * fx
              const unitKRW = q > 0 ? lineKRW / q : 0
              const currency = currencyLabel(currencyValue(fCurrency, fCurrencyCustom))

              return (
                <div key={d.key} style={{ ...styles.card, background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>상품 {idx + 1}</div>
                    <button
                      style={styles.dangerSmallBtn}
                      onClick={() => setDraftItems((prev) => prev.filter((x) => x.key !== d.key))}
                    >
                      삭제
                    </button>
                  </div>

                  <div style={{ ...styles.grid2, marginTop: 10 }}>
                    <div style={styles.field}>
                      <div style={styles.label}>상품명</div>
                      <input
                        style={styles.input}
                        value={d.item_name}
                        onChange={(e) =>
                          setDraftItems((prev) => prev.map((x) => (x.key === d.key ? { ...x, item_name: e.target.value } : x)))
                        }
                        placeholder="예: 가챠A"
                      />
                    </div>

                    <div style={styles.field}>
                      <div style={styles.label}>수량</div>
                      <input
                        style={styles.input}
                        value={d.qty}
                        onChange={(e) =>
                          setDraftItems((prev) => prev.map((x) => (x.key === d.key ? { ...x, qty: e.target.value } : x)))
                        }
                      />
                    </div>

                    <div style={styles.field}>
                      <div style={styles.label}>상품 외화 총액</div>
                      <input
                        style={styles.input}
                        value={d.foreign_total}
                        onChange={(e) =>
                          setDraftItems((prev) => prev.map((x) => (x.key === d.key ? { ...x, foreign_total: e.target.value } : x)))
                        }
                        placeholder="예: 120"
                      />
                    </div>

                    <div style={styles.field}>
                      <div style={styles.label}>예약상품</div>
                      <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
                        <input
                          type="checkbox"
                          checked={d.is_preorder}
                          onChange={(e) =>
                            setDraftItems((prev) => prev.map((x) => (x.key === d.key ? { ...x, is_preorder: e.target.checked } : x)))
                          }
                        />
                        <span style={{ fontWeight: 800 }}>예약</span>
                      </label>
                    </div>

                    <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 6 }}>
                      <div style={styles.small}>
                        수량 <b>{q}</b> / 원화합계 <b>{lineKRW > 0 ? fmtKRW(lineKRW) : '0원'}</b> / 외화총액 <b>{fmtNum(ft)} {currency}</b> / 외화단가 <b>{foreignUnit > 0 ? `${foreignUnit.toFixed(4)} ${currency}` : `0 ${currency}`}</b>
                      </div>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={styles.label}>메모</div>
                      <input
                        style={styles.input}
                        value={d.memo}
                        onChange={(e) =>
                          setDraftItems((prev) => prev.map((x) => (x.key === d.key ? { ...x, memo: e.target.value } : x)))
                        }
                        placeholder="예: 옵션/색상"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </SafeModal>

      <SafeModal
        open={costModalOpen}
        title="추가비용 저장 + 선택 상품 자동분배"
        onClose={requestCloseCostModal}
      >
        <div
          onInputCapture={() => setCostDirty(true)}
          onChangeCapture={() => setCostDirty(true)}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 14 }}>
            <button style={styles.btn('ghost')} onClick={requestCloseCostModal}>
              닫기
            </button>
            <button style={styles.btn('primary')} onClick={saveCostAndAllocate} disabled={loading}>
              저장
            </button>
          </div>

          <div style={styles.grid2}>
            <div style={styles.field}>
              <div style={styles.label}>추가비용 종류</div>
              <select style={styles.select} value={cType} onChange={(e) => setCType(e.target.value)}>
                {COST_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>날짜</div>
              <input
                style={styles.input}
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                value={cDate}
                onChange={(e) => setCDate(formatDateInput(e.target.value))}
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>금액</div>
              <input style={styles.input} value={cAmount} onChange={(e) => setCAmount(e.target.value)} placeholder="예: 20000" />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>통화</div>
              <select style={styles.select} value={cCurrency} onChange={(e) => setCCurrency(e.target.value)}>
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {cCurrency === '직접입력' && (
                <input style={styles.input} value={cCurrencyCustom} onChange={(e) => setCCurrencyCustom(e.target.value)} placeholder="예: THB" />
              )}
            </div>

            <div style={styles.field}>
              <div style={styles.label}>환율 (원화면 1)</div>
              <input style={styles.input} value={cFxRate} onChange={(e) => setCFxRate(e.target.value)} placeholder="예: 1350" />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>거래처</div>
              <input
                list="cost-vendor-list"
                style={styles.input}
                value={cVendorName}
                onChange={(e) => setCVendorName(e.target.value)}
                placeholder="거래처관리에서 등록한 거래처 선택 또는 직접 입력"
              />
              <datalist id="cost-vendor-list">
                {costVendorOptions.map((v) => (
                  <option key={v.id} value={v.name ?? ''} />
                ))}
              </datalist>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>메모(선택)</div>
              <input style={styles.input} value={cMemo} onChange={(e) => setCMemo(e.target.value)} placeholder="예: DHL / 관세 고지서" />
            </div>
          </div>

          <div style={styles.hr} />

          <div style={{ fontWeight: 900, marginBottom: 6 }}>선택된 상품({selectedItemIds.length}개)</div>
          <div style={styles.small}>
            배분 기준: <b>상품 원화합계</b> 비율 / 소수점은 <b>무조건 올림</b> / 오차는 <b>상품 원화합계가 가장 큰 상품</b>에 몰아줌
          </div>

          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {selectedItems.slice(0, 8).map((it) => (
              <div key={it.id} style={{ ...styles.card, padding: 10 }}>
                <div style={{ fontWeight: 900 }}>{it.item_name ?? '(이름 없음)'}</div>
                <div style={styles.small}>
                  매입: {purchaseMap.get(it.purchase_id)?.supplier ?? '(거래처 없음)'} / 상품 원화합계:{' '}
                  <b>{fmtKRW(n(it.line_total))}</b>
                </div>
              </div>
            ))}
            {selectedItems.length > 8 && <div style={styles.small}>…외 {selectedItems.length - 8}개</div>}
          </div>
        </div>
      </SafeModal>

      <SafeModal
        open={costEditModalOpen}
        title="추가비용 수정"
        onClose={requestCloseCostEditModal}
      >
        <div
          onInputCapture={() => setCostEditDirty(true)}
          onChangeCapture={() => setCostEditDirty(true)}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 14 }}>
            <button style={styles.btn('ghost')} onClick={requestCloseCostEditModal}>
              닫기
            </button>
            <button style={styles.btn('primary')} onClick={saveCostEdit} disabled={loading}>
              저장
            </button>
          </div>

          <div style={styles.grid2}>
            <div style={styles.field}>
              <div style={styles.label}>추가비용 종류</div>
              <select style={styles.select} value={ecType} onChange={(e) => setEcType(e.target.value)}>
                {COST_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>날짜</div>
              <input
                style={styles.input}
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                value={ecDate}
                onChange={(e) => setEcDate(formatDateInput(e.target.value))}
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>금액</div>
              <input style={styles.input} value={ecAmount} onChange={(e) => setEcAmount(e.target.value)} />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>통화</div>
              <select style={styles.select} value={ecCurrency} onChange={(e) => setEcCurrency(e.target.value)}>
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {ecCurrency === '직접입력' && (
                <input style={styles.input} value={ecCurrencyCustom} onChange={(e) => setEcCurrencyCustom(e.target.value)} placeholder="예: THB" />
              )}
            </div>

            <div style={styles.field}>
              <div style={styles.label}>환율 (원화면 1)</div>
              <input style={styles.input} value={ecFxRate} onChange={(e) => setEcFxRate(e.target.value)} />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>거래처</div>
              <input
                list="cost-vendor-list-edit"
                style={styles.input}
                value={ecVendorName}
                onChange={(e) => setEcVendorName(e.target.value)}
              />
              <datalist id="cost-vendor-list-edit">
                {editCostVendorOptions.map((v) => (
                  <option key={v.id} value={v.name ?? ''} />
                ))}
              </datalist>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>메모</div>
              <input style={styles.input} value={ecMemo} onChange={(e) => setEcMemo(e.target.value)} />
            </div>
          </div>
        </div>
      </SafeModal>

      <SafeModal
        open={itemDetailOpen}
        title="상품 상세"
        onClose={() => setItemDetailOpen(false)}
      >
        {detailItem ? (
          <>
            <div style={styles.card}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>
                {detailItem.item_name ?? '(이름 없음)'}{' '}
                {detailItem.is_preorder && !hasBalanceByItem.get(detailItem.id) ? (
                  <span style={styles.badge('orange')}>예약</span>
                ) : null}
              </div>
              <div style={styles.small}>
                수량: <b>{fmtNum(n(detailItem.qty))}</b> / 상품 원화합계: <b>{fmtKRW(n(detailItem.line_total))}</b>
              </div>
              <div style={styles.small}>
                외화총액: <b>{fmtNum(n(detailItem.foreign_total))} {currencyLabel(purchaseMap.get(detailItem.purchase_id)?.currency)}</b> / 외화단가: <b>{n(detailItem.foreign_unit_price).toFixed(4)} {currencyLabel(purchaseMap.get(detailItem.purchase_id)?.currency)}</b>
              </div>
              {detailItem.memo ? <div style={{ marginTop: 8 }}>{detailItem.memo}</div> : null}
            </div>

            <div style={{ height: 12 }} />
            <div style={{ fontWeight: 900, marginBottom: 8 }}>이 상품에 분배된 추가비용</div>

            {detailAlloc.length === 0 ? (
              <div style={styles.small}>아직 분배된 추가비용이 없어.</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>종류</th>
                    <th style={{ ...styles.th, width: 120 }}>날짜</th>
                    <th style={{ ...styles.th, width: 150 }}>배분금액</th>
                    <th style={styles.th}>같이 배분된 상품</th>
                    <th style={styles.th}>거래처</th>
                    <th style={styles.th}>메모</th>
                  </tr>
                </thead>
                <tbody>
                  {detailAlloc.map((a, idx) => (
                    <tr key={idx}>
                      <td style={styles.td}>{a.cost_type ?? ''}</td>
                      <td style={styles.td}>{fmtDate(a.cost_date)}</td>
                      <td style={styles.td}>
                        <b>{fmtKRW(a.amount_krw)}</b>
                      </td>
                      <td style={styles.td}>
                        {a.related_item_names.length > 0 ? a.related_item_names.join(', ') : '-'}
                      </td>
                      <td style={styles.td}>{a.vendor_name ?? '-'}</td>
                      <td style={styles.td}>{a.memo ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ height: 12 }} />
            <div style={styles.small}>
              최종 단가(배분 포함):{' '}
              <b>
                {fmtKRW(
                  ceilInt(
                    (n(detailItem.line_total) + detailAlloc.reduce((acc, x) => acc + n(x.amount_krw), 0)) /
                      Math.max(1, n(detailItem.qty))
                  )
                )}
              </b>
            </div>
          </>
        ) : null}
      </SafeModal>
    </div>
  )
}