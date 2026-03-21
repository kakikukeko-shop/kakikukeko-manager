'use client'

import React, { useEffect } from 'react'

type SafeModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: number
}

export default function SafeModal({
  open,
  onClose,
  title,
  children,
  maxWidth = 980,
}: SafeModalProps) {
  useEffect(() => {
    if (!open) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: 24,
          border: '1px solid #e5e7eb',
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            background: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: '#111827',
              lineHeight: 1.2,
            }}
          >
            {title || '모달'}
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#111827',
              padding: '10px 16px',
              borderRadius: 999,
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 14,
              whiteSpace: 'nowrap',
            }}
          >
            닫기
          </button>
        </div>

        <div
          style={{
            padding: 20,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}