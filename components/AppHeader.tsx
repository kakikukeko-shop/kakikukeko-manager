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
          display: 'grid',
          gap: 12,
        }}
      >
        <div
          data-app-header-top
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            minWidth: 0,
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
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 22 }}>🧸</span>
            <span>카키쿠케코 상점</span>
          </Link>

          <button
            data-mobile-logout
            type="button"
            onClick={handleLogout}
            style={{
              display: 'none',
              padding: '8px 11px',
              borderRadius: 12,
              border: '1px solid #ef4444',
              background: '#fff',
              color: '#ef4444',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            로그아웃
          </button>
        </div>

        <div
          data-app-header-actions
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            justifyContent: 'space-between',
            minWidth: 0,
          }}
        >
          <nav
            data-app-nav
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              minWidth: 0,
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
                    flexShrink: 0,
                  }}
                >
                  {menu.label}
                </Link>
              )
            })}
          </nav>

          <div
            data-desktop-actions
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexShrink: 0,
            }}
          >
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
      </div>

      <style jsx global>{`
        @media (max-width: 699px) {
          [data-app-header-inner] {
            padding: 12px 14px !important;
            gap: 10px !important;
          }

          [data-app-header-top] {
            width: 100% !important;
          }

          [data-app-logo] {
            font-size: 18px !important;
          }

          [data-app-logo] > span:first-child {
            font-size: 20px !important;
          }

          [data-mobile-logout] {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
          }

          [data-desktop-actions] {
            display: none !important;
          }

          [data-app-header-actions] {
            display: block !important;
            width: 100% !important;
            min-width: 0 !important;
          }

          [data-app-nav] {
            display: flex !important;
            flex-wrap: nowrap !important;
            width: 100% !important;
            min-width: 0 !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            gap: 7px !important;
            padding-bottom: 2px !important;
            scrollbar-width: none !important;
            -webkit-overflow-scrolling: touch !important;
          }

          [data-app-nav]::-webkit-scrollbar {
            display: none !important;
          }

          [data-app-nav] a {
            padding: 9px 12px !important;
            font-size: 13px !important;
            border-radius: 12px !important;
            flex: 0 0 auto !important;
          }
        }
      `}</style>
    </header>
  )
}
