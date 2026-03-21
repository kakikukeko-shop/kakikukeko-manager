'use client'

import { useRouter } from 'next/navigation'

export default function PageBackButton() {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => router.push('/')}
      style={{
        border: '1px solid #d1d5db',
        background: '#fff',
        color: '#111827',
        padding: '10px 14px',
        borderRadius: 12,
        fontWeight: 800,
        fontSize: 14,
        cursor: 'pointer',
        marginBottom: 14,
      }}
    >
      ← 대시보드로
    </button>
  )
}