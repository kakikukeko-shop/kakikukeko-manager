'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SafeModal from '../components/SafeModal'
import BackupRestoreButtons from '../components/BackupRestoreButtons'

type SaleItemSummary = {
  qty: number | null
  purchase_items:
    | {
        item_name: string | null
      }
    | {
        item_name: string | null
      }[]
    | null
}

type SaleSummaryRow = {
  id: string
  sale_date: string | null
  final_amount: number | null
  profit_amount: number | null
  channel: string | null
  sales_channel: string | null
  memo: string | null
  sale_items: SaleItemSummary[] | null
}

type PurchaseItemSummary = {
  item_name: string | null
  qty: number | null
}

type PurchaseSummaryRow = {
  id: string
  purchase_date: string | null
  supplier: string | null
  total_amount: number | null
  memo: string | null
  purchase_items: PurchaseItemSummary[] | null
}


type PurchaseCostSummaryRow = {
  id: string
  purchase_id: string | null
  cost_date: string | null
  cost_type: string | null
  vendor_name: string | null
  amount: number | null
  currency: string | null
  fx_rate: number | null
  memo: string | null
}

type NormalizedSaleRow = SaleSummaryRow & {
  normalizedDate: string
}

type NormalizedPurchaseCostRow = PurchaseCostSummaryRow & {
  normalizedDate: string
  amountKrw: number
}

type NormalizedPurchaseRow = PurchaseSummaryRow & {
  normalizedDate: string
}

type MetricKind =
  | 'day_sales_profit'
  | 'month_sales_profit'
  | 'year_sales_profit'
  | 'total_sales'
  | 'total_sales_profit'
  | 'day_purchase'
  | 'month_purchase'
  | 'year_purchase'
  | 'total_purchase'
  | 'month_refund_loss'
  | 'total_refund_loss'

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

function fmtKRW(v: number) {
  return `${Math.round(v).toLocaleString('ko-KR')}원`
}

function getTodayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMonthKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function getYearKey() {
  return String(new Date().getFullYear())
}

function isInToday(dateStr: string) {
  return dateStr === getTodayKey()
}

function isInMonth(dateStr: string) {
  return dateStr.startsWith(getMonthKey())
}

function isInYear(dateStr: string) {
  return dateStr.startsWith(getYearKey())
}

function sortSalesAsc(rows: NormalizedSaleRow[]) {
  return [...rows].sort((a, b) => {
    if (a.normalizedDate && b.normalizedDate) {
      if (a.normalizedDate !== b.normalizedDate) return a.normalizedDate.localeCompare(b.normalizedDate)
    }
    return a.id.localeCompare(b.id)
  })
}

function sortPurchasesAsc(rows: NormalizedPurchaseRow[]) {
  return [...rows].sort((a, b) => {
    if (a.normalizedDate && b.normalizedDate) {
      if (a.normalizedDate !== b.normalizedDate) return a.normalizedDate.localeCompare(b.normalizedDate)
    }
    return a.id.localeCompare(b.id)
  })
}

function getSaleItemName(first: SaleItemSummary | undefined) {
  if (!first?.purchase_items) return '(상품명 없음)'
  if (Array.isArray(first.purchase_items)) {
    return first.purchase_items[0]?.item_name || '(상품명 없음)'
  }
  return first.purchase_items.item_name || '(상품명 없음)'
}


function purchaseCostToKrw(row: {
  amount: number | null
  currency: string | null
  fx_rate: number | null
}) {
  const amount = Number(row.amount || 0)
  const currency = String(row.currency || 'KRW').toUpperCase()
  const fxRate = Number(row.fx_rate || 0)

  if (currency === 'KRW' || !currency) return amount
  if (fxRate > 0) return amount * fxRate
  return amount
}


function normalizeCostType(raw: string | null | undefined) {
  const v = String(raw ?? '').trim()
  if (v === '배송비') return '배송비(거래처)'
  if (v === '관부과세및 배송비') return '관부과세'
  return v
}

function stripRefundMetaDetail(raw: string | null | undefined) {
  const text = (raw ?? '').trim()
  if (!text) return ''
  if (!text.startsWith('[환불 상세]')) return text

  const parts = text.split('\n\n')
  if (parts.length <= 1) return ''
  return parts.slice(1).join('\n\n').trim()
}

type RefundMetaItem = {
  item_id: string
  original_name: string
  original_qty: number
  original_line_total: number
  original_unit_price: number
  override_name: string
  override_qty: number
}

function parseRefundMetaItems(raw: string | null | undefined): RefundMetaItem[] {
  const text = (raw ?? '').trim()
  if (!text.startsWith('[환불 상세]')) return []

  const payload = text.split('\n\n')[0].replace('[환불 상세]', '').trim()
  if (!payload) return []

  try {
    const parsed = JSON.parse(payload)
    const items = Array.isArray(parsed?.items) ? parsed.items : []
    return items
      .map((item: any) => ({
        item_id: String(item?.item_id ?? ''),
        original_name: String(item?.original_name ?? ''),
        original_qty: Math.max(0, Math.floor(Number(item?.original_qty ?? 0))),
        original_line_total: Number(item?.original_line_total ?? 0),
        original_unit_price: Number(item?.original_unit_price ?? 0),
        override_name: String(item?.override_name ?? ''),
        override_qty: Math.max(0, Math.floor(Number(item?.override_qty ?? 0))),
      }))
      .filter((item: RefundMetaItem) => item.item_id)
  } catch {
    return []
  }
}

function getRefundItemLines(memo: string | null | undefined) {
  return parseRefundMetaItems(memo).map((item) => {
    const name = item.original_name || item.override_name || '(상품명 없음)'
    const refundedQty = Math.max(0, item.original_qty - item.override_qty)
    const target = Math.max(0, item.original_unit_price * refundedQty)

    return {
      name,
      originalQty: item.original_qty,
      nextQty: item.override_qty,
      refundedQty,
      targetKRW: target,
    }
  })
}

function getRefundUserMemo(memo: string | null | undefined) {
  const text = stripRefundMetaDetail(memo)
  if (!text) return ''

  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return false
      return !(
        trimmed.startsWith('환불 대상 원가:') ||
        trimmed.startsWith('실제 환불금액:') ||
        trimmed.startsWith('환불 차손:') ||
        trimmed.startsWith('환불 차익:') ||
        trimmed.startsWith('환불 원가조정:') ||
        trimmed.startsWith('초과 환불:')
      )
    })
    .join(' / ')
    .trim()
}

