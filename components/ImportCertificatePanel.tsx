'use client'
import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SafeModal from './SafeModal'
type Tax = { id: string; date: string | null; vendor: string; amount: number; currency: string | null; fx_rate: number; items: {id:string;name:string|null;vendor:string|null}[]; token: string; state_token: string; printed_at: string | null; declaration_date: string | null }
const btn: React.CSSProperties={padding:'8px 12px',border:'1px solid #ddd6fe',borderRadius:10,background:'#fff',cursor:'pointer',fontWeight:700}
export default function ImportCertificatePanel(_props: { items?: {id:string;name:string;vendor:string}[]; selectedIds?: string[] }) {
 const [rows,setRows]=useState<Tax[]>([])
 const [expanded,setExpanded]=useState(false)
 const [filter,setFilter]=useState('unprinted')
 const [search,setSearch]=useState('')
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [ready,setReady]=useState(false)
 const [confirm,setConfirm]=useState<Tax|null>(null)
 const [dateEditor,setDateEditor]=useState<Tax|null>(null)
 const [declarationDate,setDeclarationDate]=useState('')
 const [productView,setProductView]=useState<Tax|null>(null)
 const lock=useRef(false)
 async function load(){setError('');const r=await supabase.rpc('import_tax_certificate_source');if(r.error)throw r.error;setRows(r.data||[]);setReady(true)}
 useEffect(()=>{if(window.location.hash==='#import-certificates')setExpanded(true);load().catch(e=>setError(e.message))},[])
 const visible=rows.filter(row=>(filter==='all'||(filter==='printed'?!!row.printed_at:!row.printed_at))&&`${row.vendor} ${row.date||''} ${row.declaration_date||''} ${row.items.map(item=>item.name||'').join(' ')}`.toLowerCase().includes(search.toLowerCase()))
 async function save(){if(!confirm||lock.current)return;lock.current=true;setBusy(true);setError('');try{const r=await supabase.rpc('set_import_tax_certificate_printed',{p_cost_id:confirm.id,p_printed:!confirm.printed_at,p_source_token:confirm.token,p_state_token:confirm.state_token});if(r.error)throw r.error;setConfirm(null);await load()}catch(e:any){setError(e.message)}finally{lock.current=false;setBusy(false)}}
 return <section id="import-certificates" style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:14,padding:14,marginBottom:14}}>
  <style>{`#import-certificates [data-certificate-grid]{grid-auto-rows:190px!important;max-height:390px!important;overflow-y:auto!important;min-height:0!important;align-content:start!important}#import-certificates [data-certificate-grid]>div{height:190px!important;min-height:0!important;box-sizing:border-box!important;overflow-y:auto!important}`}</style>
  <details open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary style={{cursor:'pointer',fontWeight:800,color:'#4338ca'}}>수입신고필증 · {ready?`미출력 ${rows.filter(row=>!row.printed_at).length}건`:'불러오는 중'}</summary>
   <p style={{fontSize:12,color:'#6b7280'}}>관부가세 1건마다 배분된 상품을 자동으로 보여줘요. 서류를 직접 출력한 뒤 ‘출력 완료’를 체크하세요. 상품을 따로 선택할 필요가 없어요.</p>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}><input aria-label="신고필증 검색" placeholder="거래처 / 신고일 / 비용일 / 상품 검색" value={search} onChange={e=>setSearch(e.target.value)} style={{padding:9,border:'1px solid #d1d5db',borderRadius:9}}/><select aria-label="출력 상태 필터" value={filter} onChange={e=>setFilter(e.target.value)} style={btn}><option value="unprinted">미출력</option><option value="printed">출력 완료</option><option value="all">전체</option></select><button style={btn} disabled={busy} onClick={()=>{setBusy(true);load().catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>새로고침</button></div>
   {!ready&&!error?<p>관부가세 내역을 불러오고 있어요.</p>:!visible.length&&!error?<p style={{color:'#6b7280',fontSize:13}}>해당하는 관부가세 내역이 없어요.</p>:null}
   <div data-certificate-grid style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',gap:10,gridAutoRows:'190px',maxHeight:390,overflowY:'auto',overscrollBehavior:'contain',scrollbarGutter:'stable'}}>
   {visible.map(row=><div key={row.id} style={{border:'1px solid #eeeaf5',borderRadius:10,padding:12,minWidth:0,overflowWrap:'anywhere',boxSizing:'border-box',height:'100%',overflowY:'auto'}}><div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><b style={{fontSize:14}}>{row.vendor}</b><span style={{fontWeight:800,color:row.printed_at?'#047857':'#b45309'}}>{row.printed_at?'출력 완료':'미출력'}</span></div><div style={{fontSize:12,marginTop:6}}>수입신고일: <b>{row.declaration_date || '미입력'}</b> <button style={{border:0,background:'transparent',color:'#6d28d9',cursor:'pointer',padding:3}} disabled={busy} onClick={()=>{setError('');setDateEditor(row);setDeclarationDate(row.declaration_date||'')}}>수정</button></div><div style={{fontSize:11,color:'#6b7280'}}>관부가세 비용일: {row.date || '미입력'}</div><div style={{fontSize:12,color:'#6b7280',margin:'6px 0'}}>관부가세 {Number(row.amount||0).toLocaleString('ko-KR')} {row.currency||'KRW'} · {row.items.length}종{row.printed_at?` · 출력 확인 ${new Date(row.printed_at).toLocaleDateString('ko-KR')}`:''}</div><button style={{border:0,background:'transparent',color:'#4338ca',padding:'3px 0',cursor:'pointer',fontSize:12}} onClick={()=>setProductView(row)}>함께 배분된 상품 {row.items.length}종 보기</button>{!row.items.length?<p style={{color:'#b45309',fontSize:12}}>배분된 상품이 없어요. 관부가세 추가비용의 배분 대상을 확인해 주세요.</p>:null}<button style={{...btn,marginTop:8}} disabled={busy||!row.items.length} onClick={()=>{setError('');setConfirm(row)}}>{row.printed_at?'미출력으로 되돌리기':'출력 완료 체크'}</button></div>)}
   </div>
   <p style={{fontSize:12,color:'#6b7280'}}>관부가세 금액·날짜·거래처 또는 배분 상품이 바뀌면 미출력으로 표시돼요. 취소한 관부가세는 제외해요.</p>
  </details>{error?<p role="alert" style={{color:'#b91c1c'}}>{error}</p>:null}
  <SafeModal open={!!productView} title="함께 배분된 상품" onClose={()=>setProductView(null)}><div style={{display:'grid',gap:8}}><b>{productView?.vendor} · 관부가세 비용일 {productView?.date || '미입력'}</b>{productView?.items.map(item=><div key={item.id} style={{padding:7,borderBottom:'1px solid #eee'}}>{item.name||'상품명 없음'}{item.vendor?` · ${item.vendor}`:''}</div>)}</div></SafeModal>
  <SafeModal open={!!dateEditor} title="수입신고일 입력" onClose={()=>{if(!busy)setDateEditor(null)}}><div style={{display:'grid',gap:12}}><b>{dateEditor?.vendor}</b><div style={{fontSize:12}}>수입신고필증에 적힌 신고일을 입력하세요. 관부가세 비용일과 별도로 저장해요.</div><input type="date" aria-label="수입신고일" value={declarationDate} disabled={busy} onChange={e=>setDeclarationDate(e.target.value)} style={{padding:10,border:'1px solid #d1d5db',borderRadius:9}}/><button style={btn} disabled={busy} onClick={()=>setDeclarationDate('')}>날짜 지우기</button>{error?<div role="alert" style={{color:'#b91c1c'}}>{error}</div>:null}<button style={btn} disabled={busy} onClick={async()=>{if(!dateEditor||lock.current)return;lock.current=true;setBusy(true);setError('');try{const r=await supabase.rpc('set_import_tax_declaration_date',{p_cost_id:dateEditor.id,p_date:declarationDate||null,p_source_token:dateEditor.token,p_state_token:dateEditor.state_token});if(r.error)throw r.error;setDateEditor(null);await load()}catch(e:any){setError(e.message)}finally{lock.current=false;setBusy(false)}}}>신고일 저장</button></div></SafeModal>
  <SafeModal open={!!confirm} title="수입신고필증 출력 확인" onClose={()=>{if(!busy)setConfirm(null)}}><div style={{display:'grid',gap:12}}><b>{confirm?.vendor} · 수입신고일 {confirm?.declaration_date || '미입력'}</b><div>관부가세를 함께 배분한 {confirm?.items.length}종의 신고필증을 {confirm?.printed_at?'미출력으로 되돌릴까요?':'출력 완료로 표시할까요?'}</div><div style={{fontSize:12,color:'#6b7280'}}>출력 여부만 기록하며 상품 수량과 금액은 바뀌지 않아요.</div>{error?<div role="alert" style={{color:'#b91c1c'}}>{error}</div>:null}<button style={btn} disabled={busy} onClick={save}>확인 후 변경</button></div></SafeModal>
 </section>
}
