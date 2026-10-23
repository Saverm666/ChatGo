"""Browser regressions for DOM performance changes.

Run pnpm build first, then (with Python Playwright + Chromium installed):
pnpm test:runtime
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
 ['src/background/branch-diagnostics.ts', 'window.diagnosticHandler=handleBranchDiagnostic;', 'diagnostic-background'],
 ['src/content/modules/branch.ts', "import {initializeBranchDiagnostics} from './branch-diagnostics';window.branchTest={initDiagnostics:initializeBranchDiagnostics,init:a=>{adapter=a;enabled=true},scan:findNativeSelectionToolbar,consume:consumePendingBranchDraft,openGemini:openGeminiNativeBranch,composer:findComposer,disable:branch.disable};", 'branch'],
 ['src/content/modules/markdown-copy.ts', 'window.copyTest=markdownCopy;', 'copy'],
 ['src/content/modules/conversation-navigator.ts', 'window.navTest=conversationNavigator;', 'nav'],
 ['src/content/modules/floating-panel.ts', 'window.floatingTest=floatingPanel;', 'floating'],
 ['src/content/sites/chatgpt.ts', 'window.adapterTest=chatgptAdapter;', 'adapter'],
 ['src/content/sites/gemini.ts', 'window.geminiAdapterTest=geminiAdapter;window.geminiSourceTest=findGeminiBranchSource;', 'gemini'],
 ['src/content/gemini-native-bridge.ts', '', 'gemini-bridge'],
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
    snapshot = ROOT / 'artifacts/chat-html/gemini.google.com-b313377ba7d4a20c/assistant-0.outer.html'
    if snapshot.exists():
        page = browser.new_page()
        page.route('**/*', lambda route: route.abort())
        page.set_content(snapshot.read_text())
        load(page, output, 'gemini')
        source = page.evaluate("geminiSourceTest(document.querySelector('model-response'),'https://gemini.google.com/u/0/app/b313377ba7d4a20c')")
        check(source == {'conversationId': 'c_b313377ba7d4a20c', 'turnId': 'r_8a55bf6b215d43b6'},
              'Gemini saved page: selected response identity is parsed without opening menus')
        page.close()

    for scenario in ['success', 'rpc-error', 'malformed-response', 'missing-auth', 'open-failure']:
        page = browser.new_page()
        body = '<main><model-response><message-content id="message-content-id-r_selected">Selected answer</message-content></model-response></main><rich-textarea><div contenteditable="true">existing source draft</div></rich-textarea>'
        page.route('https://gemini.google.com/**', lambda route: route.fulfill(content_type='text/html', body=body))
        page.goto('https://gemini.google.com/u/1/app/source')
        requests = []

        def rpc(route):
            from urllib.parse import parse_qs, urlparse
            requests.append(route.request)
            params = parse_qs(urlparse(route.request.url).query)
            form = parse_qs(route.request.post_data)
            batch = json.loads(form['f.req'][0])
            check(route.request.method == 'POST' and params['authuser'] == ['1'] and
                  json.loads(batch[0][0][1]) == ['c_source', 'r_selected'],
                  'Gemini ' + scenario + ': directly calls BranchConversation for the selected turn/account')
            if scenario == 'rpc-error':
                route.fulfill(status=500, body='fixture server error')
                return
            rpc_id = 'unrelated' if scenario == 'malformed-response' else 'KDNZr'
            frame = json.dumps([['wrb.fr', rpc_id, json.dumps([['c_new', 'Branch title']]), None]])
            route.fulfill(content_type='application/json', body=")]}'\n\n" + str(len(frame)) + '\n' + frame + '\n')

        page.route('https://gemini.google.com/**/data/batchexecute?*', rpc)
        page.evaluate("window.WIZ_global_data={SNlM0e:'fixture-token',cfb2h:'fixture-build',FdrFJe:'fixture-session',eptZe:'/_/BardChatUi/'}")
        if scenario == 'missing-auth':
            page.evaluate('delete WIZ_global_data.SNlM0e')
        load(page, output, 'branch', 'gemini', 'gemini-bridge', 'diagnostic-background')
        result = page.evaluate(r'''async scenario=>{
          branchTest.init(geminiAdapterTest);let draft=null,opened=null,cleared=0,clicks=0,error=null;
          document.addEventListener('click',()=>clicks++,true);
          let diagnosticState={enabled:scenario==='success',startedAt:Date.now(),events:[]};
          window.chrome={storage:{session:{get:async()=>({chatgoBranchDiagnostics:diagnosticState}),set:async v=>{diagnosticState=v.chatgoBranchDiagnostics}}},runtime:{sendMessage:async msg=>{
            if(msg.type==='BRANCH_DIAGNOSTIC')return {ok:true,data:await diagnosticHandler(msg,12)};
            if(msg.type==='CREATE_BRANCH_DRAFT'){draft=msg.draft;return {ok:true}}
            if(msg.type==='OPEN_BRANCH_TAB'){
              if(scenario==='open-failure')return {ok:false,error:'fixture open failed'};
              opened=msg.url;return {ok:true,data:{tabId:34}};
            }
            if(msg.type==='CLEAR_BRANCH_DRAFT'){draft=null;cleared++;return {ok:true}}
            return {ok:true,data:null};
          }}};
          branchTest.initDiagnostics();
          try{await branchTest.openGemini({turn:document.querySelector('model-response'),markdown:'**Selected**\n\n- Gemini answer'})}
          catch(e){error=e.message}
          const diagnostics=await diagnosticHandler({type:'BRANCH_DIAGNOSTIC',action:'report'},12);
          return {draft,opened,cleared,clicks,error,diagnostics,url:location.href,text:branchTest.composer().textContent};
        }''', scenario)
        check(result['clicks'] == 0 and result['url'] == 'https://gemini.google.com/u/1/app/source' and result['text'] == 'existing source draft',
              'Gemini ' + scenario + ': no simulated clicks, source navigation, or source composer changes')
        check(len(requests) == (0 if scenario == 'missing-auth' else 1), 'Gemini ' + scenario + ': never retries branch creation')
        if scenario == 'success':
            stages = [e['stage'] for e in result['diagnostics']['events']]
            check('api.fetch-start' in stages and 'api.headers-received' in stages and 'source.open-tab-end' in stages,
                  'Gemini diagnostics: source and MAIN timings are correlated without extra RPC calls')
            check('fixture-token' not in json.dumps(result['diagnostics']) and 'Selected' not in json.dumps(result['diagnostics']),
                  'Gemini diagnostics: records no credentials or selected content')
            page.add_script_tag(path=str(ROOT / 'tools/diagnose-gemini-branch.js'))
            page.wait_for_function('Boolean(window.chatgoBranchDiagnostic)')
            report = page.evaluate('chatgoBranchDiagnostic.report()')
            check(any(row['phase'] == '接口等待（网络与服务器）' for row in report['summary']),
                  'Gemini diagnostic console: exports persisted stages and calculated phase durations')
            page.evaluate('chatgoBranchDiagnostic.stop()')
            check(result['opened'] == 'https://gemini.google.com/u/1/app/new' and result['draft']['sourceTurnId'] == 'r_selected',
                  'Gemini success: hands the returned URL to the background new-tab path')
            target = browser.new_page()
            target.route('https://gemini.google.com/**', lambda route: route.fulfill(content_type='text/html', body='<rich-textarea><div contenteditable="true"></div></rich-textarea>'))
            target.goto(result['opened'])
            load(target, output, 'branch', 'gemini', 'diagnostic-background')
            target_result = target.evaluate('''async draft=>{
              let used=false,state={enabled:true,startedAt:Date.now(),events:[]};
              window.chrome={storage:{session:{get:async()=>({chatgoBranchDiagnostics:state}),set:async v=>{state=v.chatgoBranchDiagnostics}}},runtime:{sendMessage:async msg=>{
                if(msg.type==='BRANCH_DIAGNOSTIC')return {ok:true,data:await diagnosticHandler(msg,34)};
                const data=used?null:draft;used=true;return {ok:true,data};
              }}};branchTest.initDiagnostics();branchTest.init(geminiAdapterTest);
              await Promise.all([branchTest.consume(),branchTest.consume()]);
              await new Promise(r=>setTimeout(r,0));
              return {text:branchTest.composer().textContent,diagnostics:await diagnosticHandler({type:'BRANCH_DIAGNOSTIC',action:'report'},34)};
            }''', result['draft'])
            text=target_result['text']
            stages=[e['stage'] for e in target_result['diagnostics']['events']]
            check('target.composer-ready' in stages and 'target.insert-confirmed' in stages and 'target.navigation.responseStart' in stages,
                  'Gemini diagnostics: new page preserves trace ID and records navigation, composer and insertion')
            check(text.count('> **Selected**') == 1 and '> - Gemini answer' in text, 'Gemini target: fills Markdown only in the new page, once')
            target.close()
        else:
            check(result['error'] and result['opened'] is None and result['draft'] is None,
                  'Gemini ' + scenario + ': fails without opening a guessed URL or leaving a draft')
        page.close()

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

    # Exercise actual fetch -> ESM import -> runtime cache discovery. Earlier
    # tests inject the API and cannot detect failures in this loading path.
    for scenario in ['late-runtime', 'failed-import', 'stalled-asset', 'stalled-import', 'late-composer-module']:
        page = new_page(browser)
        stalled_routes = []
        runtime_source = '''
          const ed="chatgpt-global",ex={},g={a:()=>"new"};
          function ez(e,t,n,a,r,i){let o=n.trim();0!==o.length&&e.set(ex,t,e=>[...e,{id:(0,g.a)(),text:null==a?o:n,source:a,sourceMessageId:r,sourceOccurrence:i}])}
          const exports=Object.defineProperties({}, {a:{get:()=>ed},b:{get:()=>ez},v:{get:()=>ex}});
          export const __webpack_require__={c:{Ow:{exports}}};
        '''
        if scenario == 'late-composer-module':
            runtime_source = runtime_source.replace('c:{Ow:{exports}}', 'c:{}') + '''
              window.addEventListener('fixture-composer-loaded',()=>{__webpack_require__.c.Ow={exports}});
            '''

        def assets(route):
            name = route.request.url.rsplit('/', 1)[-1]
            if name == 'stall.js':
                stalled_routes.append(route)
                return  # Leave the fetch pending until its AbortController fires.
            source = 'export{};'
            if name == 'entry.js':
                source = 'import{__webpack_require__ as $r,other}from"./runtime.js";'
            elif name == 'bad-entry.js':
                source = 'import{__webpack_require__ as r}from"./broken.js";'
            elif name == 'broken.js':
                source = 'throw new Error("fixture import failed");'
            elif name == 'stalled-entry.js':
                source = 'import{__webpack_require__ as r}from"./stalled-runtime.js";'
            elif name == 'stalled-runtime.js':
                source = 'await new Promise(()=>{});export const __webpack_require__={};'
            elif name == 'runtime.js':
                source = runtime_source + '\nexport const other=1;'
            route.fulfill(content_type='application/javascript', body=source)

        page.route('https://chatgpt.com/cdn/assets/**', assets)
        load(page, output, 'bridge')
        result = page.evaluate(r'''async scenario=>{
          const names=Array.from({length:12},(_,i)=>'decoy'+i+'.js');
          names.push('entry.js');
          if(scenario==='stalled-asset')names.unshift('stall.js');
          if(scenario==='failed-import')names.unshift('bad-entry.js');
          if(scenario==='stalled-import')names.unshift('stalled-entry.js');
          for(const name of names){const s=document.createElement('script');s.type='application/x-fixture';
            s.src='/cdn/assets/'+name;document.head.append(s)}
          const editor=document.querySelector('[contenteditable]'),form=document.querySelector('form');
          let entries=[];const scope={scope:{__scopeBrand:'AppScope'},get:()=>entries,
            set(_binding,_key,update){entries=update(entries);
              for(const old of form.querySelectorAll('.fixture-tile'))old.remove();
              for(const entry of entries){const tile=document.createElement('span');
                tile.className='fixture-tile line-clamp-3 whitespace-pre-wrap';tile.textContent=entry.text;
                tile.__reactFiber$fixture={return:{key:entry.id}};form.append(tile)}}};
          form.__reactFiber$fixture={memoizedState:{memoizedState:{current:scope}}};
          const ask=(type,id)=>new Promise(resolve=>{
            const timer=setTimeout(()=>resolve({error:'test timeout'}),2200);
            window.addEventListener('message',function on(e){
              if(e.data?.id===id&&e.data.source==='chatgo-page'){
                clearTimeout(timer);window.removeEventListener('message',on);resolve(e.data)}});
            window.postMessage({source:'chatgo-content',type,id,messageId:'message',label:'Selected',
              markdown:'Selected',pageUrl:location.href,expiresAt:Date.now()+2600},location.origin)});
          let diagnostic=await ask('chatgo:diagnose-native-quote','diagnose');
          let retainedRuntime=true;
          if(scenario==='late-composer-module'){
            retainedRuntime=diagnostic.api===false&&diagnostic.loader.stage==='api'&&diagnostic.loader.runtimes.length===1;
            document.querySelectorAll('script[type="application/x-fixture"]').forEach(s=>s.remove());
            performance.clearResourceTimings();
            window.dispatchEvent(new Event('fixture-composer-loaded'));
            diagnostic=await ask('chatgo:diagnose-native-quote','diagnose-again');
          }
          const unchanged=entries.length===0;
          const response=await ask('chatgo:attach-native-quote','attach');
          return {diagnostic,unchanged,response,retainedRuntime,ids:entries.map(x=>x.id),text:editor.textContent};
        }''', scenario)
        check(result['diagnostic'].get('api') and result['diagnostic'].get('appScope') and result['unchanged'],
              scenario + ': read-only diagnostic resolves the real runtime without adding a quote')
        check(result['response'].get('ok') and result['ids'] == ['new'] and result['text'] == '',
              scenario + ': discovered native API renders the quote without Markdown fallback')
        check(result['retainedRuntime'], scenario + ': runtime remains available after resource entries disappear')
        for route in stalled_routes:
            route.abort()
        page.close()

    # Use the real native bridge and attachment bookkeeping with a simulated
    # renderer. The tile shape and ancestor key mirror the captured ChatGPT UI.
    # success-work covers the work branch page (?surface=work): the composer
    # container is not form[data-chatgpt-composer], which used to force Markdown.
    successful_previews = ['success', 'success-work', 'rendered-markdown', 'sibling-card', 'portal-card', 'delayed-card']
    for scenario in successful_previews + ['editable-only', 'old-card', 'hidden-card', 'editor-key', 'route-change', 'cancel']:
        page = new_page(browser, WORK_SURFACE_BODY if scenario == 'success-work' else None)
        load(page, output, 'bridge')
        result = page.evaluate(r'''async scenario=>{
          const editor=document.querySelector('[contenteditable]');
          const container=editor.closest('[data-chatgpt-composer]')||editor.closest('form');
          const markdown='**Selected**\n\n```ts\nconst n = 1\n```';let entries=[];
          if(scenario==='editable-only')editor.textContent=markdown;
          const tile=id=>{const el=document.createElement('div');el.className='line-clamp-3 whitespace-pre-wrap';
            el.textContent=markdown;el.__reactFiber$fixture={return:{key:id}};
            if(scenario==='rendered-markdown'){
              el.className='new-preview';el.innerHTML='<strong>Selected</strong><pre><code>const n = 1</code></pre>';
            }
            if(scenario==='hidden-card')el.style.display='none';
            if(scenario==='sibling-card')container.parentElement.append(el);
            else if(scenario==='portal-card'){
              const portal=document.createElement('aside');portal.id='fixture-portal';document.body.append(portal);portal.append(el);
            }else container.append(el);
            return el};
          if(scenario==='old-card'){entries.push({id:'old',text:markdown});tile('old')}
          const scope={scope:{__scopeBrand:'AppScope'},get:()=>entries,set:(_a,_b,update)=>entries=update(entries)};
          container.__reactFiber$fixture={return:{memoizedState:{memoizedState:{current:scope}}}};
          bridgeTest.setApi({list:{},add:(_s,_key,text)=>{entries.push({id:'new',text});
            if(['success','success-work','rendered-markdown','sibling-card','portal-card','hidden-card'].includes(scenario))tile('new');
            if(scenario==='delayed-card')setTimeout(()=>tile('new'),850);
            if(scenario==='editor-key')editor.__reactFiber$fixture={return:{key:'new'}};
            if(scenario==='route-change')history.pushState({},'','/c/elsewhere');
            if(scenario==='cancel')window.postMessage({source:'chatgo-content',type:'chatgo:cancel-native-quote',id:'quote-test'},location.origin);
          }});
          const response=await new Promise(resolve=>{window.addEventListener('message',function on(e){
            if(e.data?.type==='chatgo:attach-native-quote-result'){window.removeEventListener('message',on);resolve(e.data)}});
            window.postMessage({source:'chatgo-content',type:'chatgo:attach-native-quote',id:'quote-test',messageId:'message',
              label:'Selected',markdown,pageUrl:location.href,expiresAt:Date.now()+2600},location.origin)});
          return {response,ids:entries.map(x=>x.id),text:editor.textContent};
        }''', scenario)
        if scenario in successful_previews:
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
    main = next(item for item in manifest['content_scripts'] if item.get('world') == 'MAIN' and 'https://chatgpt.com/*' in item['matches'])['js'][0]
    bridge = (ROOT / 'dist' / main).read_text()
    check('chatgo:attach-native-quote' in bridge and 'onExecute' not in bridge,
          'built MAIN bridge stays standalone without an extra extension loader')
    gemini_main = next(item for item in manifest['content_scripts'] if item.get('world') == 'MAIN' and 'https://gemini.google.com/*' in item['matches'])['js'][0]
    gemini_bridge = (ROOT / 'dist' / gemini_main).read_text()
    check('chatgo:create-gemini-branch' in gemini_bridge and 'onExecute' not in gemini_bridge,
          'built Gemini MAIN bridge stays standalone without a cross-world loader')
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