function parseRefundSummaryMemo(memo: string | null | undefined) {
  const raw = stripRefundMetaDetail(memo)

  const getNum = (label: string) => {
    const m = raw.match(new RegExp(`${label}:\\s*(-?[0-9.,]+)`))
    if (!m) return 0
    const value = Number(String(m[1]).replace(/,/g, ''))
    return Number.isFinite(value) ? value : 0
  }

  const legacyOverRefundKRW = getNum('초과 환불')
  const lossKRW = Math.max(0, getNum('환불 차손'))
  const profitKRW = Math.max(0, getNum('환불 차익') || legacyOverRefundKRW)
  const storedAdjustment = getNum('환불 원가조정')

  return {
    targetKRW: getNum('환불 대상 원가'),
    actualKRW: getNum('실제 환불금액'),
    lossKRW,
    profitKRW,
    adjustmentKRW:
      storedAdjustment !== 0
        ? storedAdjustment
        : lossKRW > 0
          ? lossKRW
          : profitKRW > 0
            ? -profitKRW
            : 0,
  }
}

function getRefundSummaryFromCost(row: NormalizedPurchaseCostRow) {
  const parsed = parseRefundSummaryMemo(row.memo)

  /*
   * 환불 비용 행의 amount는 보통 실제로 돌려받은 금액이 음수로 저장된다.
   * 따라서 메모에 실제 환불금액이 없더라도 amountKrw 절댓값을 실제 환불금액으로 쓴다.
   * 대상원가는 메모의 '환불 대상 원가'를 우선 쓰고,
   * 없으면 [환불 상세] 내부의 환불 수량 × 당시 단가 합계로 복구한다.
   */
  const refundItemTargetKRW = getRefundItemLines(row.memo).reduce(
    (sum, item) => sum + Number(item.targetKRW || 0),
    0
  )

  const targetKRW =
    parsed.targetKRW > 0
      ? parsed.targetKRW
      : Math.max(0, refundItemTargetKRW)

  const actualKRW =
    parsed.actualKRW > 0
      ? parsed.actualKRW
      : Math.abs(Number(row.amountKrw || 0))

  const difference = actualKRW - targetKRW
  const lossKRW = Math.max(0, -difference)
  const profitKRW = Math.max(0, difference)

  return {
    targetKRW,
    actualKRW,
    lossKRW,
    profitKRW,
    adjustmentKRW: difference,
  }
}


async function loadAllDashboardSales() {
  const data: SaleSummaryRow[] = []
  for (let offset = 0; ; offset += 500) {
    const result = await supabase
            .from('sales')
            .select(`
              id,
              sale_date,
              final_amount,
              profit_amount,
              channel,
              sales_channel,
              memo,
              sale_items (
                qty,
                purchase_items (
                  item_name
                )
              )
            `)
            .order('sale_date', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499)
    if (result.error) throw result.error
    const page = (result.data || []) as unknown as SaleSummaryRow[]
    data.push(...page)
    if (page.length < 500) return { data, error: null }
  }
}


async function loadAllDashboardPurchases() {
  const data: PurchaseSummaryRow[] = []
  for (let offset = 0; ; offset += 500) {
    const result = await supabase
            .from('purchase')
            .select(`
              id,
              purchase_date,
              supplier,
              total_amount,
              memo,
              purchase_items (
                item_name,
                qty
              )
            `)
            .order('purchase_date', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499)
    if (result.error) throw result.error
    const page = (result.data || []) as unknown as PurchaseSummaryRow[]
    data.push(...page)
    if (page.length < 500) return { data, error: null }
  }
}


async function loadAllDashboardCosts() {
  const data: PurchaseCostSummaryRow[] = []
  for (let offset = 0; ; offset += 500) {
    const result = await supabase
            .from('purchase_costs')
            .select(`
              id,
              purchase_id,
              cost_date,
              cost_type,
              vendor_name,
              amount,
              currency,
              fx_rate,
              memo
            `)
            .order('cost_date', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499)
    if (result.error) throw result.error
    const page = (result.data || []) as unknown as PurchaseCostSummaryRow[]
    data.push(...page)
    if (page.length < 500) return { data, error: null }
  }
}

