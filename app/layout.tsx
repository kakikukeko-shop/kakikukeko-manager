import './globals.css'
import type { Metadata } from 'next'
import AppHeader from '../components/AppHeader'
import AuthGuard from '../components/AuthGuard'

export const metadata: Metadata = {
  title: '카키쿠케코 관리자',
  description: '매입 / 재고 / 매출 / 거래처 / 증빙서류 관리',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          background: 'linear-gradient(180deg, #f8f7ff 0%, #f7fbff 100%)',
          color: '#111827',
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
        }}
      >
        <AuthGuard>
          <AppHeader />
          <main
            style={{
              width: '100%',
              maxWidth: '100%',
              margin: 0,
              padding: 16,
              boxSizing: 'border-box',
            }}
          >
            {children}
          </main>
        </AuthGuard>
      </body>
    </html>
  )
}