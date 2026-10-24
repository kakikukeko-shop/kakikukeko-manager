'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import RefreshButton from './RefreshButton'
import SafeModal from './SafeModal'

type StockItem = { id: string; name: string; photoUrl?: string | null; supplier: string; date: string; bookQty: number; orderedQty: number }
type Position = { item_id: string; locations: string[]; archived_at: string | null }
const button: React.CSSProperties = { border: '1px solid #d8d6e5', borderRadius: 10, padding: '9px 13px', background: '#fff', fontWeight: 700, cursor: 'pointer' }
const input: React.CSSProperties = { width: '100%', padding: 9, border: '1px solid #d8d6e5', borderRadius: 9, boxSizing: 'border-box' }
const cell: React.CSSProperties = { padding: 10, borderBottom: '1px solid #e5e7eb', textAlign: 'left', verticalAlign: 'top' }
export default function InventoryLocationPanel({ items, onRefresh, active = true, refreshRef }: { items: StockItem[]; onRefresh: () => Promise<void>; active?: boolean; refreshRef?: React.MutableRefObject<(() => Promise<void>) | null> }) {
  const [positions, setPositions] = useState<Position[]>([])
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  const [editor, setEditor] = useState<Array<{ item: StockItem; expected: string[] }> | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [locationText, setLocationText] = useState('')
  const [confirm, setConfirm] = useState<{ item: StockItem; token: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mounted, setMounted] = useState(false)
  const busyRef = useRef(false)
  const request = useRef({ signature: '', id: '' })
  async function load() {
    const result = await supabase.from('inventory_item_state').select('item_id,locations,archived_at')
    if (result.error) throw result.error
    setPositions(result.data || [])
  }
  useEffect(() => { setMounted(true); load().catch(e => setError(e.message)) }, [])
  useEffect(() => { if (!refreshRef) return; refreshRef.current = async () => { try { await load() } catch(e:any) { setError(e.message); throw e } }; return () => { refreshRef.current = null } }, [refreshRef])
  const positionMap = useMemo(() => new Map(positions.map(row => [row.item_id, row])), [positions])
  const options = useMemo(() => [...new Set(positions.flatMap(row => row.locations || []))].sort((a, b) => a.localeCompare(b, 'ko')), [positions])
  const visible = useMemo(() => items.filter(item => {
    const state = positionMap.get(item.id)
    if (!!state?.archived_at !== showArchived || (!showArchived && item.orderedQty <= 0)) return false
    const names = state?.locations || []
    return (location === 'all' || (location === 'none' ? !names.length : names.includes(location.startsWith('loc:') ? location.slice(4) : location))) && `${item.name} ${item.supplier} ${names.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())
  }).sort((a, b) => (positionMap.get(a.id)?.locations?.[0] || '미지정').localeCompare(positionMap.get(b.id)?.locations?.[0] || '미지정', 'ko') || a.name.localeCompare(b.name, 'ko')), [items, positionMap, showArchived, location, query])
  const selectedItems = visible.filter(item => selected.includes(item.id))
  function openLocationEditor(targets: StockItem[]) {
    if (!targets.length) return
    setEditor(targets.map(item => ({ item, expected: [...(positionMap.get(item.id)?.locations || [])] })))
    setLocationText(targets.length === 1 ? (positionMap.get(targets[0].id)?.locations || []).join('\n') : '')
    setError(''); setNotice('')
  }
  async function saveLocation() {
    if (!editor || busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try {
      const locations = [...new Set(locationText.split('\n').map(x => x.trim()).filter(Boolean))]
      if (locations.length > 30 || locations.some(name => name.length > 80)) throw new Error('위치는 30개까지, 한 위치는 80자까지 입력할 수 있어요.')
      const failed: typeof editor = []
      const messages: string[] = []
      let saved = 0
      for (const target of editor) {
        try {
          const result = await supabase.rpc('inventory_set_locations', { p_item_id: target.item.id, p_locations: locations, p_expected: target.expected })
          if (result.error) throw result.error
          saved++
        } catch (e: any) { failed.push(target); messages.push(`${target.item.name}: ${e.message}`) }
      }
      setEditor(failed.length ? failed : null)
      setSelected(previous => previous.filter(id => !editor.some(target => target.item.id === id && !failed.some(row => row.item.id === id))))
      setNotice(`${saved}종의 보관 위치를 저장했어요. 재고 수량은 바뀌지 않았어요.`)
      if (failed.length) setError(`저장하지 못한 ${failed.length}종만 창에 남겼어요.\n${messages.join('\n')}`)
      await load()
    } catch (e: any) { setError(e.message) } finally { busyRef.current = false; setBusy(false) }
  }
  async function prepareRestore(item: StockItem) {
    setError('')
    try {
      const result = await supabase.rpc('inventory_product_action', { p_action: 'restore', p_item_ids: [item.id], p_apply: false, p_reason: '보관 상품 복원' })
      if (result.error) throw result.error
      setConfirm({ item, token: result.data.token })
    } catch (e: any) { setError(e.message) }
  }
  async function apply() {
    if (!confirm || busyRef.current) return
    const pending = confirm; busyRef.current = true; setBusy(true); setError('')
    try {
      const signature = JSON.stringify(pending)
      if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() }
      const result = await supabase.rpc('inventory_product_action', { p_action: 'restore', p_item_ids: [pending.item.id], p_apply: true, p_expected_token: pending.token, p_request_id: request.current.id, p_reason: '보관 상품 복원' })
      if (result.error) throw result.error
      await Promise.all([load(), onRefresh()]); setConfirm(null)
      setNotice('상품을 복원했어요.')
    } catch (e: any) { setError(e.message) } finally { busyRef.current = false; setBusy(false) }
  }
  const printDate = new Date().toLocaleString('ko-KR')
  return <section data-mobile-location style={{ display: 'grid', gap: 14, background: '#fff', padding: 16, borderRadius: 16, border: '1px solid #e8e5f0' }}>
    <div><h2 style={{ margin: '0 0 6px' }}>위치·재고실사</h2><div style={{ color: '#6b7280', fontSize: 13 }}>보관 위치를 확인하고 실사표를 출력하세요. 실제 수량과 차이는 종이에 직접 적어요. 이 화면에서는 재고 수량을 조정하지 않아요.</div></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <input style={{ ...input, maxWidth: 300 }} aria-label="실사 상품 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="상품명 / 거래처 / 위치 검색" />
      <select style={{ ...input, maxWidth: 260 }} aria-label="보관 위치 필터" value={location} onChange={e => setLocation(e.target.value)}><option value="all">모든 위치</option><option value="none">위치 미지정</option>{options.map(name => <option key={name} value={`loc:${name}`}>{name}</option>)}</select>
      <RefreshButton style={button} disabled={busy} run={async () => { await Promise.all([load(), onRefresh()]) }} />
      <button type="button" style={{ ...button, color: '#6d28d9' }} disabled={busy || !visible.length || showArchived} onClick={async () => { setBusy(true); try { const images = Array.from(document.querySelectorAll<HTMLImageElement>('#inventory-print-root img')); await Promise.all(images.map(img => img.decode().catch(() => undefined))); window.print() } finally { setBusy(false) } }}>실사표 인쇄 / PDF 저장</button>
      <label style={{ padding: 8 }}><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> 보관 삭제한 상품 보기</label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b>선택 {selectedItems.length}종</b><button style={button} disabled={busy || !selectedItems.length} onClick={() => openLocationEditor(selectedItems)}>선택 상품 위치 일괄 수정</button><button style={button} disabled={busy || !selected.length} onClick={() => setSelected([])}>선택 해제</button><span style={{ fontSize: 12, color: '#6b7280' }}>현재 검색·필터에 보이는 선택 상품만 수정해요.</span></div>
    <div style={{ fontSize: 12, color: '#6b7280' }}>현재 {visible.length}종 · 장부 수량 {visible.reduce((sum, item) => sum + item.bookQty, 0)}개. 여러 위치의 상품은 전체 위치의 수량을 합쳐 세세요. 위치별 출력도 상품 전체 수량 기준이며 같은 상품은 한 번만 나와요.</div>
    {error ? <div role="alert" style={{ color: '#b91c1c', whiteSpace: 'pre-wrap' }}>{error}</div> : null}
    {notice ? <div style={{ color: '#047857' }}>{notice}</div> : null}
    <style>{`@media screen and (max-width:699px){[data-mobile-location]{padding:10px!important}[data-mobile-location] table{display:block;min-width:0!important;width:100%!important}[data-mobile-location] colgroup,[data-mobile-location] thead{display:none}[data-mobile-location] tbody{display:grid;gap:10px}[data-mobile-location] tr{display:grid;grid-template-columns:28px minmax(0,1fr);border:1px solid #e5e7eb;border-radius:12px;padding:8px}[data-mobile-location] td{display:block;border:0!important;padding:5px!important;min-width:0}[data-mobile-location] td:nth-child(n+3){grid-column:2}[data-mobile-location] td:nth-child(3)::before{content:"보관 위치: ";color:#64748b}[data-mobile-location] td:nth-child(4)::before{content:"장부 수량: ";color:#64748b}[data-mobile-location] img{width:44px!important;height:44px!important}}`}</style><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 840, tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 13 }}><colgroup>{[4, 42, 27, 12, 15].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup><thead><tr><th style={cell}><input type="checkbox" aria-label="현재 목록 전체 선택" disabled={busy || !visible.length} checked={!!visible.length && selectedItems.length === visible.length} onChange={e => setSelected(previous => e.target.checked ? [...new Set([...previous, ...visible.map(item => item.id)])] : previous.filter(id => !visible.some(item => item.id === id)))} /></th>{['상품 / 거래처', '보관 위치', '장부 수량', '관리'].map(title => <th key={title} style={cell}>{title}</th>)}</tr></thead><tbody>
      {visible.map(item => <tr key={item.id}><td style={cell}><input type="checkbox" aria-label={`${item.name} 선택`} disabled={busy} checked={selected.includes(item.id)} onChange={e => setSelected(previous => e.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} /></td><td style={cell}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{item.photoUrl ? <img src={item.photoUrl} alt={item.name} loading="lazy" style={{ width: 60, height: 60, objectFit: 'contain', flexShrink: 0, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }} /> : <span style={{ width: 60, height: 60, display: 'grid', placeItems: 'center', flexShrink: 0, background: '#f3f4f6', borderRadius: 8, color: '#9ca3af', fontSize: 11 }}>사진 없음</span>}<div style={{ minWidth: 0, overflowWrap: 'anywhere' }}><b>{item.name}</b><div style={{ fontSize: 11, color: '#6b7280' }}>{item.supplier} · {item.date ? `최근 입고 ${item.date}` : '미입고'}</div></div></div></td><td style={{ ...cell, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{positionMap.get(item.id)?.locations?.join('\n') || '미지정'}</td><td style={cell}>{item.bookQty}개</td><td style={cell}><button style={button} disabled={busy} onClick={() => openLocationEditor([item])}>위치 편집</button>{showArchived ? <button style={button} onClick={() => prepareRestore(item)}>상품 복원</button> : null}</td></tr>)}
    </tbody></table></div>
    <SafeModal open={!!editor} title="상품 보관 위치" onClose={() => { if (!busy) setEditor(null) }}><div style={{ display: 'grid', gap: 12 }}><b>{editor?.length || 0}종 보관 위치 수정</b><div style={{ maxHeight: 180, overflowY: 'auto', fontSize: 13 }}>{editor?.map(target => <div key={target.item.id} style={{ padding: 4 }}>{target.item.name} · 현재: {target.expected.join(' / ') || '미지정'}</div>)}</div><textarea style={{ ...input, minHeight: 140 }} value={locationText} disabled={busy} onChange={e => setLocationText(e.target.value)} placeholder={'매장 A선반 1칸\n창고 B선반 2칸'} /><div style={{ fontSize: 12 }}>입력한 위치로 선택 상품의 기존 위치를 모두 교체해요. 한 줄에 하나씩 적고, 빈칸으로 저장하면 미지정이 돼요. 재고 수량은 바뀌지 않아요.</div>{error ? <div role="alert" style={{ color: '#b91c1c' }}>{error}</div> : null}<button style={button} disabled={busy} onClick={saveLocation}>위 목록 상품에 위치 저장</button></div></SafeModal>
    <SafeModal open={!!confirm} title="반영할 내용을 확인해 주세요" onClose={() => { if (!busy) setConfirm(null) }}><div style={{ display: 'grid', gap: 12 }}>
      <div>{confirm?.item.name}을 상품 목록으로 복원할까요?</div>
      {error ? <div role="alert" style={{ color: '#b91c1c' }}>{error}</div> : null}<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button style={button} disabled={busy} onClick={() => setConfirm(null)}>돌아가기</button><button style={{ ...button, background: '#7c3aed', color: '#fff' }} disabled={busy} onClick={apply}>확인 후 반영</button></div>
    </div></SafeModal>
    {mounted && active ? createPortal(<div id="inventory-print-root"><style>{`#inventory-print-root{display:none}@media print{@page{size:A4 portrait;margin:12mm}body>*{display:none!important}body>#inventory-print-root{display:block!important;color:#000;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-size:8pt}#inventory-print-root table{border-collapse:collapse;width:100%;table-layout:fixed}#inventory-print-root th,#inventory-print-root td{border:1px solid #888;padding:3px 4px;overflow-wrap:anywhere;vertical-align:middle}#inventory-print-root thead{display:table-header-group}#inventory-print-root tr{break-inside:avoid}#inventory-print-root .write{height:18px}}`}</style><h2>카키쿠케코 상점 · 재고실사표</h2><p>{printDate} · {location === 'all' ? '모든 위치' : location === 'none' ? '위치 미지정' : location.startsWith('loc:') ? location.slice(4) : location} · {visible.length}종 / 검색: {query || '전체'}</p><p>실사일: __________________　확인자: __________________</p><p>여러 위치에 있는 상품은 전체 위치의 수량을 합산하세요. 상품별 한 줄이며 빈칸에 실제 수량을 적으세요.</p><table><colgroup><col style={{ width: '49%' }} /><col style={{ width: '19%' }} /><col style={{ width: '6%' }} /><col style={{ width: '6%' }} /><col style={{ width: '6%' }} /><col style={{ width: '14%' }} /></colgroup><thead><tr>{['상품 / 거래처', '보관 위치', '장부', '실제', '차이', '메모'].map(name => <th key={name}>{name}</th>)}</tr></thead><tbody>{visible.map(item => <tr key={item.id}><td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{item.photoUrl ? <img src={item.photoUrl} alt="" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} /> : null}<div style={{ minWidth: 0 }}>{item.name}<br /><small>{item.supplier}</small></div></div></td><td>{positionMap.get(item.id)?.locations?.join(' / ') || '미지정'}</td><td>{item.bookQty}</td><td className="write" /><td /><td /></tr>)}</tbody></table></div>, document.body) : null}
  </section>
}