export default function DashboardPage() {
  const [sales, setSales] = useState<SaleSummaryRow[]>([])
  const [purchases, setPurchases] = useState<PurchaseSummaryRow[]>([])
  const [purchaseCosts, setPurchaseCosts] = useState<PurchaseCostSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [metricModalOpen, setMetricModalOpen] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<MetricKind | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErr(null)

      try {
        const [salesRes, purchaseRes, purchaseCostRes] = await Promise.all([
          loadAllDashboardSales(),

          loadAllDashboardPurchases(),

          loadAllDashboardCosts(),
        ])

        if (salesRes.error) throw salesRes.error
        if (purchaseRes.error) throw purchaseRes.error
        if (purchaseCostRes.error) throw purchaseCostRes.error

        setSales((salesRes.data ?? []) as unknown as SaleSummaryRow[])
        setPurchases((purchaseRes.data ?? []) as unknown as PurchaseSummaryRow[])
        setPurchaseCosts((purchaseCostRes.data ?? []) as unknown as PurchaseCostSummaryRow[])
      } catch (e: any) {
        setErr(e?.message ?? String(e))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  // ✅ 하루 1번 자동백업
  useEffect(() => {
    async function autoBackupOncePerDay() {
      try {
        const key = 'last_auto_backup_date'
        const today = getTodayKey()
        const last = localStorage.getItem(key)

        if (last === today) return

        const res = await fetch('/api/backup?auto=1')
        const data = await res.json()

        if (res.ok && data?.ok) {
          localStorage.setItem(key, today)
        }
      } catch {
        // 자동백업 실패해도 화면은 그대로 사용
      }
    }

    autoBackupOncePerDay()
  }, [])

  const normalizedSales = useMemo<NormalizedSaleRow[]>(() => {
    return sales.map((row) => ({
      ...row,
      normalizedDate: normalizeDate(row.sale_date),
    }))
  }, [sales])

  const normalizedPurchases = useMemo<NormalizedPurchaseRow[]>(() => {
    return purchases.map((row) => ({
      ...row,
      normalizedDate: normalizeDate(row.purchase_date),
    }))
  }, [purchases])

  const purchaseDateById = useMemo(() => {
    const map = new Map<string, string>()
    normalizedPurchases.forEach((row) => {
      map.set(row.id, row.purchase_date || '미입력')
    })
    return map
  }, [normalizedPurchases])

  const normalizedPurchaseCosts = useMemo<NormalizedPurchaseCostRow[]>(() => {
    return purchaseCosts.map((row) => ({
      ...row,
      normalizedDate: normalizeDate(row.cost_date),
      amountKrw: purchaseCostToKrw(row),
    }))
  }, [purchaseCosts])

  const daySales = useMemo(
    () => sortSalesAsc(normalizedSales.filter((x) => x.normalizedDate && isInToday(x.normalizedDate))),
    [normalizedSales]
  )
  const monthSales = useMemo(
    () => sortSalesAsc(normalizedSales.filter((x) => x.normalizedDate && isInMonth(x.normalizedDate))),
    [normalizedSales]
  )
  const yearSales = useMemo(
    () => sortSalesAsc(normalizedSales.filter((x) => x.normalizedDate && isInYear(x.normalizedDate))),
    [normalizedSales]
  )

  const totalSalesRows = useMemo(() => sortSalesAsc(normalizedSales), [normalizedSales])

  const dayPurchases = useMemo(
    () => sortPurchasesAsc(normalizedPurchases.filter((x) => x.normalizedDate && isInToday(x.normalizedDate))),
    [normalizedPurchases]
  )
  const monthPurchases = useMemo(
    () => sortPurchasesAsc(normalizedPurchases.filter((x) => x.normalizedDate && isInMonth(x.normalizedDate))),
    [normalizedPurchases]
  )
  const yearPurchases = useMemo(
    () => sortPurchasesAsc(normalizedPurchases.filter((x) => x.normalizedDate && isInYear(x.normalizedDate))),
    [normalizedPurchases]
  )
  const totalPurchaseRows = useMemo(() => sortPurchasesAsc(normalizedPurchases), [normalizedPurchases])

  const dayPurchaseCosts = useMemo(
    () => normalizedPurchaseCosts.filter((x) => x.normalizedDate && isInToday(x.normalizedDate)),
    [normalizedPurchaseCosts]
  )
  const monthPurchaseCosts = useMemo(
    () => normalizedPurchaseCosts.filter((x) => x.normalizedDate && isInMonth(x.normalizedDate)),
    [normalizedPurchaseCosts]
  )
  const yearPurchaseCosts = useMemo(
    () => normalizedPurchaseCosts.filter((x) => x.normalizedDate && isInYear(x.normalizedDate)),
    [normalizedPurchaseCosts]
  )
  const totalPurchaseCostRows = useMemo(() => [...normalizedPurchaseCosts].sort((a, b) => {
    if (a.normalizedDate && b.normalizedDate) {
      if (a.normalizedDate !== b.normalizedDate) return a.normalizedDate.localeCompare(b.normalizedDate)
    }
    return a.id.localeCompare(b.id)
  }), [normalizedPurchaseCosts])

  const monthRefundCostRows = useMemo(
    () => monthPurchaseCosts.filter((x) => normalizeCostType(x.cost_type) === '환불'),
    [monthPurchaseCosts]
  )

  const totalRefundCostRows = useMemo(
    () => totalPurchaseCostRows.filter((x) => normalizeCostType(x.cost_type) === '환불'),
    [totalPurchaseCostRows]
  )

  const summary = useMemo(() => {
    const dayProfit = daySales.reduce((sum, row) => sum + Number(row.profit_amount || 0), 0)
    const monthProfit = monthSales.reduce((sum, row) => sum + Number(row.profit_amount || 0), 0)
    const yearProfit = yearSales.reduce((sum, row) => sum + Number(row.profit_amount || 0), 0)
    const totalSales = totalSalesRows.reduce((sum, row) => sum + Number(row.final_amount || 0), 0)
    const totalSalesProfit = totalSalesRows.reduce((sum, row) => sum + Number(row.profit_amount || 0), 0)

    const dayPurchase =
      dayPurchases.reduce((sum, row) => sum + Number(row.total_amount || 0), 0) +
      dayPurchaseCosts.reduce((sum, row) => sum + Number(row.amountKrw || 0), 0)
    const monthPurchase =
      monthPurchases.reduce((sum, row) => sum + Number(row.total_amount || 0), 0) +
      monthPurchaseCosts.reduce((sum, row) => sum + Number(row.amountKrw || 0), 0)
    const yearPurchase =
      yearPurchases.reduce((sum, row) => sum + Number(row.total_amount || 0), 0) +
      yearPurchaseCosts.reduce((sum, row) => sum + Number(row.amountKrw || 0), 0)
    const totalPurchase =
      totalPurchaseRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0) +
      totalPurchaseCostRows.reduce((sum, row) => sum + Number(row.amountKrw || 0), 0)

    const monthRefundActual = monthRefundCostRows.reduce(
      (sum, row) => sum + getRefundSummaryFromCost(row).actualKRW,
      0
    )
    const monthRefundLoss = monthRefundCostRows.reduce(
      (sum, row) => sum + getRefundSummaryFromCost(row).lossKRW,
      0
    )
    const monthRefundProfit = monthRefundCostRows.reduce(
      (sum, row) => sum + getRefundSummaryFromCost(row).profitKRW,
      0
    )
    const totalRefundActual = totalRefundCostRows.reduce(
      (sum, row) => sum + getRefundSummaryFromCost(row).actualKRW,
      0
    )
    const totalRefundLoss = totalRefundCostRows.reduce(
      (sum, row) => sum + getRefundSummaryFromCost(row).lossKRW,
      0
    )
    const totalRefundProfit = totalRefundCostRows.reduce(
      (sum, row) => sum + getRefundSummaryFromCost(row).profitKRW,
      0
    )

    return {
      dayProfit,
      monthProfit,
      yearProfit,
      totalSales,
      totalSalesProfit,
      dayPurchase,
      monthPurchase,
      yearPurchase,
      totalPurchase,
      monthRefundActual,
      monthRefundLoss,
      monthRefundProfit,
      totalRefundActual,
      totalRefundLoss,
      totalRefundProfit,
    }
  }, [daySales, monthSales, yearSales, totalSalesRows, dayPurchases, monthPurchases, yearPurchases, totalPurchaseRows, dayPurchaseCosts, monthPurchaseCosts, yearPurchaseCosts, totalPurchaseCostRows, monthRefundCostRows, totalRefundCostRows])

  const salesCards = [
    {
      key: 'day_sales_profit' as const,
      title: '하루 매출(순수익)',
      value: fmtKRW(summary.dayProfit),
      bg: '#ede9fe',
      color: '#5b21b6',
    },
    {
      key: 'month_sales_profit' as const,
      title: '월 매출(순수익)',
      value: fmtKRW(summary.monthProfit),
      bg: '#ede9fe',
      color: '#5b21b6',
    },
    {
      key: 'year_sales_profit' as const,
      title: '연 매출(순수익)',
      value: fmtKRW(summary.yearProfit),
      bg: '#ede9fe',
      color: '#5b21b6',
    },
    {
      key: 'total_sales' as const,
      title: '총 매출',
      value: fmtKRW(summary.totalSales),
      bg: '#ddd6fe',
      color: '#6d28d9',
    },
    {
      key: 'total_sales_profit' as const,
      title: '총 매출(순수익)',
      value: fmtKRW(summary.totalSalesProfit),
      bg: '#ede9fe',
      color: '#5b21b6',
    },
  ]

  const purchaseCards = [
    {
      key: 'day_purchase' as const,
      title: '하루 매입',
      value: fmtKRW(summary.dayPurchase),
      bg: '#dcfce7',
      color: '#166534',
    },
    {
      key: 'month_purchase' as const,
      title: '월 매입',
      value: fmtKRW(summary.monthPurchase),
      bg: '#dcfce7',
      color: '#166534',
    },
    {
      key: 'year_purchase' as const,
      title: '연 매입',
      value: fmtKRW(summary.yearPurchase),
      bg: '#dcfce7',
      color: '#166534',
    },
    {
      key: 'total_purchase' as const,
      title: '총 매입',
      value: fmtKRW(summary.totalPurchase),
      bg: '#bbf7d0',
      color: '#166534',
    },
    {
      key: 'month_refund_loss' as const,
      title: '월 매입 환불',
      value: `차손 ${fmtKRW(summary.monthRefundLoss)}`,
      subValue: `환불 ${fmtKRW(summary.monthRefundActual)} · 차익 ${fmtKRW(summary.monthRefundProfit)}`,
      bg: '#fee2e2',
      color: '#991b1b',
    },
    {
      key: 'total_refund_loss' as const,
      title: '총 매입 환불',
      value: `차손 ${fmtKRW(summary.totalRefundLoss)}`,
      subValue: `환불 ${fmtKRW(summary.totalRefundActual)} · 차익 ${fmtKRW(summary.totalRefundProfit)}`,
      bg: '#ffedd5',
      color: '#9a3412',
    },
  ]

  const modalTitle = useMemo(() => {
    switch (selectedMetric) {
      case 'day_sales_profit':
        return '오늘 매출 내역'
      case 'month_sales_profit':
        return '이번 달 매출 내역'
      case 'year_sales_profit':
        return '올해 매출 내역'
      case 'total_sales':
        return '전체 매출 내역'
      case 'total_sales_profit':
        return '전체 매출(순수익) 내역'
      case 'day_purchase':
        return '오늘 매입 내역'
      case 'month_purchase':
        return '이번 달 매입 내역'
      case 'year_purchase':
        return '올해 매입 내역'
      case 'total_purchase':
        return '전체 매입 내역'
      case 'month_refund_loss':
        return '이번 달 매입 환불·차손·차익 내역'
      case 'total_refund_loss':
        return '전체 매입 환불·차손·차익 내역'
      default:
        return ''
    }
  }, [selectedMetric])

  const selectedSalesRows = useMemo(() => {
    switch (selectedMetric) {
      case 'day_sales_profit':
        return daySales
      case 'month_sales_profit':
        return monthSales
      case 'year_sales_profit':
        return yearSales
      case 'total_sales':
        return totalSalesRows
      case 'total_sales_profit':
        return totalSalesRows
      default:
        return []
    }
  }, [selectedMetric, daySales, monthSales, yearSales, totalSalesRows])

  const selectedPurchaseRows = useMemo(() => {
    switch (selectedMetric) {
      case 'day_purchase':
        return dayPurchases
      case 'month_purchase':
        return monthPurchases
      case 'year_purchase':
        return yearPurchases
      case 'total_purchase':
        return totalPurchaseRows
      case 'month_refund_loss':
      case 'total_refund_loss':
        return []
      default:
        return []
    }
  }, [selectedMetric, dayPurchases, monthPurchases, yearPurchases, totalPurchaseRows])

  const selectedPurchaseCostRows = useMemo(() => {
    switch (selectedMetric) {
      case 'day_purchase':
        return dayPurchaseCosts
      case 'month_purchase':
        return monthPurchaseCosts
      case 'year_purchase':
        return yearPurchaseCosts
      case 'total_purchase':
        return totalPurchaseCostRows
      case 'month_refund_loss':
        return monthRefundCostRows
      case 'total_refund_loss':
        return totalRefundCostRows
      default:
        return []
    }
  }, [selectedMetric, dayPurchaseCosts, monthPurchaseCosts, yearPurchaseCosts, totalPurchaseCostRows, monthRefundCostRows, totalRefundCostRows])

  const isSalesModal =
    selectedMetric === 'day_sales_profit' ||
    selectedMetric === 'month_sales_profit' ||
    selectedMetric === 'year_sales_profit' ||
    selectedMetric === 'total_sales' ||
    selectedMetric === 'total_sales_profit'

  return (
    <div style={{ display: 'grid', gap: 18 }} data-page="dashboard">
      <section
        data-tablet-role="dashboard-hero"
        data-mobile-role="dashboard-hero"
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 24,
          padding: 24,
          boxShadow: '0 10px 30px rgba(124, 58, 237, 0.06)',
          display: 'grid',
          gridTemplateColumns: '1fr 420px',
          gap: 18,
          alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            data-mobile-role="dashboard-title"
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: '#312e81',
              marginBottom: 8,
            }}
          >
            대시보드
          </div>

          <div
            data-mobile-role="dashboard-subtitle"
            style={{
              fontSize: 15,
              color: '#4b5563',
              fontWeight: 600,
            }}
          >
            오늘/이번달/올해/누적 기준으로 매출과 매입을 한눈에 볼 수 있어.
          </div>
        </div>

        <div
          data-mobile-role="dashboard-backup"
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 20,
            padding: '14px 16px',
            background: '#fcfcff',
            boxShadow: '0 8px 24px rgba(124, 58, 237, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            minWidth: 0,
          }}
        >
          <div style={{ display: 'grid', gap: 4, flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 900,
                color: '#312e81',
                lineHeight: 1.2,
              }}
            >
              백업관리
            </div>

            <div
              style={{
                fontSize: 12,
                color: '#6b7280',
                fontWeight: 700,
                lineHeight: 1.5,
              }}
            >
              자동백업(하루 1회 저장) / 백업 다운로드 / 복구
            </div>
          </div>

          <BackupRestoreButtons />
        </div>
      </section>

      {err ? (
        <section
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: 18,
            padding: 16,
            fontWeight: 800,
          }}
        >
          오류: {err}
        </section>
      ) : null}

      <SalesCalendar purchases={normalizedPurchases} costs={normalizedPurchaseCosts} sales={normalizedSales} loading={loading} error={err} />

      <section
        data-mobile-role="dashboard-sales-cards"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        {salesCards.map((card) => (
          <button
            key={card.key}
            data-mobile-role="dashboard-metric-card"
            type="button"
            onClick={() => {
              setSelectedMetric(card.key)
              setMetricModalOpen(true)
            }}
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 22,
              padding: 18,
              boxShadow: '0 10px 24px rgba(124, 58, 237, 0.05)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '5px 10px',
                borderRadius: 999,
                background: card.bg,
                color: card.color,
                fontSize: 12,
                fontWeight: 900,
                marginBottom: 12,
              }}
            >
              {card.title}
            </div>

            <div
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: '#111827',
              }}
            >
              {loading ? '불러오는 중...' : card.value}
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                fontWeight: 800,
                color: '#6b7280',
              }}
            >
              클릭해서 해당 내역 보기
            </div>
          </button>
        ))}
      </section>

      <section
        data-mobile-role="dashboard-purchase-cards"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        {purchaseCards.map((card) => (
          <button
            key={card.key}
            data-mobile-role="dashboard-metric-card"
            type="button"
            onClick={() => {
              setSelectedMetric(card.key)
              setMetricModalOpen(true)
            }}
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 22,
              padding: 18,
              boxShadow: '0 10px 24px rgba(124, 58, 237, 0.05)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '5px 10px',
                borderRadius: 999,
                background: card.bg,
                color: card.color,
                fontSize: 12,
                fontWeight: 900,
                marginBottom: 12,
              }}
            >
              {card.title}
            </div>

            <div
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: '#111827',
              }}
            >
              {loading ? '불러오는 중...' : card.value}
            </div>

            {'subValue' in card && card.subValue ? (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  fontWeight: 900,
                  color: card.color,
                }}
              >
                {loading ? '' : card.subValue}
              </div>
            ) : null}

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                fontWeight: 800,
                color: '#6b7280',
              }}
            >
              클릭해서 해당 내역 보기
            </div>
          </button>
        ))}
      </section>


      <style jsx global>{`
        @media (max-width: 699px) {
          [data-page="dashboard"] {
            gap: 10px !important;
            width: 100% !important;
            max-width: 100vw !important;
            overflow-x: hidden !important;
          }

          [data-page="dashboard"] * {
            box-sizing: border-box;
            min-width: 0;
          }

          /* 상단 대시보드 소개는 모바일에서 최대한 얇게 */
          [data-page="dashboard"] [data-mobile-role="dashboard-hero"] {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 8px !important;
            padding: 12px !important;
            border-radius: 16px !important;
          }

          [data-page="dashboard"] [data-mobile-role="dashboard-title"] {
            font-size: 20px !important;
            margin-bottom: 2px !important;
          }

          [data-page="dashboard"] [data-mobile-role="dashboard-subtitle"] {
            font-size: 12px !important;
            line-height: 1.45 !important;
          }

          [data-page="dashboard"] [data-mobile-role="dashboard-backup"] {
            padding: 10px !important;
            border-radius: 14px !important;
            gap: 8px !important;
            align-items: flex-start !important;
          }

          [data-page="dashboard"] [data-mobile-role="dashboard-backup"] > div:first-child > div:first-child {
            font-size: 14px !important;
          }

          [data-page="dashboard"] [data-mobile-role="dashboard-backup"] > div:first-child > div:last-child {
            font-size: 10px !important;
            line-height: 1.35 !important;
          }

          /* 매출/매입 요약카드: 한 줄에 두 개 */
          [data-page="dashboard"] [data-mobile-role="dashboard-sales-cards"],
          [data-page="dashboard"] [data-mobile-role="dashboard-purchase-cards"] {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          [data-page="dashboard"] [data-mobile-role="dashboard-metric-card"] {
            padding: 11px !important;
            border-radius: 15px !important;
            min-height: 104px !important;
            box-shadow: none !important;
          }

          [data-page="dashboard"] [data-mobile-role="dashboard-metric-card"] > div:first-child {
            font-size: 10px !important;
            padding: 3px 7px !important;
            margin-bottom: 7px !important;
          }

          [data-page="dashboard"] [data-mobile-role="dashboard-metric-card"] > div:nth-child(2) {
            font-size: 18px !important;
            line-height: 1.2 !important;
            overflow-wrap: anywhere !important;
          }

          [data-page="dashboard"] [data-mobile-role="dashboard-metric-card"] > div:nth-last-child(1) {
            margin-top: 6px !important;
            font-size: 10px !important;
          }

          /* 환불 카드의 보조금액 */
          [data-page="dashboard"] [data-mobile-role="dashboard-purchase-cards"]
          [data-mobile-role="dashboard-metric-card"] > div:nth-child(3) {
            font-size: 10px !important;
            line-height: 1.35 !important;
            margin-top: 5px !important;
            overflow-wrap: anywhere !important;
          }


          /* iPhone에서 모달이 화면 밖으로 나가지 않게 */
          [role="dialog"] {
            width: calc(100vw - 16px) !important;
            max-width: calc(100vw - 16px) !important;
            max-height: calc(100dvh - 24px) !important;
            overflow: auto !important;
          }

          [role="dialog"] > * {
            max-width: 100% !important;
            min-width: 0 !important;
          }

          [role="dialog"] a,
          [role="dialog"] button {
            max-width: 100% !important;
          }
        }

        @media (min-width: 700px) and (max-width: 1180px) {
          [data-page="dashboard"] [data-tablet-role="dashboard-hero"] {
            grid-template-columns: minmax(0, 1fr) 360px !important;
          }
        }
      `}</style>

      <SafeModal
        open={metricModalOpen}
        title={selectedMetric ? modalTitle : ''}
        onClose={() => {
          setMetricModalOpen(false)
          setSelectedMetric(null)
        }}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {isSalesModal ? (
            selectedSalesRows.length === 0 ? (
              <div style={{ color: '#6b7280', fontWeight: 700 }}>해당 기간 매출 내역이 없어.</div>
            ) : (
              selectedSalesRows.map((row) => {
                const first = row.sale_items?.[0]
                const itemName = getSaleItemName(first)
                const channel = row.channel || row.sales_channel || '미입력'
                return (
                  <div
                    key={row.id}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 16,
                      padding: 14,
                      background: '#fff',
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: 15 }}>{itemName}</div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 13,
                        color: '#6b7280',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      판매일 {row.sale_date || '미입력'} / {channel} / 수량 {first?.qty || 0}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800 }}>
                      실입금 {fmtKRW(Number(row.final_amount || 0))} / 순수익 {fmtKRW(Number(row.profit_amount || 0))}
                    </div>
                    {stripRefundMetaDetail(row.memo) ? (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: '#4b5563',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        메모: {stripRefundMetaDetail(row.memo)}
                      </div>
                    ) : null}
                  </div>
                )
              })
            )
          ) : selectedPurchaseRows.length === 0 && selectedPurchaseCostRows.length === 0 ? (
            <div style={{ color: '#6b7280', fontWeight: 700 }}>해당 기간 매입 내역이 없어.</div>
          ) : (
            <>
              {selectedPurchaseRows.map((row) => {
                const first = row.purchase_items?.[0]
                const itemName = first?.item_name || '(상품명 없음)'
                return (
                  <div
                    key={`purchase-${row.id}`}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 16,
                      padding: 14,
                      background: '#fff',
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: 15 }}>{itemName}</div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 13,
                        color: '#6b7280',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      거래처 {row.supplier || '미입력'} / 매입일 {row.purchase_date || '미입력'} / 수량 {first?.qty || 0}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800 }}>
                      상품매입 {fmtKRW(Number(row.total_amount || 0))}
                    </div>
                    {stripRefundMetaDetail(row.memo) ? (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: '#4b5563',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        메모: {stripRefundMetaDetail(row.memo)}
                      </div>
                    ) : null}
                  </div>
                )
              })}

              {selectedPurchaseCostRows.map((row) => (
                <div
                  key={`cost-${row.id}`}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 16,
                    padding: 14,
                    background: '#fff',
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: 15 }}>
                    추가비용 · {row.cost_type || '미입력'}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      color: '#6b7280',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {normalizeCostType(row.cost_type) === '환불' ? (
                      <>
                        거래처 {row.vendor_name || '미입력'} / 결제일 {purchaseDateById.get(row.purchase_id || '') || '미입력'} / 환불일 {row.cost_date || '미입력'}
                      </>
                    ) : (
                      <>거래처 {row.vendor_name || '미입력'} / 비용일 {row.cost_date || '미입력'}</>
                    )}
                  </div>
                  {normalizeCostType(row.cost_type) === '환불' ? (
                    <>
                      {getRefundItemLines(row.memo).length > 0 ? (
                        <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                          {getRefundItemLines(row.memo).map((item, idx) => (
                            <div key={`${row.id}-refund-item-${idx}`} style={{ fontSize: 13, color: '#374151', fontWeight: 800 }}>
                              {item.name} / 환불수량 {item.refundedQty}개 ({item.originalQty} → {item.nextQty})
                              {item.targetKRW > 0 ? ` / 대상원가 ${fmtKRW(item.targetKRW)}` : ''}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280', fontWeight: 800 }}>
                          상품명 기록 없음
                        </div>
                      )}
                      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900 }}>
                        실제 환불 {fmtKRW(getRefundSummaryFromCost(row).actualKRW)} / 차손{' '}
                        {fmtKRW(getRefundSummaryFromCost(row).lossKRW)} / 차익{' '}
                        {fmtKRW(getRefundSummaryFromCost(row).profitKRW)}
                      </div>
                    </>
                  ) : (
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800 }}>
                      추가비용 {fmtKRW(Number(row.amountKrw || 0))}
                    </div>
                  )}
                  {getRefundUserMemo(row.memo) ? (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        color: '#4b5563',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      메모: {getRefundUserMemo(row.memo)}
                    </div>
                  ) : null}
                </div>
              ))}
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <Link
              href={isSalesModal ? '/sales' : '/documents'}
              style={{
                textDecoration: 'none',
                padding: '10px 14px',
                borderRadius: 12,
                background: '#7c3aed',
                color: '#fff',
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              {isSalesModal ? '매출관리로 이동' : '매입관리로 이동'}
            </Link>
          </div>
        </div>
      </SafeModal>
    </div>
  )
}

