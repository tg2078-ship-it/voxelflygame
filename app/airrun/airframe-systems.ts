import type { Aircraft } from './types';

export const MODULES = {
    capacitor: {name:'정밀 축전기', en:'Precision capacitor'},
    turbine: {name:'회피 터빈', en:'Slipstream turbine'},
    repair: {name:'정비 펌프', en:'Recovery pump'},
} as const;
type System = keyof typeof MODULES;
export function airframeSystem(plane: Aircraft): System | undefined {
    if (plane.grade !== 'A' && plane.grade !== 'S') return;
    if (['extra','sailplane','delta','swept'].includes(plane.id)) return 'capacitor';
    if (['mustang','twinboom','albatros','falcon'].includes(plane.id)) return 'turbine';
    return 'repair';
}
export function systemSpec(plane: Aircraft) {
    const id = airframeSystem(plane);
    if (!id) return;
    const top = plane.grade==='S';
    if (id==='capacitor') return {id,...MODULES[id],strength:top?22:12, ko:`링 정중앙 통과 시 러시 +${top?22:12}%`, description:`Dead-centre rings grant +${top?22:12}% rush charge`};
    if (id==='turbine') return {id,...MODULES[id],strength:top?14:9,ko:`근접 회피·정밀 경로 통과 후 3초간 속도 +${top?14:9}%`,description:`Close calls or precision lines give +${top?14:9}% speed for 3s`};
    return {id,...MODULES[id],strength:top?10:6,ko:`구조물 통로 2회 통과 시 내구도 ${top?10:6}% 수리`,description:`Clear two structural passages to repair ${top?10:6}% hull`};
}
export interface ModuleHUD {name:string; en:string; active:boolean; id:System; strength:number; progress:number}

