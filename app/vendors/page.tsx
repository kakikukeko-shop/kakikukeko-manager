'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SafeModal from '../../components/SafeModal'
import PageBackButton from '../../components/PageBackButton'

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
  memo?: string | null
}

function fmtDateTime(v?: string | null) {
  if (!v) return '-'
  try {
    return new Date(v).toLocaleString('ko-KR')
  } catch {
    return v
  }
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
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
  const [memo, setMemo] = useState('')

  async function load() {
    setLoading(true)
    setErr(null)
    setMsg(null)

    const res = await supabase
      .from('vendors')
      .select('*')
      .order('created_at', { ascending: false })

    if (res.error) {
      setErr(res.error.message)
      setLoading(false)
      return
    }

    setVendors((res.data ?? []) as VendorRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vendors

    return vendors.filter((v) => {
      const fields = [
        v.name,
        v.product_type,
        v.address,
        v.website,
        v.email,
        v.phone,
        v.memo,
      ]
      return fields.some((x) => String(x || '').toLowerCase().includes(q))
    })
  }, [vendors, search])

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
      <PageBackButton />

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
        </div>
      </div>

      {msg ? <div style={styles.okBox}>{msg}</div> : null}
      {err ? <div style={styles.errorBox}>{err}</div> : null}

      {loading && vendors.length === 0 ? (
        <div style={styles.card}>불러오는 중...</div>
      ) : (
        <div
          style={{
            ...styles.grid,
          }}
        >
          {filtered.map((v) => (
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
                    {v.is_online ? <span style={styles.badge('#dbeafe', '#1d4ed8')}>온라인</span> : null}
                    {v.is_offline ? <span style={styles.badge('#fef3c7', '#92400e')}>오프라인</span> : null}
                    {v.is_product_supplier ? <span style={styles.badge('#ede9fe', '#6d28d9')}>상품거래처</span> : null}
                    {v.is_forwarder ? <span style={styles.badge('#e0e7ff', '#4338ca')}>배대지</span> : null}
                    {v.is_carry_in ? <span style={styles.badge('#fae8ff', '#a21caf')}>휴대품반입</span> : null}
                    {v.is_domestic ? (
                      <span style={styles.badge('#dcfce7', '#166534')}>국내</span>
                    ) : (
                      <span style={styles.badge('#ecfccb', '#3f6212')}>해외</span>
                    )}
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
                  <div style={styles.detailLabel}>전화번호</div>
                  <div style={styles.detailValue}>{v.phone || '-'}</div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={styles.detailLabel}>주소/온라인주소</div>
                  <div style={styles.detailValue}>{v.address || '-'}</div>
                </div>

                <div>
                  <div style={styles.detailLabel}>웹사이트</div>
                  <div style={styles.detailValue}>{v.website || '-'}</div>
                </div>

                <div>
                  <div style={styles.detailLabel}>이메일</div>
                  <div style={styles.detailValue}>{v.email || '-'}</div>
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
          ))}

          {!loading && filtered.length === 0 ? (
            <div style={styles.card}>조건에 맞는 거래처가 없어.</div>
          ) : null}
        </div>
      )}

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