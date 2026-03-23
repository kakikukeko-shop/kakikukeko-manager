import BackupRestoreButtons from './BackupRestoreButtons'

export default function BackupManagerCard() {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e6e6ef',
        borderRadius: 18,
        padding: 18,
        boxShadow: '0 8px 24px rgba(124, 58, 237, 0.05)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#312e81' }}>
          백업관리
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
          백업 다운로드는 현재 데이터를 JSON으로 저장해.
          <br />
          백업 복구는 현재 데이터를 지우고 백업 파일 내용으로 덮어써.
        </div>
      </div>

      <BackupRestoreButtons />

      <div
        style={{
          fontSize: 12,
          color: '#9a3412',
          background: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: 12,
          padding: '10px 12px',
          lineHeight: 1.5,
        }}
      >
        복구 전에 먼저 백업 다운로드 한 번 하고 진행하는 걸 추천해.
      </div>
    </div>
  )
}