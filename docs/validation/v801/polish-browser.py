from pathlib import Path
import json
from playwright.sync_api import sync_playwright
out=Path('/workspace/site-audit/v801'); errors=[]
report={'fixture':'Native hangar selection, then injected HUD progress and genuine CPU completion data for UI checks. No simulation or performance claim.','softwareGPU':True}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1280,'height':800});page.set_default_timeout(60000)
 page.add_init_script('localStorage.setItem("airrun-save-v3",'+json.dumps(Path('/workspace/site-audit/qa-save.json').read_text())+')')
 page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.goto('http://127.0.0.1:5173/',wait_until='domcontentloaded')
  page.get_by_role('button',name='격납고 입장',exact=True).wait_for(timeout=180000)
  page.evaluate("async()=>{const paths=performance.getEntriesByType('resource').map(r=>r.name).filter(p=>p.includes('/app/airrun/state.ts'));paths.sort((a,b)=>Number(new URL(b).searchParams.get('t')||0)-Number(new URL(a).searchParams.get('t')||0));window.__qa=(await import(paths[0]||'/app/airrun/state.ts')).useAirrun}")
  page.get_by_role('button',name='격납고 입장',exact=True).click()
  page.locator('.ops-mode-selector button.sortie').click()
  choice=page.get_by_role('button',name='블루 스트릭',exact=True);choice.focus();page.keyboard.press('Enter')
  assert choice.get_attribute('aria-pressed')=='true'
  assert choice.evaluate('e=>getComputedStyle(e).outlineStyle')=='solid'
  page.screenshot(path=str(out/'selection.png'))
  report['nativeKeyboardSelection']=True
  hud=json.loads(Path('/workspace/site-audit/v8/mastery-browser.json').read_text())['departure']
  contract={'id':'precision','progress':4,'targets':[3,6,9],'tier':1,'bonus':150}
  page.evaluate('(data)=>window.__qa.setState({phase:"flying",hud:{...window.__qa.getState().hud,...data.hud,contract:data.contract}})',{'hud':hud,'contract':contract})
  bars=page.locator('.contract-hud [role=progressbar]')
  assert [bars.nth(i).get_attribute('aria-valuenow') for i in range(3)]==['3','1','0']
  assert '다음까지 2회' in page.locator('.contract-hud footer').inner_text()
  assert page.locator('.contract-tier').get_attribute('aria-label')=='1/3 단계 달성'
  page.screenshot(path=str(out/'hud-tier-fixture.png'))
  report['sequentialProgress']=[3,1,0]
  for w,h in [(1280,800),(360,800),(844,390)]:
   page.set_viewport_size({'width':w,'height':h})
   assert page.evaluate('document.documentElement.scrollWidth')<=w
   assert page.locator('.contract-hud').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
  page.set_viewport_size({'width':1280,'height':800})
  page.evaluate('()=>{const s=window.__qa.getState();window.__qa.setState({save:{...s.save,settings:{...s.save.settings,reducedMotion:true}}})}')
  assert page.locator('.contract-milestones .earned').evaluate('e=>getComputedStyle(e).animationName')=='none'
  assert page.locator('.contract-milestones i').first.evaluate('e=>getComputedStyle(e).transitionDuration')=='0s'
  page.evaluate('()=>{const s=window.__qa.getState();window.__qa.setState({save:{...s.save,settings:{...s.save.settings,reducedMotion:false}}})}')
  page.emulate_media(reduced_motion='reduce')
  assert page.locator('.contract-milestones .earned').evaluate('e=>getComputedStyle(e).animationName')=='none'
  report['gameAndSystemReducedMotion']=True
  page.emulate_media(reduced_motion='no-preference')
  page.evaluate('()=>{const s=window.__qa.getState();window.__qa.setState({hud:{...s.hud,contract:{...s.hud.contract,progress:9,tier:3,bonus:1050}}})}')
  assert '목표 완수' in page.locator('.contract-hud footer').inner_text()
  assert '1,050' in page.locator('.contract-hud footer').inner_text()
  page.screenshot(path=str(out/'hud-complete-fixture.png'))
  result=json.loads(Path('/workspace/site-audit/v8/completed-flight.json').read_text())
  page.evaluate('(r)=>window.__qa.setState({phase:"results",result:r})',result)
  assert page.locator('.contract-debrief.all-clear .contract-seals .earned').count()==3
  page.locator('.contract-debrief').scroll_into_view_if_needed()
  page.locator('.contract-debrief').screenshot(path=str(out/'completed-card-fixture.png'))
  assert not errors
  report.update({'status':'passed','javascriptErrors':errors,'viewports':['1280x800','360x800','844x390'],'completedSeals':3})
 except Exception as e:
  report.update({'status':'failed','error':str(e),'javascriptErrors':errors})
  page.screenshot(path=str(out/'failure.png'));raise
 finally:
  (out/'browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));browser.close()
print(json.dumps(report,ensure_ascii=False))
