"""Real local-browser interactions; no simulation/time/score mutation.

The seeded localStorage fixture is an existing fresh pilot profile. Inspection
imports the public Zustand HUD/store read-only; the controller issues ordinary
keyboard events. This is automated play, not a human fun or hardware FPS test.
"""
from pathlib import Path
import argparse
import json
import time
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--complete', action='store_true', help='Attempt actual 180-second flight; never advance simulation time artificially.')
parser.add_argument('--wall-limit', type=int, default=360)
parser.add_argument('--output', default='mastery-browser')
args = parser.parse_args()
out = Path('/workspace/site-audit/v8')
out.mkdir(exist_ok=True)
errors, gl_errors, http_failures, trace = [], [], [], []
report = {'status': 'running', 'softwareGPU': True, 'humanPlaytest': False,
          'interaction': 'Native pointer/keyboard; automated steering from the read-only HUD.',
          'fixture': 'Existing fresh skyhawk pilot in localStorage; no flight state, clock, geometry or score injection.',
          'completionAttempt': args.complete}

def snapshot(page):
    return page.evaluate('''()=>{const s=window.__qa.getState();return {phase:s.phase,mode:s.flightMode,time:s.hud.time,navigation:s.hud.navigation,choice:s.hud.choice,sortie:s.hud.sortie,adventure:s.hud.adventure,hp:s.hud.hp,speed:s.hud.speed,modelError:s.modelError,renderError:s.renderError}}''')

