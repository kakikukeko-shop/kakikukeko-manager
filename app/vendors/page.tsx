'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SafeModal from '../../components/SafeModal'

type VendorRow = {
  id: string
  created_at?: string | null
  name?: string | null
  product_type?: string | null
  address?: string | null
  website?: string | null
  email?: string | null
  phone?: string | null
  is_domestic?: boolean | null
  is_online?: boolean | null
  is_offline?: boolean | null
  is_active?: boolean | null
  is_product_supplier?: boolean | null
  is_forwarder?: boolean | null
  is_carry_in?: boolean | null
  is_customs_broker?: boolean | null
  memo?: string | null
}

type PurchaseRow = {
  id: string
  supplier?: string | null
  purchase_date?: string | null
}

type PurchaseItemLiteRow = {
  id: string
  purchase_id: string
  qty?: number | null
  item_name?: string | null
}

type VendorWalletTopupRow = {
  id: string
  created_at: string
  vendor_name: string
  currency: string
  topup_date: string
  foreign_amount: number
  krw_amount: number
  fx_rate: number
  remaining_foreign: number
  memo: string | null
}

type VendorWalletUsageRow = {
  id: string
  created_at: string
  topup_id: string
  purchase_id: string | null
  vendor_name: string
  currency: string
  usage_date: string
  usage_type: '상품' | '배송비' | string
  foreign_amount: number
  krw_amount: number
  fx_rate: number
  memo: string | null
}

type WalletLedgerRow = {
  id: string
  date: string
  created_at: string
  kind: '충전' | '상품사용' | '배송비사용' | '수수료사용'
  currency: string
  foreign_delta: number
  krw_amount: number
  balance_after: number
  memo: string
  purchase_id?: string | null
  itemKinds?: number
  itemQty?: number
}

type PurchaseCostRow = {
  id: string
  vendor_name?: string | null
  cost_type?: string | null
}

function fmtDateTime(v?: string | null) {
  if (!v) return '-'
  try {
    return new Date(v).toLocaleString('ko-KR')
  } catch {
    return v
  }
}

function normalizeName(v?: string | null) {
  return String(v ?? '').trim().toLowerCase()
}

function fmtNum(v: number) {
  return Number.isFinite(v) ? v.toLocaleString('ko-KR') : '0'
}

function fmtKRW(v: number) {
  return `${Math.round(v).toLocaleString('ko-KR')}원`
}

function formatDateInput(raw: string) {
  let v = raw.replace(/[^0-9]/g, '').slice(0, 8)
  if (v.length >= 5) v = `${v.slice(0, 4)}-${v.slice(4)}`
  if (v.length >= 8) v = `${v.slice(0, 7)}-${v.slice(7)}`
  return v
}