function koreaDateKey() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = (type: string) => parts.find(part => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}
function calendarDays(month: string) {
  const [year, number] = month.split('-').map(Number)
  const start = new Date(year, number - 1, 1).getDay()
  const length = new Date(year, number, 0).getDate()
  return Array.from({ length: Math.ceil((start + length) / 7) * 7 }, (_, index) => {
    const day = index - start + 1
    return day >= 1 && day <= length ? `${month}-${String(day).padStart(2, '0')}` : ''
  })
}
function SalesCalendar({ sales, purchases, costs, loading, error }: { sales: NormalizedSaleRow[]; purchases: NormalizedPurchaseRow[]; costs: NormalizedPurchaseCostRow[]; loading: boolean; error: string | null }) {
  const [today, setToday] = useState(koreaDateKey)
  const [month, setMonth] = useState(() => koreaDateKey().slice(0, 7))
  const [selected, setSelected] = useState<string | null>(null)
  const [monthSalesOpen, setMonthSalesOpen] = useState(false)
  const [monthPurchasesOpen, setMonthPurchasesOpen] = useState(false)
  useEffect(() => { const timer = window.setInterval(() => setToday(koreaDateKey()), 30000); return () => window.clearInterval(timer) }, [])
  const days = useMemo(() => calendarDays(month), [month])
  const byDate = useMemo(() => {
    const map = new Map<string, NormalizedSaleRow[]>()
    sales.forEach(row => { if (row.normalizedDate) map.set(row.normalizedDate, [...(map.get(row.normalizedDate) || []), row]) })
    return map
  }, [sales])
  const purchaseByDate = useMemo(() => {
    const map = new Map<string, { amount: number; goods: NormalizedPurchaseRow[]; costs: NormalizedPurchaseCostRow[] }>()
    const entry = (date: string) => { if (!map.has(date)) map.set(date, { amount: 0, goods: [], costs: [] }); return map.get(date)! }
    purchases.forEach(row => { if (row.normalizedDate) { const day = entry(row.normalizedDate); day.amount += Number(row.total_amount || 0); day.goods.push(row) } })
    costs.forEach(row => { if (row.normalizedDate) { const day = entry(row.normalizedDate); day.amount += Number(row.amountKrw || 0); day.costs.push(row) } })
    return map
  }, [purchases, costs])
  const monthPurchase = [...purchaseByDate.entries()].filter(([date]) => date.startsWith(`${month}-`)).reduce((sum, [, day]) => sum + day.amount, 0)
  const selectedPurchase = purchaseByDate.get(selected || '')
  const monthRows = sales.filter(row => row.normalizedDate.startsWith(`${month}-`))
  const total = (rows: NormalizedSaleRow[], field: 'final_amount' | 'profit_amount') => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0)
  const move = (offset: number) => { const [year, number] = month.split('-').map(Number); const date = new Date(year, number - 1 + offset, 1); setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`) }
  const control = { border: '1px solid #ddd6fe', background: '#fff', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', fontWeight: 800 } as const
  return <section data-mobile-calendar style={{ background: '#fff', padding: 14, borderRadius: 20, border: '1px solid #ede9fe', backgroundImage: 'linear-gradient(135deg, #ffffff, #faf8ff)', minWidth: 0 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>월별 매출 / 매입 달력</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><button style={control} aria-label="이전 달" onClick={() => move(-1)}>‹</button><input type="month" aria-label="조회 월" value={month} onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value) }} style={{ ...control, minWidth: 140 }} /><button style={control} aria-label="다음 달" onClick={() => move(1)}>›</button><button style={control} onClick={() => { setToday(koreaDateKey()); setMonth(koreaDateKey().slice(0, 7)) }}>이번 달</button></div>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, margin: '10px 0', padding: 10, background: '#f5f3ff', borderRadius: 12 }}>
      <div>월 매출 <b>{loading ? '불러오는 중…' : error ? '조회 실패' : fmtKRW(total(monthRows, 'final_amount'))}</b></div>
      <div>월 매출이익 <b style={{ color: total(monthRows, 'profit_amount') < 0 ? '#b91c1c' : '#6d28d9' }}>{loading ? '불러오는 중…' : error ? '조회 실패' : fmtKRW(total(monthRows, 'profit_amount'))}</b></div>
      <div>월 매입 <b style={{ color: '#0f766e' }}>{loading ? '불러오는 중…' : error ? '조회 실패' : fmtKRW(monthPurchase)}</b></div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16, fontSize: 'inherit' }}>
      <button type="button" disabled={loading || !!error} onClick={() => setMonthSalesOpen(true)} style={{ border: 0, background: 'transparent', padding: 0, color: '#4338ca', cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit', fontWeight: 700, textDecoration: 'none' }}>{loading || error ? '—' : `${monthRows.length}건 판매`}</button>
      <button type="button" title="상품 매입 등록 건수예요. 추가비용·환불은 건수에서 제외해요." disabled={loading || !!error} onClick={() => setMonthPurchasesOpen(true)} style={{ border: 0, background: 'transparent', padding: 0, color: '#0f766e', cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit', fontWeight: 700, textDecoration: 'none' }}>{loading || error ? '—' : `${purchases.filter(row => row.normalizedDate.startsWith(`${month}-`)).length}건 매입`}</button>
      </div>
    </div>
    <p style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4, margin: '8px 0' }}>판매일 기준 · 매출은 실입금액, 이익은 매출관리의 저장값이에요(운영비 차감 전). 매입은 매입일의 상품금액 + 비용일의 추가비용(환불 차감)이에요. 날짜를 누르면 내역을 볼 수 있어요.</p>
    {loading || error ? <div role="status" style={{ padding: 24 }}>{loading ? '매출 내역을 불러오는 중이에요.' : '매출을 불러오지 못했어요. 새로고침해 주세요.'}</div> : <div style={{ overflowX: 'auto' }}><div data-calendar-grid style={{ minWidth: 560, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
      {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => <div key={day} style={{ padding: 4, textAlign: 'center', fontWeight: 800, color: index === 0 ? '#b91c1c' : index === 6 ? '#2563eb' : '#6b7280' }}>{day}</div>)}
      {days.map((date, index) => {
        const rows = byDate.get(date) || []
        const purchase = purchaseByDate.get(date)
        const isToday = date === today
        return date ? <button data-calendar-day key={date} aria-label={`${date}${isToday ? ' 오늘' : ''}, 매출 ${fmtKRW(total(rows, 'final_amount'))}, 매출이익 ${fmtKRW(total(rows, 'profit_amount'))}, 매입 ${fmtKRW(purchase?.amount || 0)}`} aria-current={isToday ? 'date' : undefined} onClick={() => setSelected(date)} style={{ textAlign: 'left', minHeight: 72, minWidth: 0, padding: '6px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', border: isToday ? '2px solid #7c3aed' : '1px solid #eeeaf5', borderRadius: 12, background: isToday ? '#ede9fe' : rows.length || purchase ? '#fff' : '#faf9fc', cursor: 'pointer', overflowWrap: 'anywhere' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, fontWeight: isToday ? 900 : 700, color: index % 7 === 0 ? '#b91c1c' : index % 7 === 6 ? '#2563eb' : '#111827' }}>{Number(date.slice(-2))}{isToday ? <span style={{ background: '#7c3aed', color: '#fff', padding: '2px 5px', borderRadius: 6, fontSize: 10 }}>오늘</span> : null}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '2px 8px', width: '100%', marginTop: 5, fontSize: 11, lineHeight: 1.5 }}>
            <div>{rows.length ? <><div>매출 <b>{fmtKRW(total(rows, 'final_amount'))}</b></div><div style={{ color: total(rows, 'profit_amount') < 0 ? '#b91c1c' : '#6d28d9' }}>이익 <b>{fmtKRW(total(rows, 'profit_amount'))}</b></div></> : <span style={{ color: '#d1cbdc' }}>—</span>}</div>
            {purchase ? <div style={{ color: '#0f766e' }}>매입 <b>{fmtKRW(purchase.amount)}</b></div> : null}
          </div>
        </button> : <div key={`empty-${index}`} style={{ background: '#fafafa', borderRadius: 10 }} />
      })}
    </div></div>}
    <style>{`@media(max-width:699px){
[data-calendar-modal]{font-size:12px!important;line-height:1.5!important;min-width:0;overflow-wrap:anywhere}
[data-calendar-modal] *{min-width:0;max-width:100%;box-sizing:border-box}
[data-calendar-modal]>div{grid-template-columns:minmax(0,1fr)!important;gap:4px!important;padding:9px 0!important}
[data-calendar-modal]>div>b{font-size:11px!important}
[data-calendar-modal]>div>div{font-size:12px!important;line-height:1.5!important}
[data-calendar-modal] b{font-size:12px!important}
[role=dialog]:has([data-calendar-modal]){max-width:calc(100vw - 24px)!important;max-height:85dvh!important;overflow-y:auto!important}
[role=dialog]:has([data-calendar-modal]) h2{font-size:16px!important}
[data-mobile-calendar]{padding:8px!important;border-radius:14px!important}
[data-mobile-calendar] h2{font-size:15px!important}
[data-mobile-calendar]>div:first-child{gap:8px!important}
[data-mobile-calendar]>div:first-child>div{gap:4px!important;max-width:100%}
[data-mobile-calendar] input[type=month]{min-width:0!important;width:126px;font-size:12px}
[data-mobile-calendar]>div:first-child button{padding:6px 8px!important;font-size:12px}
[data-mobile-calendar]>div:nth-child(2){font-size:12px;gap:8px!important;padding:8px!important}
[data-mobile-calendar]>p{font-size:10px!important}
[data-calendar-grid]{min-width:0!important;width:100%;gap:2px!important}
[data-calendar-grid]>div{font-size:10px}
[data-calendar-day]{padding:4px 2px!important;border-radius:7px!important;min-height:94px!important;font-size:11px;overflow:hidden;}
[data-calendar-day]>div:first-child{gap:1px!important;font-size:11px}
[data-calendar-day]>div:first-child span{font-size:8px!important;padding:1px 2px!important}
[data-calendar-day]>div:nth-child(2){display:block!important;font-size:8px!important;line-height:1.4!important;letter-spacing:-.4px}
[data-calendar-day] b{display:block;white-space:normal;overflow-wrap:anywhere}
}`}</style>
    <SafeModal open={monthSalesOpen} title={`${month} 판매 상품`} onClose={() => setMonthSalesOpen(false)}><div data-calendar-modal style={{ display: 'grid', gap: 10 }}>
      {!monthRows.length ? <p>이 달에는 판매 내역이 없어요.</p> : [...monthRows].sort((a, b) => b.normalizedDate.localeCompare(a.normalizedDate) || a.id.localeCompare(b.id)).map(row => <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: 12, padding: '12px 0', borderBottom: '1px solid #ede9fe' }}><b style={{ color: '#6d28d9', fontSize: 13 }}>{row.normalizedDate}</b><div style={{ overflowWrap: 'anywhere', lineHeight: 1.6 }}>{row.sale_items?.length ? row.sale_items.map((item, index) => <div key={index}>{getSaleItemName(item)}</div>) : '상품명 기록 없음'}<b style={{ display: 'block', marginTop: 5 }}>매출 {fmtKRW(Number(row.final_amount || 0))}</b></div></div>)}
    </div></SafeModal>
    <SafeModal open={monthPurchasesOpen} title={`${month} 매입 상품`} onClose={() => setMonthPurchasesOpen(false)}><div data-calendar-modal style={{ display: 'grid', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>상품 매입금액 기준이에요. 달력의 월 매입 합계에는 추가비용·환불도 포함돼요.</p>
      {!purchases.some(row => row.normalizedDate.startsWith(`${month}-`)) ? <p>이 달에는 상품 매입 내역이 없어요.</p> : purchases.filter(row => row.normalizedDate.startsWith(`${month}-`)).sort((a, b) => b.normalizedDate.localeCompare(a.normalizedDate) || a.id.localeCompare(b.id)).map(row => <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: 12, padding: '12px 0', borderBottom: '1px solid #ccfbf1' }}><b style={{ color: '#0f766e', fontSize: 13 }}>{row.normalizedDate}</b><div style={{ overflowWrap: 'anywhere', lineHeight: 1.6 }}>{row.purchase_items?.length ? row.purchase_items.map((item, index) => <div key={index}>{item.item_name || '상품명 기록 없음'}</div>) : '상품명 기록 없음'}<b style={{ display: 'block', marginTop: 5 }}>상품매입 {fmtKRW(Number(row.total_amount || 0))}</b></div></div>)}
    </div></SafeModal>
    <SafeModal open={!!selected} title={`${selected || ''} 매출 / 매입 내역`} onClose={() => setSelected(null)}><div data-calendar-modal style={{ display: 'grid', gap: 12 }}>
      <b>매출 {fmtKRW(total(byDate.get(selected || '') || [], 'final_amount'))} · 매출이익 {fmtKRW(total(byDate.get(selected || '') || [], 'profit_amount'))}</b>
      {!(byDate.get(selected || '') || []).length ? <p>이 날짜에는 판매 내역이 없어요.</p> : (byDate.get(selected || '') || []).map(row => <div key={row.id} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 10 }}>
        <div style={{ fontWeight: 800 }}>{row.channel || row.sales_channel || '판매처 미입력'}</div>
        {(row.sale_items || []).map((item, index) => <div key={index} style={{ marginTop: 5 }}>{getSaleItemName(item)} · {item.qty || 0}개</div>)}
        <div style={{ marginTop: 8 }}>매출 {fmtKRW(Number(row.final_amount || 0))} · 매출이익 {fmtKRW(Number(row.profit_amount || 0))}</div>
      </div>)}
      <h3 style={{ margin: '8px 0 0', color: '#0f766e' }}>매입 {fmtKRW(selectedPurchase?.amount || 0)}</h3>
      {!selectedPurchase ? <p>이 날짜에는 매입 내역이 없어요.</p> : <>
        {selectedPurchase.goods.map(row => <div key={row.id} style={{ padding: 10, background: '#f0fdfa', borderRadius: 10 }}><b>{row.supplier || '거래처 미입력'} · 상품매입 {fmtKRW(Number(row.total_amount || 0))}</b>{(row.purchase_items || []).map((item, index) => <div key={index}>{item.item_name || '상품명 없음'} · {item.qty || 0}개</div>)}</div>)}
        {selectedPurchase.costs.map(row => <div key={row.id} style={{ padding: 10, background: '#f0fdfa', borderRadius: 10 }}>{row.cost_type || '추가비용'} · {row.vendor_name || '거래처 미입력'} · <b>{fmtKRW(row.amountKrw)}</b></div>)}
      </>}
      <div style={{ display: 'flex', gap: 16 }}><Link href="/sales">매출관리로 이동</Link><Link href="/documents">매입관리로 이동</Link></div>
    </div></SafeModal>
  </section>
}
