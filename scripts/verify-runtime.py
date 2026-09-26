"""Browser regressions for DOM performance changes.

Run pnpm build first, then (with Python Playwright + Chromium installed):
python3 scripts/verify-runtime.py
Uses the project's Vite/esbuild installation; no website or real account is accessed.
"""
import json
from pathlib import Path
import subprocess
import tempfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

BUILD = r"""
const fs = require('fs'), path = require('path'), { createRequire } = require('module');
const root = process.argv[2], output = process.argv[3];
const req = createRequire(path.join(root, 'package.json'));
const esbuild = createRequire(req.resolve('vite/package.json'))('esbuild');
const entries = [
 ['src/content/modules/branch.ts', 'window.branchTest={init:a=>{adapter=a;enabled=true},scan:findNativeSelectionToolbar,consume:consumePendingBranchDraft,disable:branch.disable};', 'branch'],
 ['src/content/modules/markdown-copy.ts', 'window.copyTest=markdownCopy;', 'copy'],
 ['src/content/modules/conversation-navigator.ts', 'window.navTest=conversationNavigator;', 'nav'],
 ['src/content/modules/floating-panel.ts', 'window.floatingTest=floatingPanel;', 'floating'],
 ['src/content/sites/chatgpt.ts', 'window.adapterTest=chatgptAdapter;', 'adapter'],
 ['src/content/chatgpt-native-bridge.ts', 'window.bridgeTest={setApi:a=>attachmentApi=a,setLegacy:n=>nativeFunctionsPromise=Promise.resolve(n)};', 'bridge'],
];
(async()=>{
 for (const [file, extra, name] of entries) await esbuild.build({stdin:{
   contents:fs.readFileSync(path.join(root,file),'utf8')+'\n'+extra,
   resolveDir:path.dirname(path.join(root,file)),loader:'ts'},
   bundle:true,format:'iife',alias:{'@':path.join(root,'src')},
   plugins:[{name:'external-dynamic',setup(b){b.onResolve({filter:/.*/},a=>a.kind==='dynamic-import'?{path:a.path,external:true}:undefined)}}],
   outfile:path.join(output,name+'.js')});
})();
"""


# 登录态会话页的输入框：容器是 form[data-chatgpt-composer]。
CHAT_SURFACE_BODY = '<main></main><form data-chatgpt-composer><div contenteditable="true"></div></form>'
# 工作分支页（?surface=work）：输入框容器不是 form[data-chatgpt-composer]，
# 只有 data-composer-markdown 这条精确候选能命中（2026-09 实测形态）。
WORK_SURFACE_BODY = ('<main></main><div data-chatgpt-composer>'
                     '<div class="ProseMirror" data-composer-markdown contenteditable="true"></div></div>')
NO_COMPOSER_BODY = '<main></main><div contenteditable="false"></div>'


def check(condition, message):
    assert condition, message
    print('PASS ' + message, flush=True)


def new_page(browser, body=None):
    page = browser.new_page()
    page.route('https://chatgpt.com/**', lambda route: route.fulfill(
        content_type='text/html', body=body or CHAT_SURFACE_BODY))
    page.goto('https://chatgpt.com/c/destination')
    return page


def load(page, output, *names):
    for name in names:
        page.add_script_tag(path=str(output / (name + '.js')))