const VENDOR_SORT_OPTIONS = [
  { value: 'name', label: '이름순' },
  { value: 'usage_desc', label: '이용횟수 많은순' },
  { value: 'usage_asc', label: '이용횟수 적은순' },
] as const

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [purchaseCosts, setPurchaseCosts] = useState<PurchaseCostRow[]>([])
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemLiteRow[]>([])
  const [walletTopups, setWalletTopups] = useState<VendorWalletTopupRow[]>([])
  const [walletUsages, setWalletUsages] = useState<VendorWalletUsageRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] =
    useState<(typeof VENDOR_SORT_OPTIONS)[number]['value']>('name')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [productType, setProductType] = useState('')
  const [address, setAddress] = useState('')
  const [website, setWebsite] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [isDomestic, setIsDomestic] = useState(true)
  const [isOnline, setIsOnline] = useState(true)
  const [isOffline, setIsOffline] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [isProductSupplier, setIsProductSupplier] = useState(true)
  const [isForwarder, setIsForwarder] = useState(false)
  const [isCarryIn, setIsCarryIn] = useState(false)
  const [isCustomsBroker, setIsCustomsBroker] = useState(false)
  const [memo, setMemo] = useState('')

  const [walletTopupModalOpen, setWalletTopupModalOpen] = useState(false)
  const [walletLedgerModalOpen, setWalletLedgerModalOpen] = useState(false)
  const [walletVendor, setWalletVendor] = useState<VendorRow | null>(null)
  const [walletCurrency, setWalletCurrency] = useState('JPY')
  const [walletTopupDate, setWalletTopupDate] = useState('')
  const [walletForeignAmount, setWalletForeignAmount] = useState('')
  const [walletKRWAmount, setWalletKRWAmount] = useState('')
  const [walletMemo, setWalletMemo] = useState('')
  const [walletSaving, setWalletSaving] = useState(false)
  const [editingWalletTopupId, setEditingWalletTopupId] =
    useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErr(null)
    setMsg(null)

    const [
      vendorRes,
      purchaseRes,
      purchaseCostRes,
      purchaseItemRes,
      walletTopupRes,
      walletUsageRes,
    ] = await Promise.all([
      supabase
        .from('vendors')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('purchase')
        .select('id,supplier,purchase_date'),

      supabase
        .from('purchase_costs')
        .select('id,vendor_name,cost_type'),

      supabase
        .from('purchase_items')
        .select('id,purchase_id,qty,item_name'),

      supabase
        .from('vendor_wallet_topups')
        .select(
          'id,created_at,vendor_name,currency,topup_date,foreign_amount,krw_amount,fx_rate,remaining_foreign,memo',
        )
        .order('topup_date', { ascending: true })
        .order('created_at', { ascending: true }),

      supabase
        .from('vendor_wallet_usages')
        .select(
          'id,created_at,topup_id,purchase_id,vendor_name,currency,usage_date,usage_type,foreign_amount,krw_amount,fx_rate,memo',
        )
        .order('usage_date', { ascending: true })
        .order('created_at', { ascending: true }),
    ])

    if (vendorRes.error) {
      setErr(vendorRes.error.message)
      setLoading(false)
      return
    }

    if (purchaseRes.error) {
      setErr(purchaseRes.error.message)
      setLoading(false)
      return
    }

    if (purchaseCostRes.error) {
      setErr(purchaseCostRes.error.message)
      setLoading(false)
      return
    }

    if (purchaseItemRes.error) {
      setErr(purchaseItemRes.error.message)
      setLoading(false)
      return
    }

    if (walletTopupRes.error) {
      setErr(walletTopupRes.error.message)
      setLoading(false)
      return
    }

    if (walletUsageRes.error) {
      setErr(walletUsageRes.error.message)
      setLoading(false)
      return
    }

    setVendors((vendorRes.data ?? []) as VendorRow[])
    setPurchases((purchaseRes.data ?? []) as PurchaseRow[])
    setPurchaseCosts((purchaseCostRes.data ?? []) as PurchaseCostRow[])
    setPurchaseItems((purchaseItemRes.data ?? []) as PurchaseItemLiteRow[])
    setWalletTopups((walletTopupRes.data ?? []) as VendorWalletTopupRow[])
    setWalletUsages((walletUsageRes.data ?? []) as VendorWalletUsageRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const purchaseUsageCountMap = useMemo(() => {
    const map = new Map<string, number>()

    purchases.forEach((p) => {
      const key = normalizeName(p.supplier)
      if (!key) return
      map.set(key, (map.get(key) ?? 0) + 1)
    })

    return map
  }, [purchases])

  const costUsageCountMap = useMemo(() => {
    const map = new Map<string, number>()

    purchaseCosts.forEach((c) => {
      const key = normalizeName(c.vendor_name)
      if (!key) return
      map.set(key, (map.get(key) ?? 0) + 1)
    })

    return map
  }, [purchaseCosts])

  function getUsageInfo(v: VendorRow) {
    const key = normalizeName(v.name)
    const purchaseCount = purchaseUsageCountMap.get(key) ?? 0
    const costCount = costUsageCountMap.get(key) ?? 0

    const totalCount = purchaseCount + costCount

    let label = `이용 ${totalCount}회`

    const isAdditionalCostVendor =
      !!v.is_forwarder || !!v.is_carry_in || !!v.is_customs_broker

    if (v.is_product_supplier && !isAdditionalCostVendor) {
      label = `매입 ${purchaseCount}회`
    } else if (!v.is_product_supplier && isAdditionalCostVendor) {
      label = `추가비용 ${costCount}회`
    } else if (v.is_product_supplier && isAdditionalCostVendor) {
      label = `매입 ${purchaseCount}회 / 추가비용 ${costCount}회`
    }

    return {
      purchaseCount,
      costCount,
      totalCount,
      label,
    }
  }

  function getActiveStatusLabel(v: VendorRow) {
    return v.is_active === false ? '거래중단' : '사용중'
  }


  const purchaseMap = useMemo(() => {
    return new Map(purchases.map((p) => [p.id, p]))
  }, [purchases])

  const purchaseItemSummaryMap = useMemo(() => {
    const map = new Map<string, { kinds: number; qty: number }>()

    for (const item of purchaseItems) {
      const prev = map.get(item.purchase_id) ?? { kinds: 0, qty: 0 }
      prev.kinds += 1
      prev.qty += Math.max(0, Number(item.qty) || 0)
      map.set(item.purchase_id, prev)
    }

    return map
  }, [purchaseItems])

  const walletSummaryMap = useMemo(() => {
    const map = new Map<
      string,
      Array<{
        currency: string
        balance: number
        totalTopup: number
        totalUsed: number
      }>
    >()

    const vendorKeys = new Set<string>()
    walletTopups.forEach((row) => vendorKeys.add(normalizeName(row.vendor_name)))
    walletUsages.forEach((row) => vendorKeys.add(normalizeName(row.vendor_name)))

    for (const vendorKey of vendorKeys) {
      if (!vendorKey) continue

      const currencies = new Set<string>()

      walletTopups
        .filter((row) => normalizeName(row.vendor_name) === vendorKey)
        .forEach((row) => currencies.add(String(row.currency || '').toUpperCase()))

      walletUsages
        .filter((row) => normalizeName(row.vendor_name) === vendorKey)
        .forEach((row) => currencies.add(String(row.currency || '').toUpperCase()))

      const summaries = Array.from(currencies)
        .filter(Boolean)
        .map((currency) => {
          const topups = walletTopups.filter(
            (row) =>
              normalizeName(row.vendor_name) === vendorKey &&
              String(row.currency || '').toUpperCase() === currency,
          )
          const usages = walletUsages.filter(
            (row) =>
              normalizeName(row.vendor_name) === vendorKey &&
              String(row.currency || '').toUpperCase() === currency,
          )

          return {
            currency,
            balance: topups.reduce(
              (sum, row) => sum + Math.max(0, Number(row.remaining_foreign) || 0),
              0,
            ),
            totalTopup: topups.reduce(
              (sum, row) => sum + Math.max(0, Number(row.foreign_amount) || 0),
              0,
            ),
            totalUsed: usages.reduce(
              (sum, row) => sum + Math.max(0, Number(row.foreign_amount) || 0),
              0,
            ),
          }
        })
        .sort((a, b) => a.currency.localeCompare(b.currency))

      map.set(vendorKey, summaries)
    }

    return map
  }, [walletTopups, walletUsages])

  function getWalletSummary(v: VendorRow) {
    return walletSummaryMap.get(normalizeName(v.name)) ?? []
  }

  function openWalletTopup(v: VendorRow) {
    setEditingWalletTopupId(null)
    setWalletVendor(v)
    const preferred =
      getWalletSummary(v).find((x) => x.balance > 0)?.currency ||
      getWalletSummary(v)[0]?.currency ||
      (!v.is_domestic ? 'JPY' : 'KRW')

    setWalletCurrency(preferred)
    setWalletTopupDate(new Date().toISOString().slice(0, 10))
    setWalletForeignAmount('')
    setWalletKRWAmount('')
    setWalletMemo('')
    setWalletTopupModalOpen(true)
  }

  function getWalletTopupUsedAmount(topupId: string) {
    return walletUsages
      .filter((row) => row.topup_id === topupId)
      .reduce(
        (sum, row) => sum + Math.max(0, Number(row.foreign_amount) || 0),
        0,
      )
  }

  function openWalletTopupEdit(v: VendorRow, topupId: string) {
    const row = walletTopups.find((x) => x.id === topupId)
    if (!row) {
      setErr('수정할 충전내역을 찾을 수 없어.')
      return
    }

    setWalletLedgerModalOpen(false)
    setWalletVendor(v)
    setEditingWalletTopupId(row.id)
    setWalletCurrency(String(row.currency || 'JPY').toUpperCase())
    setWalletTopupDate(row.topup_date || '')
    setWalletForeignAmount(String(row.foreign_amount ?? ''))
    setWalletKRWAmount(String(row.krw_amount ?? ''))
    setWalletMemo(row.memo || '')
    setWalletTopupModalOpen(true)
  }

  const editingWalletTopupUsedAmount = useMemo(() => {
    if (!editingWalletTopupId) return 0
    return getWalletTopupUsedAmount(editingWalletTopupId)
  }, [editingWalletTopupId, walletUsages])

  const editingWalletTopupLocked = editingWalletTopupUsedAmount > 0

  function openWalletLedger(v: VendorRow) {
    setWalletVendor(v)
    setWalletLedgerModalOpen(true)
  }

  async function saveWalletTopup() {
    if (!walletVendor?.name?.trim()) {
      setErr('거래처를 찾을 수 없어.')
      return
    }

    if (!walletTopupDate || walletTopupDate.length !== 10) {
      setErr('충전일을 YYYY-MM-DD 형식으로 입력해줘.')
      return
    }

    const foreign = Number(walletForeignAmount)
    const krw = Number(walletKRWAmount)

    if (!Number.isFinite(foreign) || foreign <= 0) {
      setErr('충전 외화금액을 입력해줘.')
      return
    }

    if (!Number.isFinite(krw) || krw <= 0) {
      setErr('실제 빠져나간 원화금액을 입력해줘.')
      return
    }

    setWalletSaving(true)
    setErr(null)
    setMsg(null)

    try {
      if (editingWalletTopupId) {
        const usedAmount = getWalletTopupUsedAmount(editingWalletTopupId)

        if (usedAmount > 0) {
          const upd = await supabase
            .from('vendor_wallet_topups')
            .update({ memo: walletMemo.trim() || null })
            .eq('id', editingWalletTopupId)

          if (upd.error) throw upd.error
        } else {
          const upd = await supabase
            .from('vendor_wallet_topups')
            .update({
              currency: walletCurrency.trim().toUpperCase(),
              topup_date: walletTopupDate,
              foreign_amount: foreign,
              krw_amount: krw,
              fx_rate: krw / foreign,
              remaining_foreign: foreign,
              memo: walletMemo.trim() || null,
            })
            .eq('id', editingWalletTopupId)

          if (upd.error) throw upd.error
        }

        setMsg(
          usedAmount > 0
            ? `${walletVendor.name} 충전내역 메모 수정 완료`
            : `${walletVendor.name} 충전내역 수정 완료`,
        )
      } else {
        const res = await supabase.rpc('add_vendor_wallet_topup', {
          p_vendor_name: walletVendor.name.trim(),
          p_currency: walletCurrency.trim().toUpperCase(),
          p_topup_date: walletTopupDate,
          p_foreign_amount: foreign,
          p_krw_amount: krw,
          p_memo: walletMemo.trim() || null,
        })

        if (res.error) throw res.error

        setMsg(
          `${walletVendor.name} ${fmtNum(foreign)} ${walletCurrency.toUpperCase()} 충전 등록 완료`,
        )
      }

      setWalletTopupModalOpen(false)
      setEditingWalletTopupId(null)
      setWalletForeignAmount('')
      setWalletKRWAmount('')
      setWalletMemo('')
      await load()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setWalletSaving(false)
    }
  }

  const selectedWalletLedger = useMemo(() => {
    if (!walletVendor?.name) return [] as WalletLedgerRow[]

    const vendorKey = normalizeName(walletVendor.name)
    const currencies = new Set<string>()

    walletTopups
      .filter((row) => normalizeName(row.vendor_name) === vendorKey)
      .forEach((row) => currencies.add(String(row.currency || '').toUpperCase()))

    walletUsages
      .filter((row) => normalizeName(row.vendor_name) === vendorKey)
      .forEach((row) => currencies.add(String(row.currency || '').toUpperCase()))

    const finalRows: WalletLedgerRow[] = []

    for (const currency of currencies) {
      const events: Omit<WalletLedgerRow, 'balance_after'>[] = []

      for (const row of walletTopups) {
        if (
          normalizeName(row.vendor_name) !== vendorKey ||
          String(row.currency || '').toUpperCase() !== currency
        ) {
          continue
        }

        events.push({
          id: `topup-${row.id}`,
          date: row.topup_date,
          created_at: row.created_at,
          kind: '충전',
          currency,
          foreign_delta: Math.max(0, Number(row.foreign_amount) || 0),
          krw_amount: Math.max(0, Number(row.krw_amount) || 0),
          memo: row.memo || '',
        })
      }

      for (const row of walletUsages) {
        if (
          normalizeName(row.vendor_name) !== vendorKey ||
          String(row.currency || '').toUpperCase() !== currency
        ) {
          continue
        }

        const summary = row.purchase_id
          ? purchaseItemSummaryMap.get(row.purchase_id)
          : undefined

        const purchase = row.purchase_id
          ? purchaseMap.get(row.purchase_id)
          : undefined

        events.push({
          id: `usage-${row.id}`,
          date: row.usage_date,
          created_at: row.created_at,
          kind:
            row.usage_type === '배송비'
              ? '배송비사용'
              : row.usage_type === '수수료'
                ? '수수료사용'
                : '상품사용',
          currency,
          foreign_delta: -Math.max(0, Number(row.foreign_amount) || 0),
          krw_amount: Math.max(0, Number(row.krw_amount) || 0),
          memo:
            row.usage_type === '배송비'
              ? row.memo || '배송비'
              : row.usage_type === '수수료'
                ? row.memo || '수수료'
                : row.memo || purchase?.supplier || '상품 매입',
          purchase_id: row.purchase_id,
          itemKinds: summary?.kinds ?? 0,
          itemQty: summary?.qty ?? 0,
        })
      }

      events.sort((a, b) => {
        const dateDiff = a.date.localeCompare(b.date)
        if (dateDiff !== 0) return dateDiff
        return a.created_at.localeCompare(b.created_at)
      })

      let balance = 0
      for (const event of events) {
        balance += event.foreign_delta
        finalRows.push({
          ...event,
          balance_after: balance,
        })
      }
    }

    return finalRows.sort((a, b) => {
      const dateDiff = b.date.localeCompare(a.date)
      if (dateDiff !== 0) return dateDiff
      return b.created_at.localeCompare(a.created_at)
    })
  }, [
    walletVendor,
    walletTopups,
    walletUsages,
    purchaseItemSummaryMap,
    purchaseMap,
  ])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    const searched = !q
      ? vendors
      : vendors.filter((v) => {
          const usage = getUsageInfo(v)
          const activeStatus = getActiveStatusLabel(v)

          const fields = [
            v.name,
            v.product_type,
            v.address,
            v.website,
            v.email,
            v.phone,
            v.memo,
            `${usage.purchaseCount}`,
            `${usage.costCount}`,
            `${usage.totalCount}`,
            usage.label,
            activeStatus,
            v.is_active === false ? '거래중단' : '사용중',
            `매입 ${usage.purchaseCount}회`,
            `추가비용 ${usage.costCount}회`,
            `이용 ${usage.totalCount}회`,
            ...getWalletSummary(v).flatMap((wallet) => [
              wallet.currency,
              `잔액 ${wallet.balance}`,
              `${wallet.balance} ${wallet.currency}`,
            ]),
          ]

          return fields.some((x) => String(x || '').toLowerCase().includes(q))
        })

    const list = [...searched]

    list.sort((a, b) => {
      const usageA = getUsageInfo(a)
      const usageB = getUsageInfo(b)

      if (sort === 'usage_desc') return usageB.totalCount - usageA.totalCount
      if (sort === 'usage_asc') return usageA.totalCount - usageB.totalCount
      return (a.name ?? '').localeCompare(b.name ?? '', 'ko-KR')
    })

    return list
  }, [vendors, search, sort, purchaseUsageCountMap, costUsageCountMap])

  function resetForm() {
    setEditingId(null)
    setName('')
    setProductType('')
    setAddress('')
    setWebsite('')
    setEmail('')
    setPhone('')
    setIsDomestic(true)
    setIsOnline(true)
    setIsOffline(false)
    setIsActive(true)
    setIsProductSupplier(true)
    setIsForwarder(false)
    setIsCarryIn(false)
    setIsCustomsBroker(false)
    setMemo('')
    setIsDirty(false)
  }

  function openCreate() {
    resetForm()
    setModalOpen(true)
  }

  function openEdit(v: VendorRow) {
    setEditingId(v.id)
    setName(v.name || '')
    setProductType(v.product_type || '')
    setAddress(v.address || '')
    setWebsite(v.website || '')
    setEmail(v.email || '')
    setPhone(v.phone || '')
    setIsDomestic(v.is_domestic !== false)
    setIsOnline(!!v.is_online)
    setIsOffline(!!v.is_offline)
    setIsActive(v.is_active !== false)
    setIsProductSupplier(!!v.is_product_supplier)
    setIsForwarder(!!v.is_forwarder)
    setIsCarryIn(!!v.is_carry_in)
    setIsCustomsBroker(!!v.is_customs_broker)
    setMemo(v.memo || '')
    setIsDirty(false)
    setModalOpen(true)
  }

  function requestCloseModal() {
    if (isDirty) {
      const ok = window.confirm('작성 중인 내용이 있어요.\n저장하지 않고 닫을까요?')
      if (!ok) return
    }
    setModalOpen(false)
    setIsDirty(false)
  }

  async function saveVendor() {
    setErr(null)
    setMsg(null)

    if (!name.trim()) {
      setErr('거래처 이름은 꼭 입력해줘.')
      return
    }

    const payload = {
      name: name.trim(),
      product_type: productType.trim() || null,
      address: address.trim() || null,
      website: website.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      is_domestic: isDomestic,
      is_online: isOnline,
      is_offline: isOffline,
      is_active: isActive,
      is_product_supplier: isProductSupplier,
      is_forwarder: isForwarder,
      is_carry_in: isCarryIn,
      is_customs_broker: isCustomsBroker,
      memo: memo.trim() || null,
    }

    setLoading(true)

    if (editingId) {
      const res = await supabase.from('vendors').update(payload).eq('id', editingId)
      if (res.error) {
        setErr(res.error.message)
        setLoading(false)
        return
      }
      setMsg('거래처 수정 완료')
    } else {
      const res = await supabase.from('vendors').insert(payload)
      if (res.error) {
        setErr(res.error.message)
        setLoading(false)
        return
      }
      setMsg('거래처 등록 완료')
    }

    setModalOpen(false)
    setIsDirty(false)
    resetForm()
    await load()
    setLoading(false)
  }

  async function deleteVendor(id: string) {
    const ok = window.confirm('이 거래처를 삭제할까요?')
    if (!ok) return

    setLoading(true)
    setErr(null)
    setMsg(null)

    const res = await supabase.from('vendors').delete().eq('id', id)
    if (res.error) {
      setErr(res.error.message)
      setLoading(false)
      return
    }

    setMsg('거래처 삭제 완료')
    await load()
    setLoading(false)
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

    title: {
      fontSize: 24,
      fontWeight: 900,
      color: '#312e81',
      marginBottom: 14,
    } as React.CSSProperties,

    topbar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
      flexWrap: 'wrap',
    } as React.CSSProperties,

    btnPrimary: {
      border: '1px solid #6d28d9',
      background: '#6d28d9',
      color: '#fff',
      padding: '10px 14px',
      borderRadius: 12,
      cursor: 'pointer',
      fontWeight: 800,
    } as React.CSSProperties,

    btnGhost: {
      border: '1px solid #ddd',
      background: '#fff',
      color: '#111',
      padding: '10px 12px',
      borderRadius: 12,
      cursor: 'pointer',
      fontWeight: 800,
    } as React.CSSProperties,

    actionBtn: {
      border: '1px solid #d1d5db',
      background: '#fff',
      color: '#111827',
      padding: '6px 10px',
      borderRadius: 10,
      cursor: 'pointer',
      fontWeight: 800,
      fontSize: 12,
      lineHeight: 1,
      minWidth: 52,
      height: 30,
      whiteSpace: 'nowrap',
      textAlign: 'center',
      flexShrink: 0,
    } as React.CSSProperties,

    actionDeleteBtn: {
      border: '1px solid #fecaca',
      background: '#fff',
      color: '#dc2626',
      padding: '6px 10px',
      borderRadius: 10,
      cursor: 'pointer',
      fontWeight: 800,
      fontSize: 12,
      lineHeight: 1,
      minWidth: 52,
      height: 30,
      whiteSpace: 'nowrap',
      textAlign: 'center',
      flexShrink: 0,
    } as React.CSSProperties,

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

    textarea: {
      border: '1px solid #d9d9e6',
      borderRadius: 12,
      padding: '10px 12px',
      outline: 'none',
      fontSize: 14,
      minHeight: 90,
      resize: 'vertical',
      width: '100%',
      color: '#111',
      boxSizing: 'border-box',
    } as React.CSSProperties,

    card: {
      background: '#fff',
      border: '1px solid #e6e6ef',
      borderRadius: 18,
      padding: 14,
      boxShadow: '0 8px 24px rgba(124, 58, 237, 0.05)',
      minHeight: 250,
      display: 'flex',
      flexDirection: 'column',
    } as React.CSSProperties,

    badge: (bg: string, color: string) =>
      ({
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        background: bg,
        color,
        lineHeight: 1,
      }) as React.CSSProperties,

    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
      gap: 14,
      alignItems: 'stretch',
    } as React.CSSProperties,

    formGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14,
    } as React.CSSProperties,

    label: {
      display: 'block',
      fontSize: 12,
      fontWeight: 800,
      color: '#374151',
      marginBottom: 6,
    } as React.CSSProperties,

    errorBox: {
      background: '#fef2f2',
      color: '#991b1b',
      border: '1px solid #fecaca',
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      fontWeight: 700,
    } as React.CSSProperties,

    okBox: {
      background: '#ecfdf5',
      color: '#065f46',
      border: '1px solid #bbf7d0',
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      fontWeight: 700,
    } as React.CSSProperties,

    detailLabel: {
      fontSize: 11,
      fontWeight: 800,
      color: '#6b7280',
      marginBottom: 2,
    } as React.CSSProperties,

    detailValue: {
      fontSize: 12,
      color: '#111827',
      lineHeight: 1.45,
      wordBreak: 'break-word',
      whiteSpace: 'pre-wrap',
    } as React.CSSProperties,
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.title}>거래처관리</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={styles.btnPrimary} onClick={openCreate}>
            + 거래처 등록
          </button>
          <button style={styles.btnGhost} onClick={load}>
            새로고침
          </button>
          <div style={{ width: 240 }}>
            <input
              style={styles.input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="거래처 검색"
            />
          </div>
          <div style={{ width: 180 }}>
            <select
              style={styles.input}
              value={sort}
              onChange={(e) => setSort(e.target.value as (typeof VENDOR_SORT_OPTIONS)[number]['value'])}
            >
              {VENDOR_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {msg ? <div style={styles.okBox}>{msg}</div> : null}
      {err ? <div style={styles.errorBox}>{err}</div> : null}

      {loading && vendors.length === 0 ? (
        <div style={styles.card}>불러오는 중...</div>
      ) : (
        <div
          data-vendors-grid="true"
          style={{
            ...styles.grid,
          }}
        >
          {filtered.map((v) => {
            const usage = getUsageInfo(v)
            const activeStatus = getActiveStatusLabel(v)

            return (
              <div key={v.id} style={styles.card}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 900,
                        color: '#111827',
                        lineHeight: 1.2,
                        wordBreak: 'break-word',
                        marginBottom: 8,
                      }}
                    >
                      {v.name || '(이름 없음)'}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {v.is_online ? (
                        <span style={styles.badge('#dbeafe', '#1d4ed8')}>온라인</span>
                      ) : null}
                      {v.is_offline ? (
                        <span style={styles.badge('#fef3c7', '#92400e')}>오프라인</span>
                      ) : null}
                      {v.is_product_supplier ? (
                        <span style={styles.badge('#ede9fe', '#6d28d9')}>상품거래처</span>
                      ) : null}
                      {v.is_forwarder ? (
                        <span style={styles.badge('#e0e7ff', '#4338ca')}>배대지</span>
                      ) : null}
                      {v.is_carry_in ? (
                        <span style={styles.badge('#fae8ff', '#a21caf')}>휴대품반입</span>
                      ) : null}
                      {v.is_customs_broker ? (
                        <span style={styles.badge('#fce7f3', '#be185d')}>관세사</span>
                      ) : null}
                      {v.is_domestic ? (
                        <span style={styles.badge('#dcfce7', '#166534')}>국내</span>
                      ) : (
                        <span style={styles.badge('#ecfccb', '#3f6212')}>해외</span>
                      )}
                      {v.is_active === false ? (
                        <span style={styles.badge('#fee2e2', '#b91c1c')}>거래중단</span>
                      ) : (
                        <span style={styles.badge('#dcfce7', '#166534')}>사용중</span>
                      )}
                      <span style={styles.badge('#f3f4f6', '#374151')}>{usage.label}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 6,
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      flexShrink: 0,
                    }}
                  >
                    <button style={styles.actionBtn} onClick={() => openEdit(v)}>
                      수정
                    </button>
                    <button style={styles.actionDeleteBtn} onClick={() => deleteVendor(v.id)}>
                      삭제
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px 14px',
                    marginTop: 4,
                  }}
                >
                  <div>
                    <div style={styles.detailLabel}>상품종류</div>
                    <div style={styles.detailValue}>{v.product_type || '-'}</div>
                  </div>

                  <div>
                    <div style={styles.detailLabel}>사용 상태</div>
                    <div style={styles.detailValue}>{activeStatus}</div>
                  </div>

                  <div>
                    <div style={styles.detailLabel}>이용현황</div>
                    <div style={styles.detailValue}>{usage.label}</div>
                  </div>


                  <div>
                    <div style={styles.detailLabel}>전화번호</div>
                    <div style={styles.detailValue}>{v.phone || '-'}</div>
                  </div>

                  <div>
                    <div style={styles.detailLabel}>이메일</div>
                    <div style={styles.detailValue}>{v.email || '-'}</div>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={styles.detailLabel}>주소/온라인주소</div>
                    <div style={styles.detailValue}>{v.address || '-'}</div>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={styles.detailLabel}>웹사이트</div>
                    <div style={styles.detailValue}>{v.website || '-'}</div>
                  </div>

                  <div
                    style={{
                      gridColumn: '1 / -1',
                      borderTop: '1px solid #eee',
                      paddingTop: 10,
                      marginTop: 2,
                    }}
                  >
                    <div style={styles.detailLabel}>외화 충전잔액</div>

                    {getWalletSummary(v).length === 0 ? (
                      <div style={{ ...styles.detailValue, marginBottom: 8 }}>
                        등록된 충전잔액 없음
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          marginBottom: 8,
                        }}
                      >
                        {getWalletSummary(v).map((wallet) => (
                          <span
                            key={wallet.currency}
                            style={{
                              ...styles.badge('#faf5ff', '#6d28d9'),
                              border: '1px solid #ddd6fe',
                              fontSize: 12,
                            }}
                          >
                            {wallet.currency} {fmtNum(wallet.balance)}
                          </span>
                        ))}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 6,
                      }}
                    >
                      <button
                        type="button"
                        style={{
                          ...styles.actionBtn,
                          width: '100%',
                          height: 34,
                        }}
                        onClick={() => openWalletTopup(v)}
                      >
                        + 외화충전등록
                      </button>

                      <button
                        type="button"
                        style={{
                          ...styles.actionBtn,
                          width: '100%',
                          height: 34,
                          borderColor: '#7c3aed',
                          color: '#6d28d9',
                        }}
                        onClick={() => openWalletLedger(v)}
                      >
                        외화충전현황
                      </button>
                    </div>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={styles.detailLabel}>메모</div>
                    <div style={styles.detailValue}>{v.memo || '-'}</div>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={styles.detailLabel}>등록</div>
                    <div style={styles.detailValue}>{fmtDateTime(v.created_at)}</div>
                  </div>
                </div>
              </div>
            )
          })}

          {!loading && filtered.length === 0 ? (
            <div style={styles.card}>조건에 맞는 거래처가 없어.</div>
          ) : null}
        </div>
      )}


      <SafeModal
        open={walletTopupModalOpen}
        title={
          walletVendor?.name
            ? editingWalletTopupId
              ? `${walletVendor.name} 외화충전수정`
              : `${walletVendor.name} 외화충전등록`
            : editingWalletTopupId
              ? '외화충전수정'
              : '외화충전등록'
        }
        onClose={() => {
          setWalletTopupModalOpen(false)
          setEditingWalletTopupId(null)
        }}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div
            style={{
              border: '1px solid #ede9fe',
              background: '#faf5ff',
              borderRadius: 14,
              padding: 12,
              fontSize: 12,
              lineHeight: 1.6,
              color: '#5b21b6',
            }}
          >
            외화통화와 실제 충전된 외화, 원화 결제금액을 저장해.
            이 충전분은 매입관리에서 선택해서 사용할 수 있고,
            먼저 충전한 잔액부터 FIFO로 차감돼.
          </div>
          {editingWalletTopupId && editingWalletTopupLocked ? (
            <div
              style={{
                border: '1px solid #fecaca',
                background: '#fef2f2',
                borderRadius: 12,
                padding: 10,
                fontSize: 12,
                lineHeight: 1.6,
                color: '#991b1b',
              }}
            >
              이 충전건은 이미 {fmtNum(editingWalletTopupUsedAmount)}{' '}
              {walletCurrency}가 사용됐어. 과거 FIFO 원가와 잔액을 보호하기
              위해 메모만 수정할 수 있어.
            </div>
          ) : null}

          <div style={styles.formGrid}>
            <div>
              <label style={styles.label}>통화</label>
              <select
                style={{
                  ...styles.input,
                  background: editingWalletTopupLocked ? '#f3f4f6' : '#fff',
                }}
                disabled={editingWalletTopupLocked}
                value={walletCurrency}
                onChange={(e) =>
                  setWalletCurrency(e.target.value.toUpperCase())
                }
              >
                <option value="JPY">JPY(엔)</option>
                <option value="USD">USD(달러)</option>
                <option value="CNY">CNY(위안)</option>
                <option value="EUR">EUR(유로)</option>
                <option value="KRW">KRW(원)</option>
              </select>
            </div>

            <div>
              <label style={styles.label}>충전일</label>
              <input
                style={{
                  ...styles.input,
                  background: editingWalletTopupLocked ? '#f3f4f6' : '#fff',
                }}
                readOnly={editingWalletTopupLocked}
                value={walletTopupDate}
                onChange={(e) =>
                  setWalletTopupDate(formatDateInput(e.target.value))
                }
                placeholder="YYYY-MM-DD"
              />
            </div>

            <div>
              <label style={styles.label}>충전 외화금액</label>
              <input
                style={{
                  ...styles.input,
                  background: editingWalletTopupLocked ? '#f3f4f6' : '#fff',
                }}
                readOnly={editingWalletTopupLocked}
                inputMode="decimal"
                value={walletForeignAmount}
                onChange={(e) =>
                  setWalletForeignAmount(e.target.value)
                }
                placeholder="예: 100000"
              />
            </div>

            <div>
              <label style={styles.label}>실제 빠져나간 원화</label>
              <input
                style={{
                  ...styles.input,
                  background: editingWalletTopupLocked ? '#f3f4f6' : '#fff',
                }}
                readOnly={editingWalletTopupLocked}
                inputMode="numeric"
                value={walletKRWAmount}
                onChange={(e) => setWalletKRWAmount(e.target.value)}
                placeholder="예: 953000"
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={styles.label}>자동 적용환율</label>
              <input
                style={{
                  ...styles.input,
                  background: '#f3f4f6',
                }}
                readOnly
                value={
                  Number(walletForeignAmount) > 0 &&
                  Number(walletKRWAmount) > 0
                    ? (
                        Number(walletKRWAmount) /
                        Number(walletForeignAmount)
                      ).toFixed(4)
                    : ''
                }
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={styles.label}>메모</label>
              <input
                style={styles.input}
                value={walletMemo}
                onChange={(e) => setWalletMemo(e.target.value)}
                placeholder="예: Wise 1차 충전"
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <button
              type="button"
              style={styles.btnGhost}
              onClick={() => setWalletTopupModalOpen(false)}
            >
              닫기
            </button>

            <button
              type="button"
              style={styles.btnPrimary}
              disabled={walletSaving}
              onClick={saveWalletTopup}
            >
              {walletSaving
                ? '저장 중...'
                : editingWalletTopupId
                  ? '수정 저장'
                  : '충전 저장'}
            </button>
          </div>
        </div>
      </SafeModal>

      <SafeModal
        open={walletLedgerModalOpen}
        title={
          walletVendor?.name
            ? `${walletVendor.name} 외화충전현황`
            : '외화충전현황'
        }
        onClose={() => setWalletLedgerModalOpen(false)}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          {walletVendor ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 8,
                }}
              >
                {getWalletSummary(walletVendor).length === 0 ? (
                  <div
                    style={{
                      border: '1px dashed #d9d9e6',
                      borderRadius: 12,
                      padding: 12,
                      color: '#6b7280',
                    }}
                  >
                    아직 충전/사용 내역이 없어.
                  </div>
                ) : (
                  getWalletSummary(walletVendor).map((wallet) => (
                    <div
                      key={wallet.currency}
                      style={{
                        border: '1px solid #ddd6fe',
                        borderRadius: 14,
                        padding: 12,
                        background: '#faf5ff',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: '#6d28d9',
                          fontWeight: 900,
                        }}
                      >
                        현재 {wallet.currency} 잔액
                      </div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 900,
                          marginTop: 4,
                        }}
                      >
                        {fmtNum(wallet.balance)} {wallet.currency}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#6b7280',
                          marginTop: 6,
                        }}
                      >
                        총 충전 {fmtNum(wallet.totalTopup)}
                        {' / '}
                        총 사용 {fmtNum(wallet.totalUsed)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '10px 12px',
                    fontWeight: 900,
                    background: '#fafafa',
                    borderBottom: '1px solid #e5e7eb',
                  }}
                >
                  충전 · 사용 원장
                </div>

                {selectedWalletLedger.length === 0 ? (
                  <div
                    style={{
                      padding: 16,
                      color: '#6b7280',
                      fontSize: 13,
                    }}
                  >
                    내역이 없어.
                  </div>
                ) : (
                  <div
                    style={{
                      maxHeight: 460,
                      overflowY: 'auto',
                      display: 'grid',
                    }}
                  >
                    {selectedWalletLedger.map((row) => {
                      const isTopup = row.kind === '충전'

                      return (
                        <div
                          key={row.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns:
                              '92px 90px minmax(0,1fr) 130px 130px 64px',
                            gap: 8,
                            alignItems: 'center',
                            padding: '10px 12px',
                            borderBottom: '1px solid #f0f0f5',
                            fontSize: 12,
                          }}
                        >
                          <div>
                            <b>{row.date}</b>
                          </div>

                          <div>
                            <span
                              style={styles.badge(
                                isTopup
                                  ? '#dcfce7'
                                  : row.kind === '배송비사용'
                                    ? '#ffedd5'
                                    : row.kind === '수수료사용'
                                      ? '#fee2e2'
                                      : '#ede9fe',
                                isTopup
                                  ? '#166534'
                                  : row.kind === '배송비사용'
                                    ? '#9a3412'
                                    : row.kind === '수수료사용'
                                      ? '#b91c1c'
                                      : '#6d28d9',
                              )}
                            >
                              {row.kind}
                            </span>
                          </div>

                          <div style={{ minWidth: 0 }}>
                            {row.kind === '상품사용' ? (
                              <>
                                <div style={{ fontWeight: 900 }}>
                                  상품 {fmtNum(row.itemKinds ?? 0)}종 /
                                  총수량 {fmtNum(row.itemQty ?? 0)}개
                                </div>
                                <div
                                  style={{
                                    color: '#6b7280',
                                    marginTop: 2,
                                  }}
                                >
                                  {row.memo || '상품 매입'}
                                </div>
                              </>
                            ) : (
                              <div>
                                {row.memo ||
                                  (row.kind === '충전'
                                    ? '외화 충전'
                                    : '배송비')}
                              </div>
                            )}
                          </div>

                          <div
                            style={{
                              fontWeight: 900,
                              color: isTopup ? '#166534' : '#b91c1c',
                            }}
                          >
                            {isTopup ? '+' : '-'}
                            {fmtNum(Math.abs(row.foreign_delta))}{' '}
                            {row.currency}
                            <div
                              style={{
                                fontSize: 10,
                                color: '#6b7280',
                                fontWeight: 600,
                                marginTop: 2,
                              }}
                            >
                              {fmtKRW(row.krw_amount)}
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div
                              style={{
                                fontSize: 10,
                                color: '#6b7280',
                              }}
                            >
                              처리 후 잔액
                            </div>
                            <div style={{ fontWeight: 900 }}>
                              {fmtNum(row.balance_after)} {row.currency}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {isTopup ? (
                              <button
                                type="button"
                                style={{
                                  ...styles.actionBtn,
                                  minWidth: 0,
                                  height: 30,
                                  padding: '5px 9px',
                                }}
                                onClick={() => {
                                  if (!walletVendor) return
                                  openWalletTopupEdit(
                                    walletVendor,
                                    row.id.replace(/^topup-/, ''),
                                  )
                                }}
                              >
                                수정
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  style={styles.btnPrimary}
                  onClick={() => {
                    setWalletLedgerModalOpen(false)
                    openWalletTopup(walletVendor)
                  }}
                >
                  + 외화충전등록
                </button>

                <button
                  type="button"
                  style={styles.btnGhost}
                  onClick={() => setWalletLedgerModalOpen(false)}
                >
                  닫기
                </button>
              </div>
            </>
          ) : null}
        </div>
      </SafeModal>

      <SafeModal
        open={modalOpen}
        title={editingId ? '거래처 수정' : '거래처 등록'}
        onClose={requestCloseModal}
      >
        <div
          onInputCapture={() => setIsDirty(true)}
          onChangeCapture={() => setIsDirty(true)}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 16 }}>
            <button style={styles.btnGhost} type="button" onClick={requestCloseModal}>
              닫기
            </button>
            <button style={styles.btnPrimary} type="button" onClick={saveVendor}>
              저장
            </button>
          </div>

          <div style={styles.formGrid}>
            <div>
              <label style={styles.label}>거래처 이름</label>
              <input
                style={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 타오바오, 슈퍼딜리버리"
              />
            </div>

            <div>
              <label style={styles.label}>상품종류</label>
              <input
                style={styles.input}
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                placeholder="예: 피규어, 가챠, 문구"
              />
            </div>

            <div>
              <label style={styles.label}>주소 / 온라인주소</label>
              <input
                style={styles.input}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="주소 또는 사이트 주소"
              />
            </div>

            <div>
              <label style={styles.label}>웹사이트</label>
              <input
                style={styles.input}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="예: https://example.com"
              />
            </div>

            <div>
              <label style={styles.label}>이메일</label>
              <input
                style={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="예: sample@email.com"
              />
            </div>

            <div>
              <label style={styles.label}>전화번호</label>
              <input
                style={styles.input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="예: 010-0000-0000"
              />
            </div>

            <div style={{ padding: '6px 0' }}>
              <label style={styles.label}>국내 / 해외</label>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ fontSize: 14, fontWeight: 700 }}>
                  <input
                    type="radio"
                    checked={isDomestic}
                    onChange={() => setIsDomestic(true)}
                    style={{ marginRight: 6 }}
                  />
                  국내
                </label>
                <label style={{ fontSize: 14, fontWeight: 700 }}>
                  <input
                    type="radio"
                    checked={!isDomestic}
                    onChange={() => setIsDomestic(false)}
                    style={{ marginRight: 6 }}
                  />
                  해외
                </label>
              </div>
            </div>

            <div style={{ padding: '6px 0' }}>
              <label style={styles.label}>사용 상태</label>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ fontSize: 14, fontWeight: 700 }}>
                  <input
                    type="radio"
                    checked={isActive}
                    onChange={() => setIsActive(true)}
                    style={{ marginRight: 6 }}
                  />
                  사용중
                </label>
                <label style={{ fontSize: 14, fontWeight: 700 }}>
                  <input
                    type="radio"
                    checked={!isActive}
                    onChange={() => setIsActive(false)}
                    style={{ marginRight: 6 }}
                  />
                  거래중단
                </label>
              </div>
            </div>

            <div style={{ padding: '6px 0' }}>
              <label style={styles.label}>온라인 / 오프라인</label>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 14, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={isOnline}
                    onChange={(e) => setIsOnline(e.target.checked)}
                    style={{ marginRight: 6 }}
                  />
                  온라인
                </label>
                <label style={{ fontSize: 14, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={isOffline}
                    onChange={(e) => setIsOffline(e.target.checked)}
                    style={{ marginRight: 6 }}
                  />
                  오프라인
                </label>
              </div>
            </div>

            <div style={{ padding: '6px 0' }}>
              <label style={styles.label}>거래처 분류</label>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 14, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={isProductSupplier}
                    onChange={(e) => setIsProductSupplier(e.target.checked)}
                    style={{ marginRight: 6 }}
                  />
                  상품거래처
                </label>
                <label style={{ fontSize: 14, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={isForwarder}
                    onChange={(e) => setIsForwarder(e.target.checked)}
                    style={{ marginRight: 6 }}
                  />
                  배대지
                </label>
                <label style={{ fontSize: 14, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={isCarryIn}
                    onChange={(e) => setIsCarryIn(e.target.checked)}
                    style={{ marginRight: 6 }}
                  />
                  휴대품반입
                </label>
                <label style={{ fontSize: 14, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={isCustomsBroker}
                    onChange={(e) => setIsCustomsBroker(e.target.checked)}
                    style={{ marginRight: 6 }}
                  />
                  관세사
                </label>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={styles.label}>메모</label>
              <textarea
                style={styles.textarea}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="필요한 내용을 적어줘"
              />
            </div>
          </div>
        </div>
      </SafeModal>

      <style jsx>{`
        @media (max-width: 1600px) {
          div[data-vendors-grid='true'] {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
        @media (max-width: 1280px) {
          div[data-vendors-grid='true'] {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 900px) {
          div[data-vendors-grid='true'] {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          div[data-vendors-grid='true'] {
            grid-template-columns: repeat(1, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  )
}