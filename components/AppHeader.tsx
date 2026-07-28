'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const MENUS = [
  { href: '/', label: '대시보드' },
  { href: '/documents', label: '매입관리' },
  { href: '/products', label: '상품 / 재고관리' },
  { href: '/sales', label: '매출관리' },
  { href: '/vendors', label: '거래처관리' },
  { href: '/evidence', label: '증빙서류관리' },
  { href: '/forwarding', label: '배대지비 계산기' },
]

type ViewMode = 'pc' | 'tablet'

const VIEW_MODE_STORAGE_KEY = 'kakikukeko-view-mode'

function applyViewMode(mode: ViewMode) {
  document.documentElement.dataset.viewMode = mode
  window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)

  window.dispatchEvent(
    new CustomEvent('kakikukeko:view-mode-change', {
      detail: mode,
    }),
  )
}

export default function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()

  const [viewMode, setViewMode] = useState<ViewMode>('pc')

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)

    const nextMode: ViewMode =
      saved === 'tablet' ? 'tablet' : 'pc'

    setViewMode(nextMode)
    applyViewMode(nextMode)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const toggleViewMode = () => {
    const nextMode: ViewMode =
      viewMode === 'pc' ? 'tablet' : 'pc'

    setViewMode(nextMode)
    applyViewMode(nextMode)
  }

  return (
    <header
      data-app-header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #ececf4',
      }}
    >
      <div
        data-app-header-inner
        style={{
          maxWidth: 1680,
          margin: '0 auto',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <Link
          data-app-logo
          href="/"
          style={{
            textDecoration: 'none',
            fontSize: 20,
            fontWeight: 900,
            color: '#4338ca',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 22 }}>🧸</span>
          <span>카키쿠케코 상점</span>
        </Link>

        <div
          data-app-header-actions
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          <nav
            data-app-nav
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {MENUS.map((menu) => {
              const active =
                pathname === menu.href ||
                (menu.href !== '/' &&
                  pathname.startsWith(menu.href))

              return (
                <Link
                  key={menu.href}
                  href={menu.href}
                  style={{
                    textDecoration: 'none',
                    padding: '10px 14px',
                    borderRadius: 14,
                    border: active
                      ? '1px solid #7c3aed'
                      : '1px solid #d5d7e2',
                    background: active
                      ? '#7c3aed'
                      : '#fff',
                    color: active
                      ? '#fff'
                      : '#111827',
                    fontSize: 14,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    lineHeight: 1.2,
                    boxShadow: active
                      ? '0 8px 20px rgba(124,58,237,0.18)'
                      : 'none',
                  }}
                >
                  {menu.label}
                </Link>
              )
            })}
          </nav>

          <button
            data-view-toggle
            type="button"
            onClick={toggleViewMode}
            aria-pressed={viewMode === 'tablet'}
            style={{
              padding: '10px 14px',
              borderRadius: 14,
              border: '1px solid #0f766e',
              background:
                viewMode === 'tablet'
                  ? '#0f766e'
                  : '#fff',
              color:
                viewMode === 'tablet'
                  ? '#fff'
                  : '#0f766e',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {viewMode === 'tablet'
              ? '🖥️ PC 버전'
              : '📱 태블릿 버전'}
          </button>

          <button
            data-logout-button
            type="button"
            onClick={handleLogout}
            style={{
              padding: '10px 14px',
              borderRadius: 14,
              border: '1px solid #ef4444',
              background: '#fff',
              color: '#ef4444',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  )
}