def hit_test(button):
    return button.evaluate('''b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,receivesPointer:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}}''')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width':1280, 'height':800})
    page.set_default_timeout(60000)
    page.add_init_script('localStorage.setItem("airrun-save-v3",' + json.dumps(Path('/workspace/site-audit/qa-save.json').read_text()) + ')')
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: gl_errors.append(m.text) if 'GL_INVALID_OPERATION' in m.text or m.type == 'error' else None)
    page.on('response', lambda r: http_failures.append({'status':r.status, 'url':r.url}) if r.status >= 400 else None)
    try:
        page.goto('http://127.0.0.1:5173/', wait_until='domcontentloaded', timeout=60000)
        page.get_by_role('button', name='격납고 입장', exact=True).wait_for(timeout=180000)
        page.evaluate("async()=>{const paths=performance.getEntriesByType('resource').map(r=>r.name).filter(p=>p.includes('/app/airrun/state.ts'));paths.sort((a,b)=>Number(new URL(b).searchParams.get('t')||0)-Number(new URL(a).searchParams.get('t')||0));window.__qa=(await import(paths[0]||'/app/airrun/state.ts')).useAirrun}")
        page.get_by_role('button', name='격납고 입장', exact=True).click()
        page.wait_for_function("window.__qa.getState().phase==='hangar'", timeout=90000)
        print('HANGAR READY', flush=True)
        page.locator('.ops-mode-selector button.sortie').click()
        assert page.evaluate("window.__qa.getState().flightMode") == 'sortie'
        page.locator('.ops-difficulty-selector button').filter(has_text='여유').click()
        assert page.evaluate("window.__qa.getState().save.settings.difficulty") == 'relaxed'
        assert page.locator('.sortie-briefing').is_visible()
        page.get_by_role('button', name='블루 스트릭', exact=True).click()
        assert page.evaluate("window.__qa.getState().contractId") == 'velocity'
        page.get_by_role('button', name='정밀 비행', exact=True).click()
        assert page.evaluate("window.__qa.getState().contractId") == 'precision'
        report['nativeContractSelection'] = True
        page.screenshot(path=str(out/'sortie-briefing-desktop.png'))
        viewports = {}
        for w, h in [(1280,800), (360,800), (844,390)]:
            page.set_viewport_size({'width':w, 'height':h})
            page.wait_for_timeout(250)
            mode = page.locator('.ops-mode-selector button.sortie')
            mode.scroll_into_view_if_needed()
            mode_hit = hit_test(mode)
            assert mode_hit['receivesPointer'], (w,h,mode_hit)
            launch = page.locator('.ops-launch')
            launch_hit = hit_test(launch)
            assert launch_hit['receivesPointer'], (w,h,launch_hit)
            assert launch_hit['x'] >= 0 and launch_hit['y'] >= 0 and launch_hit['x']+launch_hit['width'] <= w+1 and launch_hit['y']+launch_hit['height'] <= h+1, (w,h,launch_hit)
            assert page.evaluate('document.documentElement.scrollWidth') <= w
            viewports[f'{w}x{h}'] = {'sortie': mode_hit, 'launch': launch_hit}
            page.screenshot(path=str(out/f'sortie-briefing-{w}.png'))
        report['hangarViewports'] = viewports
        page.set_viewport_size({'width':1280, 'height':800})
        page.locator('.ops-launch').click()
        page.wait_for_function("window.__qa.getState().phase==='flying'", timeout=180000)
        assert page.locator('.sortie-flight-progress').is_visible()
        report['departure'] = snapshot(page)
        page.screenshot(path=str(out/'sortie-departure.png'))
        print('FLYING', report['departure'], flush=True)
        held = set()
        began = time.monotonic()
        bank_before = None
        while time.monotonic()-began < args.wall_limit:
            live = snapshot(page)
            if live['phase'] != 'flying':
                break
            vault = (live.get('adventure') or {}).get('vault') or {'pending':0, 'banks':0}
            if vault['pending'] > 0 and bank_before is None:
                bank_before = dict(vault)
                for key in held: page.keyboard.up(key)
                held = set()
                page.set_viewport_size({'width':360,'height':800})
                bank = page.locator('.f6-bank')
                bank.wait_for(state='visible')
                report['portraitBankHit'] = hit_test(bank)
                assert report['portraitBankHit']['receivesPointer']
                page.screenshot(path=str(out/'mastery-portrait-bank.png'))
                bank.click()
                page.set_viewport_size({'width':1280,'height':800})
            if not args.complete and (live.get('adventure') or {}).get('completed',0) >= 1 and vault['banks'] >= 1:
                break
            navigation = live.get('navigation') or {'dx':0, 'dy':0}
            desired = {'Space'} if args.complete else set()
            if abs(navigation['dx']) > 1.1:
                desired.add('KeyD' if navigation['dx'] > 0 else 'KeyA')
            if abs(navigation['dy']) > 1.0:
                desired.add('KeyW' if navigation['dy'] > 0 else 'KeyS')
            for key in held-desired:
                page.keyboard.up(key)
            for key in desired-held:
                page.keyboard.down(key)
            held = desired
            if not trace or live['time']-trace[-1]['time'] >= 1:
                trace.append(live)
                print('FLIGHT', live['phase'], round(live['time'],2), live.get('sortie'), flush=True)
            page.wait_for_timeout(80)
        for key in held:
            page.keyboard.up(key)
        report['flightWallSeconds'] = time.monotonic()-began
        report['bankBefore'] = bank_before
        report['lastFlightSnapshot'] = live
        (out/(args.output+'-trace.json')).write_text(json.dumps(trace,ensure_ascii=False,indent=2))
        if args.complete:
            page.wait_for_function("window.__qa.getState().phase==='results'", timeout=30000)
            result = page.evaluate('window.__qa.getState().result')
            assert result['sortie']['completed'] and result['sortie']['elapsed']==180, result
            assert result['sortie']['bonus']==1200 and not result['interrupted'], result
            report['actualCompletedSortie'] = True
        else:
            assert live['phase']=='flying', live
            assert live['adventure']['completed'] >= 1 and live['adventure']['vault']['banks']==1, live
            assert bank_before and live['adventure']['vault']['secured']==bank_before['pending'], live
            page.screenshot(path=str(out/'sortie-flight.png'))
            page.keyboard.press('Escape')
            page.wait_for_function("window.__qa.getState().phase==='paused'")
            before = snapshot(page)
            page.wait_for_timeout(700)
            after = snapshot(page)
            assert before['time']==after['time'] and before['sortie']==after['sortie'], (before,after)
            report['pausedClock'] = {'before':before['sortie'],'after':after['sortie']}
            page.screenshot(path=str(out/'sortie-paused.png'))
            page.get_by_role('button',name='비행 종료 · 결과 확인',exact=True).click()
            page.wait_for_function("window.__qa.getState().phase==='results'")
            result = page.evaluate('window.__qa.getState().result')
            assert result['mode']=='sortie' and not result['sortie']['completed'] and result['sortie']['bonus']==0, result
            assert result['interrupted'], result
            report['actualCompletedSortie'] = False
        report['result'] = result
        original_seed = result['seed']
        page.screenshot(path=str(out/'sortie-results.png'))
        report['storedRuns'] = page.evaluate('window.__qa.getState().save.runs.length')
        assert report['storedRuns']==1
        for w,h in [(1280,800),(360,800),(844,390)]:
            page.set_viewport_size({'width':w,'height':h})
            page.wait_for_timeout(200)
            retry = page.locator('.result-actions .primary')
            assert hit_test(retry)['receivesPointer'], (w,h,hit_test(retry))
            assert page.evaluate('document.documentElement.scrollWidth')<=w
        page.set_viewport_size({'width':1280,'height':800})
        page.locator('.result-actions .primary').click()
        page.wait_for_function("window.__qa.getState().phase==='flying'",timeout=180000)
        retry = snapshot(page)
        assert retry['mode']=='sortie' and not retry['sortie']['completed'] and retry['sortie']['elapsed']<10, retry
        assert page.evaluate("window.__qa.getState().seed") == original_seed
        assert page.evaluate("window.__qa.getState().runLevel") == result['level']
        report['sameRouteSeedPreserved'] = True
        report['nativeRetry'] = retry
        page.keyboard.press('Escape')
        report.update({'javascriptErrors':errors,'webglErrors':gl_errors,'httpFailures':http_failures})
        assert not errors and not gl_errors and not http_failures, report
        report['status']='passed'
        print('PASS', json.dumps(report,ensure_ascii=False), flush=True)
    except Exception as e:
        report.update({'status':'failed','error':str(e),'javascriptErrors':errors,'webglErrors':gl_errors,'httpFailures':http_failures})
        try:
            page.screenshot(path=str(out/(args.output+'-failure.png')))
            report['bodyAtFailure']=page.locator('body').inner_text()[:5000]
        except Exception:
            pass
        raise
    finally:
        (out/(args.output+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
        browser.close()
