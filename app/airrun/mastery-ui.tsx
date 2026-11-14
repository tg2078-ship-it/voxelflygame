import { Crosshair, Gauge, Flame, Check, Flag } from 'lucide-react';
import { CONTRACTS, CONTRACT_REWARDS, type ContractId, type ContractResult } from './mastery';
import { fmt } from './data';

export function ContractSelector({ selected, onSelect, ko }: { selected: ContractId; onSelect: (id: ContractId) => void; ko: boolean }) {
    return <section className="contract-selector" aria-label={ko ? '이번 비행의 스타일' : 'Your flight style'}>
        <header>{ko ? '이번에는, 어떤 비행을 할까요?' : 'CHOOSE YOUR FLIGHT STYLE'}<span>3 TIERS · +1,050 PTS</span></header>
        <div>{(Object.keys(CONTRACTS) as ContractId[]).map(id => {
            const item=CONTRACTS[id], Icon=id==='precision'?Crosshair:id==='velocity'?Gauge:Flame;
            return <button type="button" key={id} aria-pressed={selected===id} className={selected===id?'selected':''} onClick={()=>onSelect(id)}><Icon size={17}/><b>{ko?item.label:item.en}</b>{selected===id&&<Check size={12}/>}</button>;
        })}</div>
        <p>{ko?CONTRACTS[selected].instruction:CONTRACTS[selected].instructionEn}</p>
        <small>{ko?'E 없이 완주하면 비행 고스트를 남깁니다. 같은 항로에서 내 기록에 도전하세요.':'Finish without Hyper to record your ghost. Rematch the same route and beat your flight.'}</small>
    </section>;
}
export function ContractHUD({ contract, ko }: { contract: ContractResult; ko: boolean }) {
    const c=contract,item=CONTRACTS[c.id],next=c.targets[Math.min(2,c.tier)];
    const unit=c.id==='velocity'?'m':ko?'회':'PASSES';
    return <section className={'f6-operation contract-hud '+(c.tier===3?'completed':'')} aria-label={ko?'이번 출격 목표':'Sortie contract'}>
        <header><span><Flag size={13}/>{ko?'나의 비행 목표':'FLIGHT CONTRACT'}</span><b key={c.id+c.tier} className={c.tier?'contract-tier earned':'contract-tier'} role="status" aria-label={ko?`${c.tier}/3 단계 달성`:`${c.tier} of 3 tiers cleared`}>{c.tier}/3</b></header>
        <h2>{ko?item.label:item.en}</h2><p>{ko?item.instruction:item.instructionEn}</p>
        <div className="contract-milestones">{c.targets.map((target,index)=>{
            const start=index?c.targets[index-1]:0,progress=Math.max(0,Math.min(target-start,c.progress-start));
            return <div key={target} className={index<c.tier?'earned':index===c.tier?'current':''} role="progressbar" aria-label={ko?`${index+1}단계 · ${CONTRACT_REWARDS[index]}점`:`Tier ${index+1} · ${CONTRACT_REWARDS[index]} points`} aria-valuemin={0} aria-valuemax={target-start} aria-valuenow={progress} aria-valuetext={`${fmt(Math.min(c.progress,target))} / ${fmt(target)} ${unit}`} title={`${fmt(target)} ${unit} · +${CONTRACT_REWARDS[index]} PTS`}><i style={{width:progress/(target-start)*100+'%'}}/><span>{index<c.tier?<Check size={11}/>:index+1}<b>+{CONTRACT_REWARDS[index]}</b></span></div>;
        })}</div>
        <footer><span>{c.tier===3?(ko?'목표 완수':'ALL CLEAR'):ko?`다음까지 ${fmt(Math.max(0,next-c.progress))}${unit}`:`${fmt(Math.max(0,next-c.progress))} ${unit} TO GO`}</span><b>{c.tier===3?`+${fmt(c.bonus)} PTS`:`+${fmt(CONTRACT_REWARDS[c.tier])} PTS`}</b></footer>
    </section>;
}
export function ContractDebrief({ contract, ko }: { contract: ContractResult; ko: boolean }) {
    const item=CONTRACTS[contract.id];
    return <div className={'contract-debrief '+(contract.tier===3?'all-clear':'')}><span className="contract-insignia" aria-hidden="true">{contract.tier===3?<Check size={20}/>:<Flag size={18}/>}</span><div><b>{ko?item.label:item.en}</b><span>{contract.tier}/3 {ko?'단계 달성':'TIERS CLEARED'} · {fmt(contract.progress)} {contract.id==='velocity'?'m':ko?'회':'PASSES'}</span><div className="contract-seals" aria-hidden="true">{CONTRACT_REWARDS.map((reward,index)=><i key={reward} className={index<contract.tier?'earned':''}/>)}</div></div><strong>+{fmt(contract.bonus)}<small>PTS</small></strong></div>;
}
