'use client'
import React, { useRef, useState } from 'react'
export default function RefreshButton({ run, disabled, style, className }: { run: () => Promise<unknown>; disabled?: boolean; style?: React.CSSProperties; className?: string }) {
 const [busy,setBusy]=useState(false)
 const [status,setStatus]=useState('')
 const [failed,setFailed]=useState(false)
 const lock=useRef(false)
 return <span style={{display:'inline-flex',alignItems:'center',gap:7,flexWrap:'wrap'}}><button type="button" style={style} className={className} disabled={disabled||busy} aria-busy={busy} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);setStatus('');setFailed(false);try{const result=await run();if(result===false)throw new Error('일부 데이터를 불러오지 못했어요. 오류 안내를 확인해 주세요.');setStatus(`갱신 완료 · ${new Date().toLocaleTimeString('ko-KR',{hour12:false})}`)}catch(e:any){setFailed(true);setStatus(`갱신 실패 · ${e?.message||'연결을 확인해 주세요.'}`)}finally{lock.current=false;setBusy(false)}}}>{busy?'불러오는 중…':'새로고침'}</button><span role="status" aria-live="polite" style={{fontSize:11,color:failed?'#b91c1c':'#047857',overflowWrap:'anywhere'}}>{status}</span></span>
}
