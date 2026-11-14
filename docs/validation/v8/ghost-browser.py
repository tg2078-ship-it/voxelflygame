from pathlib import Path
import json
from playwright.sync_api import sync_playwright
out=Path('/workspace/site-audit/v8');errors=[]
report={'fixture':'Completed result and ghost profile from a real 180-second CPU-controlled flight; result presentation is injected, subsequent retry uses native UI. No claim of a 180-second browser completion.','softwareGPU':True}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1280,'height':800});page.set_default_timeout(60000)
 page.on('pageerror',lambda e:errors.append(str(e)))
 profile=json.loads((out/'ghost-profile.json').read_text());result=json.loads((out/'completed-flight.json').read_text())
 page.add_init_script('localStorage.setItem("airrun-save-v3",'+json.dumps(json.dumps(profile))+')')
 try:
  page.goto('http://127.0.0.1:5173/',wait_until='domcontentloaded')
  page.get_by_role('button',name='격납고 입장',exact=True).wait_for(timeout=180000)
  page.evaluate("async()=>{const paths=performance.getEntriesByType('resource').map(r=>r.name).filter(p=>p.includes('/app/airrun/state.ts'));paths.sort((a,b)=>Number(new URL(b).searchParams.get('t')||0)-Number(new URL(a).searchParams.get('t')||0));window.__qa=(await import(paths[0]||'/app/airrun/state.ts')).useAirrun}")
  page.evaluate('(r)=>window.__qa.setState({phase:"results",result:r})',result)
  assert page.locator('.sortie-debrief.completed').is_visible()
  assert page.locator('.contract-debrief').inner_text().find('1,050')>=0
  for w,h in [(1280,800),(360,800),(844,390)]:
   page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(200)
   for selector in ['[data-rematch]','.result-actions .secondary.launch','.result-actions .secondary:not(.launch)']:
    hit=page.locator(selector).evaluate('b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}}')
    assert hit['hit'] and hit['x']>=0 and hit['y']>=0 and hit['x']+hit['w']<=w+1 and hit['y']+hit['h']<=h+1,(selector,w,h,hit)
   page.screenshot(path=str(out/f'mastery-completed-fixture-{w}.png'))
  page.set_viewport_size({'width':1280,'height':800});page.locator('[data-rematch]').click()
  page.wait_for_function("window.__qa.getState().phase==='flying'",timeout=180000)
  page.wait_for_function('!!window.__qa.getState().hud.ghost',timeout=60000)
  ghost=page.evaluate('window.__qa.getState().hud.ghost');assert ghost['score']==result['score']
  assert page.evaluate('window.__qa.getState().seed')==result['seed']
  page.keyboard.down('Shift');page.wait_for_timeout(1500);page.keyboard.up('Shift')
  page.screenshot(path=str(out/'mastery-ghost-rematch.png'))
  report.update({'status':'passed','ghost':ghost,'seed':result['seed'],'replaySamples':len(result['replay']['samples']),'completedLayoutViewports':['1280x800','360x800','844x390'],'nativeRematch':True,'javascriptErrors':errors})
  assert not errors
  page.keyboard.press('Escape')
 except Exception as e:
  report.update({'status':'failed','error':str(e),'javascriptErrors':errors})
  page.screenshot(path=str(out/'ghost-browser-failure.png'));raise
 finally:
  (out/'ghost-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));browser.close()
print(json.dumps(report,ensure_ascii=False))
