'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function login() {
    setLoading(true)
    setErr(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErr('이메일 또는 비밀번호를 확인해줘.')
      setLoading(false)
      return
    }

    router.push('/documents')
    router.refresh()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f7f7fb',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#fff',
          padding: 24,
          borderRadius: 18,
          border: '1px solid #e5e7eb',
          boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 900, color: '#312e81' }}>
          관리자 로그인
        </div>

        <div style={{ fontSize: 13, color: '#6b7280' }}>
          등록된 계정만 로그인할 수 있어.
        </div>

        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 14,
            outline: 'none',
          }}
        />

        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 14,
            outline: 'none',
          }}
        />

        <button
          onClick={login}
          disabled={loading}
          style={{
            border: 'none',
            background: '#6d28d9',
            color: '#fff',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>

        {err && (
          <div
            style={{
              background: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              borderRadius: 12,
              padding: '10px 12px',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {err}
          </div>
        )}
      </div>
    </div>
  )
}