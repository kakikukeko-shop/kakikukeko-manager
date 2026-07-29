'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type VendorRow = {
  id: string
  name: string | null
  is_forwarder: boolean | null
  is_active: boolean | null
}

type PurchaseCostRow = {
  id: string
  cost_type: string | null
  vendor_name: string | null
  amount: number | null
  currency: string | null
  fx_rate: number | null
}

type CostAllocationRow = {
  purchase_cost_id: string
  purchase_item_id: string
  allocated_amount: number | null
}

type PurchaseItemRow = {
  id: string
  product_type: string | null
  qty: number | null
}

type ProductType = '피규어' | '가챠' | '랜덤박스' | '기타'

const PRODUCT_TYPES: ProductType[] = [
  '피규어',
  '가챠',
  '랜덤박스',
  '기타',
]

function n(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function fmtKRW(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

function normalizeCostType(value: string | null | undefined) {
  const text = String(value ?? '').trim()

  if (text === '배송비') return '배송비(거래처)'

  return text
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

export default function ForwardingCalculatorPage() {
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [costs, setCosts] = useState<PurchaseCostRow[]>([])
  const [allocations, setAllocations] = useState<CostAllocationRow[]>([])
  const [items, setItems] = useState<PurchaseItemRow[]>([])

  const [selectedVendorId, setSelectedVendorId] = useState('')

  const [quantities, setQuantities] = useState<
    Record<ProductType, string>
  >({
    피규어: '',
    가챠: '',
    랜덤박스: '',
    기타: '',
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const [
          vendorRes,
          costRes,
          allocationRes,
          itemRes,
        ] = await Promise.all([
          supabase
            .from('vendors')
            .select('id,name,is_forwarder,is_active')
            .eq('is_forwarder', true)
            .order('name', { ascending: true }),

          supabase
            .from('purchase_costs')
            .select(
              'id,cost_type,vendor_name,amount,currency,fx_rate',
            ),

          supabase
            .from('cost_allocations')
            .select(
              'purchase_cost_id,purchase_item_id,allocated_amount',
            ),

          supabase
            .from('purchase_items')
            .select('id,product_type,qty'),
        ])

        if (vendorRes.error) throw vendorRes.error
        if (costRes.error) throw costRes.error
        if (allocationRes.error) throw allocationRes.error
        if (itemRes.error) throw itemRes.error

        const activeForwarders = (
          (vendorRes.data ?? []) as VendorRow[]
        ).filter(
          (vendor) =>
            vendor.is_active !== false &&
            vendor.name?.trim(),
        )

        setVendors(activeForwarders)
        setCosts(
          (costRes.data ?? []) as PurchaseCostRow[],
        )
        setAllocations(
          (allocationRes.data ?? []) as CostAllocationRow[],
        )
        setItems(
          (itemRes.data ?? []) as PurchaseItemRow[],
        )

        if (activeForwarders.length > 0) {
          setSelectedVendorId(activeForwarders[0].id)
        }
      } catch (e: any) {
        setError(e?.message ?? String(e))
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const selectedVendor = useMemo(
    () =>
      vendors.find(
        (vendor) => vendor.id === selectedVendorId,
      ) ?? null,
    [vendors, selectedVendorId],
  )

  const itemMap = useMemo(() => {
    const map = new Map<string, PurchaseItemRow>()

    items.forEach((item) => {
      map.set(item.id, item)
    })

    return map
  }, [items])

  const costMap = useMemo(() => {
    const map = new Map<string, PurchaseCostRow>()

    costs.forEach((cost) => {
      map.set(cost.id, cost)
    })

    return map
  }, [costs])

  const historicalStats = useMemo(() => {
    const selectedVendorName = normalizeName(
      selectedVendor?.name,
    )

    const byType: Record<
      ProductType,
      {
        totalAllocated: number
        totalQty: number
        sampleCount: number
      }
    > = {
      피규어: {
        totalAllocated: 0,
        totalQty: 0,
        sampleCount: 0,
      },
      가챠: {
        totalAllocated: 0,
        totalQty: 0,
        sampleCount: 0,
      },
      랜덤박스: {
        totalAllocated: 0,
        totalQty: 0,
        sampleCount: 0,
      },
      기타: {
        totalAllocated: 0,
        totalQty: 0,
        sampleCount: 0,
      },
    }

    allocations.forEach((allocation) => {
      const cost = costMap.get(
        allocation.purchase_cost_id,
      )

      const item = itemMap.get(
        allocation.purchase_item_id,
      )

      if (!cost || !item) return

      const normalizedCostType = normalizeCostType(
        cost.cost_type,
      )

      if (
        normalizedCostType !==
          '배송비(배대지)' &&
        normalizedCostType !==
          '배송비(거래처)'
      ) {
        return
      }

      if (
        normalizeName(cost.vendor_name) !==
        selectedVendorName
      ) {
        return
      }

      const rawType = String(
        item.product_type ?? '기타',
      )

      const productType: ProductType =
        PRODUCT_TYPES.includes(
          rawType as ProductType,
        )
          ? (rawType as ProductType)
          : '기타'

      const qty = Math.max(0, n(item.qty))
      const allocated = Math.abs(
        n(allocation.allocated_amount),
      )

      if (qty <= 0 || allocated <= 0) return

      byType[productType].totalAllocated += allocated
      byType[productType].totalQty += qty
      byType[productType].sampleCount += 1
    })

    return byType
  }, [
    allocations,
    costMap,
    itemMap,
    selectedVendor,
  ])

  const result = useMemo(() => {
    let totalQty = 0
    let estimatedTotal = 0

    const rows = PRODUCT_TYPES.map((type) => {
      const qty = Math.max(
        0,
        Math.floor(n(quantities[type])),
      )

      const stat = historicalStats[type]

      const unitEstimate =
        stat.totalQty > 0
          ? stat.totalAllocated / stat.totalQty
          : 0

      const subtotal = qty * unitEstimate

      totalQty += qty
      estimatedTotal += subtotal

      return {
        type,
        qty,
        unitEstimate,
        subtotal,
        sampleCount: stat.sampleCount,
      }
    })

    const low = Math.max(
      0,
      Math.round(estimatedTotal * 0.85),
    )

    const high = Math.round(
      estimatedTotal * 1.15,
    )

    const perItem =
      totalQty > 0
        ? estimatedTotal / totalQty
        : 0

    return {
      rows,
      totalQty,
      estimatedTotal,
      low,
      high,
      perItem,
    }
  }, [historicalStats, quantities])

  const hasAnyQuantity = result.totalQty > 0
  const hasEstimate = result.estimatedTotal > 0

  const styles = {
    page: {
      minHeight: '100vh',
      padding: 20,
      background: '#f7f7fb',
      color: '#111827',
    } as React.CSSProperties,

    card: {
      border: '1px solid #e6e6ef',
      borderRadius: 18,
      background: '#fff',
      padding: 18,
      boxShadow:
        '0 8px 24px rgba(124,58,237,0.05)',
    } as React.CSSProperties,

    label: {
      display: 'block',
      marginBottom: 7,
      fontSize: 13,
      fontWeight: 900,
      color: '#374151',
    } as React.CSSProperties,

    input: {
      width: '100%',
      minHeight: 44,
      padding: '10px 12px',
      border: '1px solid #d9d9e6',
      borderRadius: 12,
      background: '#fff',
      color: '#111827',
      fontSize: 14,
      outline: 'none',
      boxSizing: 'border-box',
    } as React.CSSProperties,
  }

  return (
    <div
      data-page="forwarding"
      style={styles.page}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'grid',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              color: '#312e81',
              fontSize: 26,
              fontWeight: 900,
            }}
          >
            배대지비 계산기
          </h1>

          <p
            style={{
              margin: '8px 0 0',
              color: '#6b7280',
              fontSize: 14,
            }}
          >
            거래처관리에서 배대지로 등록한 업체와
            배송비(배대지)·상품과 함께 결제한 배송비 기록을
            기준으로 계산해.
          </p>
        </div>

        {error && (
          <div
            style={{
              ...styles.card,
              borderColor: '#fecaca',
              background: '#fef2f2',
              color: '#991b1b',
              fontWeight: 800,
            }}
          >
            ❌ {error}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(0, 0.9fr) minmax(0, 1.1fr)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <div
            style={{
              ...styles.card,
              display: 'grid',
              gap: 16,
            }}
          >
            <div>
              <label style={styles.label}>
                배대지
              </label>

              <select
                style={styles.input}
                value={selectedVendorId}
                onChange={(e) =>
                  setSelectedVendorId(
                    e.target.value,
                  )
                }
                disabled={
                  loading ||
                  vendors.length === 0
                }
              >
                {vendors.length === 0 ? (
                  <option value="">
                    등록된 배대지 없음
                  </option>
                ) : (
                  vendors.map((vendor) => (
                    <option
                      key={vendor.id}
                      value={vendor.id}
                    >
                      {vendor.name}
                    </option>
                  ))
                )}
              </select>

              {vendors.length === 0 &&
                !loading && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 10,
                      background: '#fff7ed',
                      color: '#9a3412',
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    거래처관리에서 업체를
                    등록하고 ‘배대지’ 항목을
                    체크해줘.
                  </div>
                )}
            </div>

            <div>
              <div
                style={{
                  ...styles.label,
                  marginBottom: 10,
                }}
              >
                상품 수량
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap: 12,
                }}
              >
                {PRODUCT_TYPES.map(
                  (type) => (
                    <div key={type}>
                      <label
                        style={styles.label}
                      >
                        {type}
                      </label>

                      <input
                        style={styles.input}
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={
                          quantities[type]
                        }
                        onChange={(e) =>
                          setQuantities(
                            (prev) => ({
                              ...prev,
                              [type]:
                                e.target
                                  .value,
                            }),
                          )
                        }
                        placeholder="0"
                      />
                    </div>
                  ),
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setQuantities({
                  피규어: '',
                  가챠: '',
                  랜덤박스: '',
                  기타: '',
                })
              }
              style={{
                minHeight: 44,
                border:
                  '1px solid #d5d7e2',
                borderRadius: 12,
                background: '#fff',
                color: '#111827',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              수량 초기화
            </button>
          </div>

          <div
            style={{
              ...styles.card,
              display: 'grid',
              gap: 14,
            }}
          >
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: '#f5f3ff',
                border:
                  '1px solid #ddd6fe',
              }}
            >
              <div
                style={{
                  color: '#6d28d9',
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                예상 배대지비
              </div>

              <div
                style={{
                  marginTop: 7,
                  color: '#312e81',
                  fontSize: 30,
                  fontWeight: 900,
                }}
              >
                {hasEstimate
                  ? `${fmtKRW(
                      result.low,
                    )} ~ ${fmtKRW(
                      result.high,
                    )}`
                  : '계산할 기록이 없어'}
              </div>

              <div
                style={{
                  marginTop: 8,
                  color: '#4b5563',
                  fontSize: 13,
                }}
              >
                총수량{' '}
                <b>{result.totalQty}개</b>
                {' / '}
                개당 예상{' '}
                <b>
                  {hasEstimate
                    ? fmtKRW(
                        result.perItem,
                      )
                    : '계산 불가'}
                </b>
              </div>
            </div>

            {!hasAnyQuantity ? (
              <div
                style={{
                  color: '#6b7280',
                  fontSize: 13,
                }}
              >
                왼쪽에서 상품 수량을
                입력해줘.
              </div>
            ) : !hasEstimate ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: 12,
                  background: '#fff7ed',
                  color: '#9a3412',
                  fontSize: 13,
                  lineHeight: 1.6,
                  fontWeight: 800,
                }}
              >
                선택한 배대지의 실제
                배송비 배분 기록이 아직 없어.
                ‘배송비(배대지)’뿐 아니라
                상품값과 함께 결제해
                ‘배송비(거래처)’로 저장된
                기록도 함께 계산해.
              </div>
            ) : null}

            <div
              style={{
                display: 'grid',
                gap: 8,
              }}
            >
              {result.rows.map((row) => (
                <div
                  key={row.type}
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '90px 70px 1fr',
                    gap: 10,
                    alignItems: 'center',
                    padding: '11px 12px',
                    border:
                      '1px solid #ececf3',
                    borderRadius: 12,
                    background: '#fafafa',
                    fontSize: 13,
                  }}
                >
                  <b>{row.type}</b>

                  <span>
                    {row.qty}개
                  </span>

                  <span
                    style={{
                      textAlign: 'right',
                    }}
                  >
                    {row.unitEstimate >
                    0 ? (
                      <>
                        개당{' '}
                        {fmtKRW(
                          row.unitEstimate,
                        )}
                        {' / '}
                        <b>
                          {fmtKRW(
                            row.subtotal,
                          )}
                        </b>
                      </>
                    ) : (
                      <span
                        style={{
                          color:
                            '#9a3412',
                        }}
                      >
                        기록 없음
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: '#f9fafb',
                color: '#6b7280',
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              계산값은 해당 배대지의 과거
              실제 배분액을 상품 수량으로
              나눈 평균이야. 포장 크기·무게·
              합배송 구성에 따라 실제 금액이
              달라질 수 있어서 ±15% 범위로
              표시해.
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 850px) {
          [data-page='forwarding']
            > div
            > div:nth-child(3) {
            grid-template-columns:
              minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  )
}