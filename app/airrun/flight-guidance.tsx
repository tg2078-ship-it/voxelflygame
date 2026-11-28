import type { HUD } from './types';
export function FlightGuidance({ hud, ko }: { hud: HUD; ko: boolean }) {
    const next = hud.navigation, screen = next?.screen;
    const choice = hud.choice;
    if (choice && hud.eRemaining <= 0 && choice.safe.screen?.visible && choice.risk.screen?.visible) return <>
        {(['safe', 'risk'] as const).map(kind => {
            const lane = choice[kind], marker = lane.screen!;
            const aligned = Math.hypot(lane.dx / lane.radiusX, lane.dy / lane.radiusY) <= 1;
            const onLeft = marker.x < choice[kind === 'safe' ? 'risk' : 'safe'].screen!.x;
            return <div key={kind} className={`flight-guidance choice-guidance choice-${kind} ${aligned ? 'aligned' : ''} ${onLeft ? 'label-left' : 'label-right'}`} style={{ left: marker.x + '%', top: marker.y + '%' }} aria-hidden="true">
                {kind === 'safe' ? <svg viewBox="0 0 60 40"><path d="M14 2H3v10M46 2h11v10M3 28v10h11M57 28v10H46"/><path className="guidance-centre" d="M23 20h5m4 0h5M30 16v8"/></svg>
                    : <svg viewBox="0 0 40 40"><path d="M20 2 38 20 20 38 2 20Z"/><path className="guidance-centre" d="M15 20h10M20 15v10"/></svg>}
                <span className="choice-caption">{kind === 'safe' ? (ko ? '기본' : 'MAIN') : (ko ? '정밀' : 'PRECISION')}<b>{kind === 'safe' ? Math.ceil(choice.distance) + ' m' : '+' + choice.bonus}</b></span>
            </div>;
        })}
    </>;
    if (!next || !screen?.visible || hud.eRemaining > 0) return null;
    if (hud.ringSight && !hud.ringSight.edge && Math.abs(hud.ringSight.distance-next.distance)<2) return null;
    const aligned = Math.abs(next.dx) < 4 && Math.abs(next.dy) < 3;
    const race = hud.relay && !hud.coach && next.role !== 'orientation';
    const labels = ko ? ['랠리 출발', '중간 계측', '랠리 결승'] : ['RALLY START', 'SPLIT', 'RALLY FINISH'];
    return <div className={'flight-guidance ' + (aligned ? 'aligned' : '')} style={{ left: screen.x + '%', top: screen.y + '%' }} aria-hidden="true">
        <svg viewBox="0 0 60 40"><path d="M14 2H3v10M46 2h11v10M3 28v10h11M57 28v10H46"/><path className="guidance-centre" d="M23 20h5m4 0h5M30 16v8"/></svg>
        <span>{race ? labels[hud.relay!.chain] : aligned ? (ko ? '통과 경로' : 'ON COURSE') : (ko ? '다음 경로' : 'NEXT PASSAGE')}<b>{Math.ceil(next.distance)} m</b></span>
    </div>;
}