def run(browser, output):
    page = new_page(browser)
    load(page, output, 'copy')
    # Keep these cases together so reusing a parent index across copies would fail.
    result = page.evaluate(r'''()=>{
      const root=document.querySelector('main');
      const run=html=>{root.innerHTML=html;const r=document.createRange();r.selectNodeContents(root);
        getSelection().removeAllRanges();getSelection().addRange(r);return copyTest.getSelectionMarkdown()};
      const first=run('<ol start="4"><li>Alpha</li><li>Beta</li></ol>');
      const second=run('<ol start="7"><li>Alpha</li><li>Beta</li></ol>');
      const nested=run('<ol start="3"><li>Outer<ul><li>Inner</li></ul></li><li>Next</li></ol>');
      root.innerHTML='<ol start="10"><li>Before</li><li>Selected</li><li>After</li></ol>';
      const r=document.createRange();r.selectNode(root.querySelectorAll('li')[1]);
      getSelection().removeAllRanges();getSelection().addRange(r);
      const partial=copyTest.getSelectionMarkdown();
      return {first,second,nested,partial,clean:!root.querySelector('[data-chatgo-list-parent], [data-chatgo-list-start]')};
    }''')
    check(result['first'] == '4.  Alpha\n5.  Beta', 'ordered-list numbering preserved')
    check(result['second'] == '7.  Alpha\n8.  Beta', 'later copies observe updated list starts')
    check('3.  Outer' in result['nested'] and '4.  Next' in result['nested'] and 'Inner' in result['nested'], 'nested list semantics preserved')
    check('10.' not in result['partial'] and '11.' in result['partial'] and result['clean'], 'partial list selection and DOM restoration preserved')
    page.close()

    # Use the real native bridge and attachment bookkeeping with a simulated
    # renderer. The tile shape and ancestor key mirror the captured ChatGPT UI.
    # success-work covers the work branch page (?surface=work): the composer
    # container is not form[data-chatgpt-composer], which used to force Markdown.
    for scenario in ['success', 'success-work', 'editable-only', 'old-card', 'route-change', 'cancel']:
        page = new_page(browser, WORK_SURFACE_BODY if scenario == 'success-work' else None)
        load(page, output, 'bridge')
        result = page.evaluate(r'''async scenario=>{
          const editor=document.querySelector('[contenteditable]');
          const container=editor.closest('[data-chatgpt-composer]')||editor.closest('form');
          const markdown='**Selected**\n\n```ts\nconst n = 1\n```';let entries=[];
          if(scenario==='editable-only')editor.textContent=markdown;
          const tile=id=>{const el=document.createElement('span');el.className='line-clamp-3 whitespace-pre-wrap';
            el.textContent=markdown;el.__reactFiber$fixture={return:{key:id}};container.append(el);return el};
          if(scenario==='old-card'){entries.push({id:'old',text:markdown});tile('old')}
          const scope={scope:{__scopeBrand:'AppScope'},get:()=>entries,set:(_a,_b,update)=>entries=update(entries)};
          container.__reactFiber$fixture={return:{memoizedState:{memoizedState:{current:scope}}}};
          bridgeTest.setApi({list:{},add:(_s,_key,text)=>{entries.push({id:'new',text});
            if(scenario==='success'||scenario==='success-work')tile('new');
            if(scenario==='route-change')history.pushState({},'','/c/elsewhere');
            if(scenario==='cancel')window.postMessage({source:'chatgo-content',type:'chatgo:cancel-native-quote',id:'quote-test'},location.origin);
          }});
          const response=await new Promise(resolve=>{window.addEventListener('message',function on(e){
            if(e.data?.type==='chatgo:attach-native-quote-result'){window.removeEventListener('message',on);resolve(e.data)}});
            window.postMessage({source:'chatgo-content',type:'chatgo:attach-native-quote',id:'quote-test',messageId:'message',
              label:'Selected',markdown,pageUrl:location.href,expiresAt:Date.now()+2600},location.origin)});
          return {response,ids:entries.map(x=>x.id),text:editor.textContent};
        }''', scenario)
        if scenario in ['success', 'success-work']:
            check(result['response']['ok'] and result['ids'] == ['new'] and result['text'] == '',
                  scenario + ': native preview succeeds without filling composer text')
        else:
            check(not result['response']['ok'] and 'new' not in result['ids'], scenario + ': rejected preview rolls back only its attachment')
            if scenario == 'old-card':
                check(result['ids'] == ['old'], 'preexisting user attachment preserved')
            if scenario in ['route-change', 'cancel']:
                check(result['response']['cancelled'], scenario + ': cancellation is distinct from unsupported native UI')
        page.close()

    # 页面没有可用输入框时必须按“原生不可用”回报，让隔离世界继续写 Markdown 引用；
    # 把这种情况当成 cancelled 会让两个世界都不写内容（输入框保持为空）。
    page = new_page(browser, NO_COMPOSER_BODY)
    load(page, output, 'bridge')
    result = page.evaluate(r'''async()=>await new Promise(resolve=>{
      window.addEventListener('message',function on(e){
        if(e.data?.type==='chatgo:attach-native-quote-result'){window.removeEventListener('message',on);resolve(e.data)}});
      window.postMessage({source:'chatgo-content',type:'chatgo:attach-native-quote',id:'missing-test',messageId:'message',
        label:'Selected',markdown:'Selected',pageUrl:location.href,expiresAt:Date.now()+2600},location.origin)})''')
    check(result['ok'] is False and not result.get('cancelled') and '输入框' in (result.get('reason') or ''),
          'missing composer reports unsupported native UI instead of cancelling')
    page.close()

    for scenario in ['new-card', 'reuse-card', 'editable-only', 'concurrent-user-quote']:
        page = new_page(browser)
        load(page, output, 'bridge')
        result = page.evaluate(r'''async scenario=>{
          const form=document.querySelector('form');let current;
          const label='Legacy quoted text';let card;
          if(scenario==='reuse-card'){current={label};card=document.createElement('span');card.textContent=label;form.append(card)}
          if(scenario==='editable-only')document.querySelector('[contenteditable]').textContent=label;
          const store={getState:()=>({targetedContent:current,setTargetedContent(value){current=value;
            if(value&&scenario!=='editable-only'){if(!card){card=document.createElement('span');form.append(card)}card.textContent=value.label}
          }})};
          bridgeTest.setLegacy({store,transform:x=>x});
          const response=await new Promise(resolve=>{window.addEventListener('message',function on(e){
            if(e.data?.type==='chatgo:attach-native-quote-result'){window.removeEventListener('message',on);resolve(e.data)}});
            window.postMessage({source:'chatgo-content',type:'chatgo:attach-native-quote',id:'legacy-test',messageId:'message',
              label,markdown:'**Legacy quoted text**',pageUrl:location.href,expiresAt:Date.now()+2600},location.origin);
            if(scenario==='concurrent-user-quote')setTimeout(()=>store.getState().setTargetedContent({label:'New user quote'}),80);
          });return {response,label:current?.label,hasTransform:typeof current?.createNewCompletionParams==='function'};
        }''', scenario)
        if scenario in ['new-card', 'reuse-card']:
            check(result['response']['ok'] and result['hasTransform'], scenario + ': legacy native preview still succeeds')
        else:
            check(not result['response']['ok'], scenario + ': legacy preview rejects unrelated text/state')
            if scenario == 'concurrent-user-quote':
                check(result['label'] == 'New user quote', 'legacy rollback preserves a concurrent user quote')
        page.close()

    # work-native 覆盖“分支到工作”的输入框：容器不是 form[data-chatgpt-composer] 时，
    # 旧实现会在生成原生引用之前判定“不受支持的输入框”并写入 Markdown 引用。
    for scenario in ['fallback', 'native', 'work-native', 'route-change', 'disable', 'replace-editor']:
        page = new_page(browser, WORK_SURFACE_BODY if scenario == 'work-native' else None)
        load(page, output, 'branch', 'adapter')
        result = page.evaluate(r'''async scenario=>{
          let receivedNative=false;
          window.chrome={runtime:{sendMessage:async()=>({ok:true,data:{text:'> Branch quote',strategy:'native-chatgpt',
            sourceTurnId:'message',nativeQuote:{label:'Branch quote',markdown:'Branch quote'}}})}};
          window.addEventListener('message',e=>{if(e.data?.type!=='chatgo:attach-native-quote')return;
            receivedNative=true;
            if(scenario==='route-change')history.pushState({},'','/c/elsewhere');
            if(scenario==='disable')branchTest.disable();
            if(scenario==='replace-editor')document.querySelector('[contenteditable]').outerHTML='<div contenteditable="true"></div>';
            window.postMessage({source:'chatgo-page',type:'chatgo:attach-native-quote-result',id:e.data.id,
              ok:scenario==='native'||scenario==='work-native'},location.origin)
          });
          branchTest.init(adapterTest);await branchTest.consume();
          return {text:document.querySelector('[contenteditable]').textContent,receivedNative};
        }''', scenario)
        if scenario == 'work-native':
            check(result['text'] == '' and result['receivedNative'],
                  'work branch still asks MAIN world for the native quote on a non-form composer')
        else:
            check(result['text'] == ('> Branch quote' if scenario == 'fallback' else ''),
                  scenario + ': only ordinary native failure fills Markdown fallback')
        page.close()

    for scenario in ['concurrent', 'cancel', 'cancel-reenable']:
        page = new_page(browser)
        page.evaluate('''()=>{window.listenersTest=new Set();window.chrome={storage:{local:{
          get:async x=>{await new Promise(r=>setTimeout(r,20));return typeof x==='object'?x:{}},set:async()=>{}},
          onChanged:{addListener:f=>listenersTest.add(f),removeListener:f=>listenersTest.delete(f)}}};
          window.requestIdleCallback=()=>1;window.cancelIdleCallback=()=>{}}''')
        load(page, output, 'floating', 'adapter')
        result = page.evaluate('''async scenario=>{
          if(scenario==='concurrent')await Promise.all([floatingTest.enable(adapterTest),floatingTest.enable(adapterTest)]);
          else{const pending=floatingTest.enable(adapterTest);floatingTest.disable();
            if(scenario==='cancel-reenable')await floatingTest.enable(adapterTest);await pending;}
          const before=document.querySelectorAll('#chatgo-floating-host').length;
          floatingTest.disable();return {before,after:document.querySelectorAll('#chatgo-floating-host').length,listeners:listenersTest.size};
        }''', scenario)
        check(result == {'before': 0 if scenario == 'cancel' else 1, 'after': 0, 'listeners': 0}, scenario + ': floating lifecycle leaves no duplicate host or listener')
        page.close()

    page = new_page(browser)
    page.evaluate('''()=>{document.querySelector('main').innerHTML='<article data-turn-key="1"><div data-user-message-bubble>First question long title</div><div data-chatgpt-selection-message-id="a1"><p>Answer</p></div></article><article data-turn-key="2"><div data-user-message-bubble>Second question long title</div><div data-chatgpt-selection-message-id="a2"><p>Answer</p></div></article>'}''')
    load(page, output, 'nav', 'adapter')
    page.evaluate('navTest.enable(adapterTest)')
    page.wait_for_timeout(400)
    result = page.evaluate('''async()=>{
      const original=document.querySelectorAll.bind(document);let scans=0;
      document.querySelectorAll=s=>{if(s===adapterTest.selectors.messageTurn)scans++;return original(s)};
      for(let i=0;i<12;i++){document.querySelector('[data-chatgpt-selection-message-id] p').firstChild.textContent='Token '+i;await new Promise(r=>setTimeout(r,25))}
      await new Promise(r=>setTimeout(r,180));const streamScans=scans;
      document.querySelector('[data-user-message-bubble]').textContent='Edited question title';
      await new Promise(r=>setTimeout(r,180));
      const shadow=document.querySelector('#chatgo-conversation-navigator').shadowRoot;
      const edited=shadow.querySelector('.item').textContent;
      document.querySelector('main').insertAdjacentHTML('beforeend','<article data-turn-key="3"><div data-user-message-bubble>Third question</div></article>');
      await new Promise(r=>setTimeout(r,180));const count=shadow.querySelectorAll('.item').length;
      const native=document.createElement('button');native.dataset.tocItemIndex='0';native.textContent='Native navigation';document.body.append(native);
      await new Promise(r=>setTimeout(r,250));const hidden=!document.querySelector('#chatgo-conversation-navigator');
      native.remove();await new Promise(r=>setTimeout(r,250));const restored=!!document.querySelector('#chatgo-conversation-navigator');
      navTest.disable();document.querySelectorAll=original;
      return {streamScans,edited,count,hidden,restored};
    }''')
    check(result['streamScans'] == 0, 'streamed assistant text avoids full question rescans')
    check(result['edited'] == 'Edited question title' and result['count'] == 3, 'question edits and added turns update navigation')
    check(result['hidden'] and result['restored'], 'native navigation still takes precedence and removal restores ours')
    page.close()

    page = new_page(browser)
    load(page, output, 'branch', 'adapter')
    result = page.evaluate('''()=>{branchTest.init(adapterTest);
      const toolbar=document.createElement('div');toolbar.style.cssText='display:inline-flex;height:30px';
      toolbar.innerHTML='<button>Ask ChatGPT</button><button>Start writing</button>';document.body.append(toolbar);
      const first=branchTest.scan();const original=document.querySelectorAll.bind(document);let scans=0;
      document.querySelectorAll=s=>{scans++;return original(s)};
      for(let i=0;i<10;i++)branchTest.scan();const warmScans=scans;
      toolbar.remove();const replacement=toolbar.cloneNode(true);document.body.append(replacement);
      const next=branchTest.scan();document.querySelectorAll=original;
      return {found:!!first,warmScans,replaced:next?.element===replacement};
    }''')
    check(result == {'found': True, 'warmScans': 0, 'replaced': True}, 'toolbar cache avoids repeated scans and invalidates detached nodes')
    page.close()


if __name__ == '__main__':
    manifest = json.loads((ROOT / 'dist/manifest.json').read_text())
    main = next(item for item in manifest['content_scripts'] if item.get('world') == 'MAIN')['js'][0]
    bridge = (ROOT / 'dist' / main).read_text()
    check('chatgo:attach-native-quote' in bridge and 'onExecute' not in bridge,
          'built MAIN bridge stays standalone without an extra extension loader')
    with tempfile.TemporaryDirectory(prefix='chatgo-runtime-') as folder:
        output = Path(folder)
        builder = output / 'build.cjs'
        builder.write_text(BUILD)
        subprocess.run(['node', str(builder), str(ROOT), str(output)], check=True, cwd=ROOT)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                run(browser, output)
            finally:
                browser.close()
    print('All runtime regressions passed.')
