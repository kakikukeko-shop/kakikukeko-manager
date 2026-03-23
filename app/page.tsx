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

type NormalizedSaleRow = SaleSummaryRow & {
  normalizedDate: string
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

const navCards = [
  {
    href: '/documents',
    title: '매입관리',
    desc: '매입 등록, 상품 입력, 추가비용 자동분배',
  },
  {
    href: '/products',
    title: '상품 / 재고관리',
    desc: '입고완료, 현재재고, 판매가, 상태 관리',
  },
  {
    href: '/sales',
    title: '매출관리',
    desc: '판매등록, 실제배송비, 실입금액, 실이익금액 관리',
  },
  {
    href: '/vendors',
    title: '거래처관리',
    desc: '매입처, 배대지, 반입처 등 거래처 관리',
  },
  {
    href: '/evidence',
    title: '증빙서류관리',
    desc: '상품사진, 영수증, 통관서류, 비용증빙 관리',
  },
]

export default function DashboardPage() {
  const [sales, setSales] = useState<SaleSummaryRow[]>([])
  const [purchases, setPurchases] = useState<PurchaseSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [metricModalOpen, setMetricModalOpen] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<MetricKind | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setErr(null)

      try {
        const [salesRes, purchaseRes] = await Promise.all([
          supabase
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
            .order('sale_date', { ascending: true }),

          supabase
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
            .order('purchase_date', { ascending: true }),
        ])

        if (salesRes.error) throw salesRes.error
        if (purchaseRes.error) throw purchaseRes.error

        setSales((salesRes.data ?? []) as unknown as SaleSummaryRow[])
        setPurchases((purchaseRes.data ?? []) as unknown as PurchaseSummaryRow[])
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

  const summary = useMemo(() => {
    const dayProfit = daySales.reduce((sum, row) => sum + Number(row.profit_amount || 0), 0)
    const monthProfit = monthSales.reduce((sum, row) => sum + Number(row.profit_amount || 0), 0)
    const yearProfit = yearSales.reduce((sum, row) => sum + Number(row.profit_amount || 0), 0)
    const totalSales = totalSalesRows.reduce((sum, row) => sum + Number(row.final_amount || 0), 0)
    const totalSalesProfit = totalSalesRows.reduce((sum, row) => sum + Number(row.profit_amount || 0), 0)

    const dayPurchase = dayPurchases.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
    const monthPurchase = monthPurchases.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
    const yearPurchase = yearPurchases.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
    const totalPurchase = totalPurchaseRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)

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
    }
  }, [daySales, monthSales, yearSales, totalSalesRows, dayPurchases, monthPurchases, yearPurchases, totalPurchaseRows])

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
      default:
        return []
    }
  }, [selectedMetric, dayPurchases, monthPurchases, yearPurchases, totalPurchaseRows])

  const isSalesModal =
    selectedMetric === 'day_sales_profit' ||
    selectedMetric === 'month_sales_profit' ||
    selectedMetric === 'year_sales_profit' ||
    selectedMetric === 'total_sales' ||
    selectedMetric === 'total_sales_profit'

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section
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

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        {salesCards.map((card) => (
          <button
            key={card.key}
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
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        {purchaseCards.map((card) => (
          <button
            key={card.key}
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
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {navCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            style={{
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 22,
                padding: 20,
                minHeight: 150,
                boxShadow: '0 10px 24px rgba(124, 58, 237, 0.05)',
              }}
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  color: '#111827',
                  marginBottom: 10,
                }}
              >
                {card.title}
              </div>

              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: '#4b5563',
                  fontWeight: 600,
                }}
              >
                {card.desc}
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: '#7c3aed',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                들어가기 →
              </div>
            </div>
          </Link>
        ))}
      </section>

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
                    {row.memo ? (
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
                        메모: {row.memo}
                      </div>
                    ) : null}
                  </div>
                )
              })
            )
          ) : selectedPurchaseRows.length === 0 ? (
            <div style={{ color: '#6b7280', fontWeight: 700 }}>해당 기간 매입 내역이 없어.</div>
          ) : (
            selectedPurchaseRows.map((row) => {
              const first = row.purchase_items?.[0]
              const itemName = first?.item_name || '(상품명 없음)'
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
                    거래처 {row.supplier || '미입력'} / 매입일 {row.purchase_date || '미입력'} / 수량 {first?.qty || 0}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800 }}>
                    매입합계 {fmtKRW(Number(row.total_amount || 0))}
                  </div>
                  {row.memo ? (
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
                      메모: {row.memo}
                    </div>
                  ) : null}
                </div>
              )
            })
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