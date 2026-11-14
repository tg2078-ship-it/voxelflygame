'use client';
import type { Settings } from './types';

export function DisplayQualityControls({ settings, ko, onChange }: {
    settings: Settings;
    ko: boolean;
    onChange: (patch: Partial<Settings>) => void;
}) {
    const preset = settings.quality === 'ultra' && settings.resolutionScale === 1.25 && !settings.adaptiveResolution;
    return <div className="display-quality-controls">
        <div className="display-quality-heading"><span>{ko ? '화면 선명도' : 'IMAGE CLARITY'}</span><small>{settings.resolutionScale * 100}%</small></div>
        <div className="segmented" role="group" aria-label={ko ? '렌더 해상도' : 'Render resolution'}>
            {([1, 1.25, 1.5] as const).map(scale => <button type="button" key={scale} className={settings.resolutionScale === scale ? 'active' : ''} aria-pressed={settings.resolutionScale === scale} onClick={() => onChange({ resolutionScale: scale, adaptiveResolution: false })}>{scale * 100}%</button>)}
        </div>
        <button type="button" className={'quality-preset ' + (preset ? 'active' : '')} aria-pressed={preset} onClick={() => onChange({ quality: 'ultra', resolutionScale: 1.25, adaptiveResolution: false })}><span>{ko ? '화질 우선 적용' : 'PRIORITISE IMAGE QUALITY'}</span><small>ULTRA · 125%</small></button>
        <p>{ko ? '높은 해상도는 더 선명하지만 그래픽 부하가 증가합니다. 자동 해상도는 기본으로 꺼져 있습니다.' : 'Higher resolution increases clarity and graphics load. Adaptive resolution is off by default.'}</p>
    </div>;
}
