'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import SafeModal from './SafeModal'

export default function CompactFormModal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const [mobile, setMobile] = useState(false)
  useEffect(() => { const media = window.matchMedia('(max-width:699px)'); const sync = () => setMobile(media.matches); sync(); media.addEventListener('change', sync); return () => media.removeEventListener('change', sync) }, [])
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open || !mobile) return
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key === 'Tab') {
        const controls = Array.from(closeRef.current?.closest('section')?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]') || []).filter(el => el.getClientRects().length > 0)
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); previousFocus?.focus() }
  }, [open, mobile])
  if (!open || typeof document === 'undefined') return null
  if (!mobile) return <SafeModal open={open} title={title} onClose={onClose}>{children}</SafeModal>
  return createPortal(<div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
    <section data-compact-form-modal role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, height: 'min(84dvh, 850px)', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', color: '#111827', borderRadius: 18, boxShadow: '0 20px 60px #0003', boxSizing: 'border-box' }}>
      <style>{`
[data-compact-form-body]{overflow-x:hidden!important;font-size:12px!important;padding:10px!important}
[data-compact-form-body] *{min-width:0!important;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}
[data-compact-form-body] div,[data-compact-form-body] p,[data-compact-form-body] span,[data-compact-form-body] label{font-size:12px!important;line-height:1.5!important}
[data-compact-form-body] label{margin-bottom:4px!important;font-size:11px!important}
[data-compact-form-body] input:not([type=checkbox]):not([type=radio]),[data-compact-form-body] select,[data-compact-form-body] textarea{width:100%!important;min-width:0!important;max-width:100%!important;font-size:13px!important;line-height:1.4!important;padding:8px!important;border-radius:9px!important;height:auto;min-height:36px!important}
[data-compact-form-body] textarea{min-height:70px!important}
[data-compact-form-body] button{font-size:11px!important;line-height:1.3!important;padding:7px 9px!important;min-height:32px!important;height:auto!important;border-radius:9px!important;white-space:nowrap!important;flex-shrink:0!important;width:auto;max-width:100%}
[data-compact-form-body] button span{font-size:11px!important}
[data-compact-form-body] button .truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-compact-form-body] .grid{gap:9px!important;grid-template-columns:minmax(0,1fr)}
[data-compact-form-body] .p-4,[data-compact-form-body] .p-5{padding:10px!important}
[data-compact-form-body] .gap-6{gap:12px!important}
[data-compact-form-body] .mb-3{margin-bottom:8px!important}
[data-compact-form-body] .mb-2{margin-bottom:4px!important}
[data-compact-form-body] .text-2xl,[data-compact-form-body] .text-xl{font-size:16px!important}
[data-compact-form-body] .flex.justify-between{gap:8px!important;flex-wrap:wrap}
[data-compact-form-body] .flex.justify-between>div:first-child{flex:1;min-width:120px!important}
[data-compact-form-body] .max-h-\\[420px\\]{max-height:none!important;overflow:visible!important}
[data-compact-form-body] [data-tablet-role="purchase-form-grid"],[data-compact-form-body] [data-tablet-role="purchase-item-input-grid"]{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:8px!important}
[data-compact-form-body] [data-tablet-role="purchase-buy-form"]>div:first-child{display:flex!important;flex-wrap:wrap!important;gap:5px!important}
[data-compact-form-body] img{max-width:60px!important;max-height:60px!important;object-fit:contain}
[data-compact-form-body] .h-24.w-24{width:60px!important;height:60px!important}

[data-compact-form-body] [data-sale-line-totals]{display:grid!important;grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:6px!important}
[data-sale-line-totals]>div{grid-column:span 3;padding:8px!important}
[data-sale-line-totals]>div:nth-child(-n+3){grid-column:span 2}
[data-compact-form-body] [data-sale-line-totals]>div>div:first-child{font-size:10px!important;line-height:1.35!important}
[data-compact-form-body] [data-sale-line-totals]>div>div:last-child{font-size:11px!important;white-space:nowrap!important;letter-spacing:-.4px}
[data-compact-form-body] [data-sale-form-totals]{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important}
[data-compact-form-body] [data-sale-form-totals]>div{display:flex!important;flex-direction:column;align-items:flex-start!important;justify-content:start!important;gap:3px!important;padding:8px!important;border-radius:10px!important}
[data-compact-form-body] [data-sale-form-totals]>div>span:first-child{font-size:10px!important;line-height:1.35!important;color:#64748b}
[data-compact-form-body] [data-sale-form-totals]>div>span:last-child{font-size:12px!important;white-space:nowrap!important}
`}</style><header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0, padding: '12px 14px', borderBottom: '1px solid #ede9fe', background: '#fff' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, minWidth: 0, overflowWrap: 'anywhere' }}>{title}</h2>
        <button ref={closeRef} type="button" onClick={onClose} style={{ flexShrink: 0, border: '1px solid #ddd6fe', borderRadius: 10, background: '#fff', color: '#4338ca', padding: '10px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>닫기</button>
      </header>
      <div data-compact-form-body tabIndex={0} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '12px 14px', fontSize: 13, lineHeight: 1.5 }}>{children}</div>
    </section>
  </div>, document.body)
}
