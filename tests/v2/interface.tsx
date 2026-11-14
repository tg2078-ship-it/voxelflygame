import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Game from '../../app/airrun/Game';
import { LoadingScreen, PilotRegistration, RewardCeremony } from '../../app/airrun/interface';
import { useAirrun } from '../../app/airrun/state';
import { AIRCRAFT, freshSave } from '../../app/airrun/data';
import { ensureQuests } from '../../app/airrun/progression';
let checks = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; };
const base = useAirrun.getInitialState(), snapshot = { ...base };
const save = ensureQuests(freshSave()); save.nickname = 'TEST PILOT';
for (const panel of ['hangar','challenges','atlas','collection','livery','records','settings','controls'] as const) {
    Object.assign(base, { ...snapshot, phase: 'hangar', panel, save });
    const html = renderToStaticMarkup(<Game/>);
    check(!html.includes('연습 비행') && !html.includes('PRACTICE'), 'public practice is removed from ' + panel);
    if (panel === 'hangar') {
        check(html.includes('data-hangar-stage'), 'interactive aircraft stage');
        check(html.includes('무한 비행 출격'), 'departure action');
        const cards = [...html.matchAll(/data-aircraft-id="([^"]+)"/g)].map(match => match[1]);
        check(cards.length === AIRCRAFT.length && new Set(cards).size === AIRCRAFT.length, 'every fleet card is independently discoverable for lazy native previews');
        check(cards.every((id, index) => id === AIRCRAFT[index].id), 'fleet preview identities match the actual ordered aircraft catalog');
        const otherPlane = AIRCRAFT.find(plane => plane.id !== save.selected)!;
        const nativePreview = 'data:image/jpeg;base64,/9j/native-preview-fixture';
        Object.assign(base, { previewImages: { ['aircraft:' + otherPlane.id]: nativePreview } });
        const withPreview = renderToStaticMarkup(<Game/>);
        check(withPreview.includes('src="' + nativePreview + '"'), 'an unselected fleet card displays its captured preview without selecting that plane');

        check(html.includes('ops-mode-selector') && html.includes('오늘의 항로') && html.includes('무한 항로'), 'hangar offers two real flight modes with route briefing');
        check(html.includes('ops-fleet-filters') && html.includes('기체 업그레이드') && html.includes('다음 조종사 목표'), 'hangar connects collection filtering, upgrades, and saved career goals');
        const dailySave = structuredClone(save); dailySave.settings.difficulty = 'expert';
        Object.assign(base, { save: dailySave, flightMode: 'daily' });
        const dailyHtml = renderToStaticMarkup(<Game/>);
        check(dailyHtml.includes('오늘의 항로 출격') && dailyHtml.includes('같은 날에는 같은 생성 시드'), 'daily mode changes the actual departure action and explains seed consistency');
        const difficulty = dailyHtml.split('class="ops-difficulty-selector"')[1]?.split('</div>')[0] ?? '';
        check((difficulty.match(/disabled=""/g) ?? []).length === 3 && difficulty.includes('aria-pressed="true" disabled="" class="selected">표준'), 'daily uses locked standard controls even with expert endless preference');

    }
    if (panel === 'challenges') { check(html.includes('미션 변경권') && html.includes('500m'), 'mission change explanation'); check(html.includes('YOUR PILOT JOURNEY') && html.includes('ops-progress-cards'), 'challenge centre has saved career, contract, and achievement overview'); }
    if (panel === 'atlas') check(html.includes('게임 장면 준비 중') && html.includes('같은 게임 모델'), 'honest native scene previews');
    if (panel === 'livery') check(html.includes('data-hangar-stage'), 'livery preview keeps the native aircraft visible');
    if (panel === 'settings') check(html.includes('조종사 카드 재발급') && html.includes('그래픽 품질') && html.includes('전체 화면 전환'), 'settings include working graphics and pilot card reissue');
}
Object.assign(base, snapshot);
const loading = renderToStaticMarkup(<LoadingScreen progress={.5} label="TEST" ko/>);
check(loading.includes('50') && loading.includes('aria-valuenow="50"'), 'actual loading progress is visible and accessible');
check(loading.includes('EXPEDITION CHART') && loading.includes('01 / COAST') && loading.includes('03 / CITY'), 'entry introduces the authored world sequence as a flight chart');
check(renderToStaticMarkup(<PilotRegistration ko reduced={false} initialName="PILOT" onApprove={() => {}} onSound={() => {}}/>).includes('승인 요청'), 'registration sequence entry');
check(renderToStaticMarkup(<RewardCeremony ko reduced={false} reward={{ id:'test', kind:'quest', title:'TEST',titleEn:'TEST',coins:45,tier:1 }} onClose={() => {}}/>).includes('CONTRACT') === false, 'Korean reward presentation');
console.log(JSON.stringify({ interfaceContracts: checks, browserOrLayoutVerified: false, gpuVerified: false, status: 'passed' }));
