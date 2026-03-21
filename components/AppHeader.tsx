'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'

const MENUS = [
  { href: '/', label: '대시보드' },
  { href: '/documents', label: '매입관리' },
  { href: '/products', label: '상품 / 재고관리' },
  { href: '/sales', label: '매출관리' },
  { href: '/vendors', label: '거래처관리' },
  { href: '/evidence', label: '증빙서류관리' },
]

export default function AppHeader() {
  const pathname = usePathname()

  return (
    <header
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

        <nav
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {MENUS.map((menu) => {
            const active =
              pathname === menu.href ||
              (menu.href !== '/' && pathname.startsWith(menu.href))

            return (
              <Link
                key={menu.href}
                href={menu.href}
                style={{
                  textDecoration: 'none',
                  padding: '10px 14px',
                  borderRadius: 14,
                  border: active ? '1px solid #7c3aed' : '1px solid #d5d7e2',
                  background: active ? '#7c3aed' : '#fff',
                  color: active ? '#fff' : '#111827',
                  fontSize: 14,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  lineHeight: 1.2,
                  boxShadow: active ? '0 8px 20px rgba(124,58,237,0.18)' : 'none',
                }}
              >
                {menu.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}