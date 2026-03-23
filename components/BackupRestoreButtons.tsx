'use client'

import { useRef, useState } from 'react'

export default function BackupRestoreButtons() {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [loading, setLoading] = useState(false)

  const handleBackup = async () => {
    try {
      setLoading(true)

      const res = await fetch('/api/backup')
      const json = await res.json()

      if (!res.ok || !json?.ok) {
        alert(json?.error || '백업 실패')
        return
      }

      const blob = new Blob([JSON.stringify(json.data, null, 2)], {
        type: 'application/json',
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = json.filename || `backup-${new Date().toISOString()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('백업 중 오류가 났어.')
    } finally {
      setLoading(false)
    }
  }

  const handleRestoreClick = () => {
    fileRef.current?.click()
  }

  const handleRestoreFile = async (file: File) => {
    const ok = window.confirm(
      '복구하면 현재 데이터가 지워지고 백업 데이터로 덮어써져.\n진행할까?'
    )
    if (!ok) return

    try {
      setLoading(true)

      const text = await file.text()
      const json = JSON.parse(text)

      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      })

      const data = await res.json()

      if (!res.ok) {
        alert(data?.error || '복구 실패')
        return
      }

      alert('복구 완료')
      window.location.reload()
    } catch (e) {
      alert('복구 파일이 잘못됐거나 복구 중 오류가 났어.')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <button
        type="button"
        onClick={handleBackup}
        disabled={loading}
        style={{
          border: '1px solid #2563eb',
          background: '#2563eb',
          color: '#fff',
          padding: '10px 14px',
          borderRadius: 12,
          cursor: 'pointer',
          fontWeight: 800,
          fontSize: 13,
          whiteSpace: 'nowrap',
        }}
      >
        {loading ? '처리 중...' : '백업 다운로드'}
      </button>

      <button
        type="button"
        onClick={handleRestoreClick}
        disabled={loading}
        style={{
          border: '1px solid #dc2626',
          background: '#fff',
          color: '#dc2626',
          padding: '10px 14px',
          borderRadius: 12,
          cursor: 'pointer',
          fontWeight: 800,
          fontSize: 13,
          whiteSpace: 'nowrap',
        }}
      >
        {loading ? '처리 중...' : '백업 복구'}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleRestoreFile(file)
        }}
      />
    </div>
  )
}