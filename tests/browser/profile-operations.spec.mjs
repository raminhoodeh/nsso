import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const actor='11111111-1111-4111-8111-111111111111',linkA='22222222-2222-4222-8222-222222222222',linkB='33333333-3333-4333-8333-333333333333';
let bundle;
test.beforeAll(async()=>{
    const result=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'profile-fixture-context',setup(builder){
        builder.onResolve({filter:/^@\/(?:lib\/supabase\/client|components\/providers\/UserProvider|components\/ui\/Toast)$/},args=>({path:args.path,namespace:'fixture'}));
        builder.onResolve({filter:/^\.\/UserProvider$/},args=>({path:args.path,namespace:'fixture'}));
        builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',contents:path.endsWith('UserProvider')?`const user={id:'${actor}',username:'fixture'};export const useUser=()=>({user,loading:false});`:path.endsWith('Toast')?`export const useToast=()=>({showToast:(message,type)=>window.fixtureToasts.push({message,type})});`:`export const createClient=()=>window.fixtureDatabase;`}));
    }}],stdin:{resolveDir:root,loader:'tsx',contents:`
        import React from 'react';import {createRoot} from 'react-dom/client';
        import {ProfileProvider,useProfile} from './src/components/providers/ProfileProvider';
        import Chat from './src/components/agent/AgentChatInterface';
        import SaveStatus from './src/components/profile/ProfileSaveStatus';
        window.fixtureState={revision:0,profile:{user_id:'${actor}',full_name:'Fixture creator',headline:'Original headline',bio:'Original bio',profile_pic_url:null},links:[{id:'${linkA}',user_id:'${actor}',link_name:'First',link_url:'https://first.test',display_order:0},{id:'${linkB}',user_id:'${actor}',link_name:'Second',link_url:'https://second.test',display_order:1}],contacts:[],experiences:[],qualifications:[],projects:[],products:[]};
        window.fixtureJournal={};window.fixturePosts=[];window.fixtureToasts=[];window.fixtureActions=[];window.fixtureMode='applied';window.fixtureFastMode=false;window.fixtureChatCalls=0;
        window.fixtureDatabase={auth:{getSession:async()=>({data:{session:null}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:window.fixtureState.profile})}),rpc:name=>({abortSignal:async()=>({data:name==='get_profile_snapshot'?structuredClone(window.fixtureState):name==='get_current_account'?{deity_fast_mode:window.fixtureFastMode}:{},error:null})})};
        const actualFetch=window.fetch.bind(window);
        window.fetch=async(url,init)=>{
            if(url!=='/api/deity/chat')return actualFetch(url,init);
            window.fixtureChatCalls++;
            const text='Here is your proposed change.\\n__DEITY_ACTIONS__\\n'+JSON.stringify(window.fixtureActions)+'\\n';
            const marker=text.indexOf('__DEITY_ACTIONS__')+20;
            return new Response(new ReadableStream({start(controller){for(const chunk of [text.slice(0,marker),text.slice(marker,marker+9),text.slice(marker+9)])controller.enqueue(new TextEncoder().encode(chunk));controller.close();}}),{headers:{'content-type':'text/plain'}});
        };
        window.fixtureApply=(body,undo=false)=>{
            window.fixturePosts.push(structuredClone(body));
            const state=window.fixtureState;
            if(window.fixtureJournal[body.operationId])return window.fixtureJournal[body.operationId].result;
            if(window.fixtureMode==='rejected')return {status:'rejected',code:'TARGET_NOT_FOUND',operationId:body.operationId,revision:state.revision,changes:[]};
            if(window.fixtureMode==='conflict'||body.expectedRevision!==state.revision)return {status:'conflict',code:'REVISION_CONFLICT',operationId:body.operationId,revision:state.revision,changes:[]};
            const before=structuredClone(state),deltas=[];
            if(undo){
                const original=window.fixtureJournal[body.originalOperationId];
                if(!original||state.profile.bio!==original.after.profile.bio)return{status:'conflict',operationId:body.operationId,revision:state.revision,changes:[]};
                state.profile=structuredClone(original.before.profile);state.links=structuredClone(original.before.links);
                deltas.push({entity:'profile',id:'${actor}',row:state.profile},...state.links.map(row=>({entity:'links',id:row.id,row})));
            }else for(const change of body.changes){
                if(change.kind==='profile.patch'){state.profile={...state.profile,...change.patch};deltas.push({entity:'profile',id:'${actor}',row:change.patch});}
                else if(change.kind==='contact.add'){const row={id:crypto.randomUUID(),user_id:'${actor}',...change.values,display_order:state.contacts.length,created_at:'2026-10-26T12:00:00Z'};state.contacts.push(row);deltas.push({entity:'contacts',id:row.id,row});}
                else if(change.kind==='link.patch'){const row=state.links.find(row=>row.id===change.id);Object.assign(row,change.patch);deltas.push({entity:'links',id:row.id,row:change.patch});}
                else if(change.kind==='collection.reorder'){state[change.collection]=change.order.map((id,display_order)=>({...state[change.collection].find(row=>row.id===id),display_order}));deltas.push(...state[change.collection].map(row=>({entity:change.collection,id:row.id,row:{display_order:row.display_order}})));}
            }
            state.revision++;const result={status:'applied',operationId:body.operationId,revision:state.revision,changes:deltas};
            window.fixtureJournal[body.operationId]={before,after:structuredClone(state),result};return result;
        };
        function Probe(){const p=useProfile();return <><label>Manual bio<input aria-label="Manual bio" value={p.profile?.bio||''} onChange={event=>{void p.patchProfile({bio:event.target.value})}}/></label><output data-testid="saved-profile">{p.profile?.bio}</output><output data-testid="links">{p.links.map(row=>row.link_name+' '+row.link_url).join('|')}</output><button onClick={()=>{void p.refreshProfile()}}>Reload saved profile</button><button onClick={()=>{void p.addContact()}}>Add manual contact</button><output data-testid="contacts">{p.contacts.length}</output><SaveStatus/></>}
        createRoot(document.getElementById('root')).render(<React.StrictMode><ProfileProvider><Probe/><Chat/></ProfileProvider></React.StrictMode>);
    `}});
    bundle=result.outputFiles[0].text;
});
async function fixture(page,{fastMode=false,mode='applied'}={}){
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
        if(url.pathname.startsWith('/api/profile/operations')){
            expect(route.request().headers()['x-nsso-account']).toBe(actor);
            if(route.request().method()==='GET'){
                if(await page.evaluate(()=>Boolean(window.fixtureStatusUnavailable)))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'OUTCOME_UNKNOWN'})});
                const id=url.searchParams.get('operationId');
                const result=await page.evaluate(id=>window.fixtureJournal[id]?.result||{status:'not_found',operationId:id,revision:window.fixtureState.revision,changes:[]},id);
                return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
            }
            const body=route.request().postDataJSON();
            const uncommitted=await page.evaluate(body=>{if(!window.fixtureUncommittedDropOnce)return false;window.fixtureUncommittedDropOnce=false;window.fixturePosts.push(body);return true;},body);
            if(uncommitted)return route.abort('failed');
            const result=await page.evaluate(({body,undo})=>window.fixtureApply(body,undo),{body,undo:url.pathname.endsWith('/undo')});
            const dropped=await page.evaluate(()=>{const drop=window.fixtureDropOnce;window.fixtureDropOnce=false;return drop;});
            if(dropped)return route.abort('failed');
            return route.fulfill({status:result.status==='conflict'?409:result.status==='rejected'?422:200,contentType:'application/json',body:JSON.stringify(result)});
        }
        if(/\.(png|jpg)$/.test(url.pathname))return route.fulfill({status:204});
        throw new Error('Unexpected fixture request '+url.href);
    });
    await page.goto('https://nsso.test/fixture');
    await page.addScriptTag({content:bundle});
    await expect(page.getByTestId('saved-profile')).toHaveText('Original bio');
    await page.evaluate(({fastMode,mode})=>{window.fixtureFastMode=fastMode;window.fixtureMode=mode;},{fastMode,mode});
    if(fastMode)await page.getByRole('button',{name:'Reload saved profile'}).click();
}
async function propose(page,changes){
    await page.evaluate(changes=>{window.fixtureActions=changes.map(change=>({version:1,label:'Suggested profile change',change}));},changes);
    await page.getByRole('textbox',{name:'Message Deity'}).fill('Please update my profile.');
    await page.getByRole('button',{name:'Send message',exact:true}).click();
}
const bio={kind:'profile.patch',patch:{bio:'Committed new bio'}};

test('failed/zero-row Apply never shows applied or sends a follow-up model request; same suggestion can retry',async({page})=>{
    await fixture(page,{mode:'rejected'});await propose(page,[bio]);
    const apply=page.getByRole('button',{name:'Apply suggested profile change'});
    await apply.click();
    await expect(apply).toHaveText('Retry');
    await expect(page.getByText('Done, profile updated!',{exact:true})).toHaveCount(0);
    await expect(page.getByTestId('saved-profile')).toHaveText('Original bio');
    expect(await page.evaluate(()=>window.fixtureChatCalls)).toBe(1);
    await page.evaluate(()=>{window.fixtureMode='applied'});await apply.click();
    await expect(page.getByText('Done, profile updated!',{exact:true})).toBeVisible();
    await expect(page.getByTestId('saved-profile')).toHaveText('Committed new bio');
    const posts=await page.evaluate(()=>window.fixturePosts);expect(posts).toHaveLength(2);expect(posts[1].operationId).toBe(posts[0].operationId);
});
test('double Apply and a dropped committed response recover one operation; Undo persists and survives reload',async({page})=>{
    await fixture(page);await page.evaluate(()=>{window.fixtureDropOnce=true});await propose(page,[bio]);
    const apply=page.getByRole('button',{name:'Apply suggested profile change'});await apply.dblclick();
    await expect(page.getByText('Done, profile updated!',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>window.fixturePosts.length)).toBe(1);
    await page.getByRole('button',{name:'Undo last profile change'}).click();
    await expect(page.getByText('Undone and saved.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Reload saved profile'}).click();
    await expect(page.getByTestId('saved-profile')).toHaveText('Original bio');
    expect(await page.evaluate(()=>window.fixtureState.profile.bio)).toBe('Original bio');
    expect(await page.evaluate(()=>window.fixtureChatCalls)).toBe(1);
});
test('Fast Mode commits one validated batch without marking cards applied before the authoritative response',async({page})=>{
    await fixture(page,{fastMode:true});
    await propose(page,[{kind:'link.patch',id:linkA,patch:{link_name:'Renamed',link_url:'https://renamed.test'}},{kind:'collection.reorder',collection:'links',order:[linkB,linkA]}]);
    await expect(page.getByText('Done, profile updated!',{exact:true})).toHaveCount(2);
    await expect(page.getByTestId('links')).toHaveText('Second https://second.test|Renamed https://renamed.test');
    const posts=await page.evaluate(()=>window.fixturePosts);expect(posts).toHaveLength(1);expect(posts[0].changes).toHaveLength(2);
    await page.getByRole('button',{name:'Reload saved profile'}).click();
    await expect(page.getByTestId('links')).toHaveText('Second https://second.test|Renamed https://renamed.test');
});
test('conflicts keep the proposal for explicit refreshed review and do not overwrite a newer edit automatically',async({page})=>{
    await fixture(page,{mode:'conflict'});await propose(page,[bio]);
    const apply=page.getByRole('button',{name:'Apply suggested profile change'});await apply.click();
    await expect(apply).toHaveText('Refresh for review');
    await expect(page.getByTestId('saved-profile')).toHaveText('Original bio');
    await page.evaluate(()=>{window.fixtureMode='applied';window.fixtureState.profile.bio='Newer saved bio';window.fixtureState.revision=1;});
    await apply.click();await expect(apply).toHaveText('Apply');
    await expect(page.getByTestId('saved-profile')).toHaveText('Newer saved bio');
    expect(await page.evaluate(()=>window.fixturePosts.length)).toBe(1);
    await apply.click();await expect(page.getByTestId('saved-profile')).toHaveText('Committed new bio');
});
test('manual typing coalesces a single field patch and retains a rejected draft for explicit retry',async({page})=>{
    await fixture(page,{mode:'rejected'});
    const input=page.getByRole('textbox',{name:'Manual bio'});
    await input.fill('Draft one');await input.fill('Draft two');await input.fill('Draft final');
    await expect(page.getByText('This change could not be accepted. Check the fields and try again.')).toBeVisible();
    await expect(input).toHaveValue('Draft final');
    expect(await page.evaluate(()=>window.fixtureState.profile.bio)).toBe('Original bio');
    const posts=await page.evaluate(()=>window.fixturePosts);expect(posts).toHaveLength(1);expect(posts[0].changes).toEqual([{kind:'profile.patch',patch:{bio:'Draft final'}}]);
    await page.evaluate(()=>{window.fixtureMode='applied'});
    await page.getByRole('button',{name:'Check status and retry my draft'}).click();
    await page.waitForFunction(()=>window.fixtureState.profile.bio==='Draft final');
    await expect(input).toHaveValue('Draft final');
});
test('malformed or unauthorized canonical model proposals cannot reach the mutation gateway',async({page})=>{
    await fixture(page);
    await propose(page,[{kind:'product.patch',id:linkA,patch:{paypal_active:true}}]);
    await expect(page.getByText(/That proposed change could not be read/)).toBeVisible();
    await expect(page.getByRole('button',{name:'Apply suggested profile change'})).toHaveCount(0);
    expect(await page.evaluate(()=>window.fixturePosts)).toEqual([]);
});
test('typing after a conflict preserves the draft without silently rebasing over a newer saved value',async({page})=>{
    await fixture(page,{mode:'conflict'});
    const input=page.getByRole('textbox',{name:'Manual bio'});
    await input.fill('First conflicting draft');
    await expect(page.getByText(/A newer edit was found/)).toBeVisible();
    await page.evaluate(()=>{window.fixtureMode='applied';window.fixtureState.profile.bio='A newer tab saved this';window.fixtureState.revision=1;});
    await page.clock.install();await input.fill('My revised draft');await page.clock.fastForward(600);
    expect(await page.evaluate(()=>window.fixturePosts.length)).toBe(1);
    expect(await page.evaluate(()=>window.fixtureState.profile.bio)).toBe('A newer tab saved this');
    await expect(input).toHaveValue('My revised draft');
    await page.getByRole('button',{name:'Check status and retry my draft'}).click();
    await page.waitForFunction(()=>window.fixtureState.profile.bio==='My revised draft');
});
test('editing an outcome-unknown draft reconciles its original ID before a separate newer save',async({page})=>{
    await fixture(page);await page.evaluate(()=>{window.fixtureUncommittedDropOnce=true});
    const input=page.getByRole('textbox',{name:'Manual bio'});
    await input.fill('Unconfirmed first draft');
    await expect(page.getByText(/The save result is not confirmed/)).toBeVisible();
    await page.clock.install();await input.fill('Newer draft kept locally');await page.clock.fastForward(600);
    expect(await page.evaluate(()=>window.fixturePosts.length)).toBe(1);
    await expect(input).toHaveValue('Newer draft kept locally');
    await page.getByRole('button',{name:'Check status and retry my draft'}).click();
    await page.waitForFunction(()=>window.fixtureState.profile.bio==='Newer draft kept locally');
    const posts=await page.evaluate(()=>window.fixturePosts);
    expect(posts).toHaveLength(3);expect(posts[1]).toEqual(posts[0]);expect(posts[2].operationId).not.toBe(posts[0].operationId);
    await expect(input).toHaveValue('Newer draft kept locally');
});


test('manual add duplicate clicks share one operation; an acknowledged later add remains possible',async({page})=>{
    await fixture(page);
    let release;const held=new Promise(resolve=>{release=resolve});let posts=0;
    await page.route('**/api/profile/operations',async route=>{
        if(route.request().method()!=='POST')return route.fallback();
        posts++;await held;return route.fallback();
    });
    await page.getByRole('button',{name:'Add manual contact',exact:true}).dblclick();
    await expect.poll(()=>posts).toBe(1);
    release();
    await expect(page.getByTestId('contacts')).toHaveText('1');
    expect(await page.evaluate(()=>window.fixturePosts)).toHaveLength(1);
    await page.getByRole('button',{name:'Add manual contact',exact:true}).click();
    await expect(page.getByTestId('contacts')).toHaveText('2');
    const operations=await page.evaluate(()=>window.fixturePosts);
    expect(operations).toHaveLength(2);expect(operations[1].operationId).not.toBe(operations[0].operationId);
});

test('manual add with a lost committed response reconciles the original ID before another insert',async({page})=>{
    await fixture(page);
    await page.evaluate(()=>{window.fixtureDropOnce=true;window.fixtureStatusUnavailable=true});
    await page.getByRole('button',{name:'Add manual contact',exact:true}).click();
    await expect(page.getByText('The save result is not confirmed. Check its status before retrying; your draft has been kept.')).toBeVisible();
    await expect(page.getByTestId('contacts')).toHaveText('0');
    expect(await page.evaluate(()=>window.fixtureState.contacts.length)).toBe(1);
    await page.getByRole('button',{name:'Add manual contact',exact:true}).click();
    expect(await page.evaluate(()=>window.fixturePosts)).toHaveLength(1);
    await page.evaluate(()=>{window.fixtureStatusUnavailable=false});
    await page.getByRole('button',{name:'Check status and retry my draft'}).click();
    await expect(page.getByTestId('contacts')).toHaveText('1');
    expect(await page.evaluate(()=>window.fixturePosts)).toHaveLength(1);
    await page.getByRole('button',{name:'Reload saved profile'}).click();
    await expect(page.getByTestId('contacts')).toHaveText('1');
});

test('manual add retries an uncommitted unknown request with the same UUID',async({page})=>{
    await fixture(page);
    await page.evaluate(()=>{window.fixtureUncommittedDropOnce=true;window.fixtureStatusUnavailable=true});
    await page.getByRole('button',{name:'Add manual contact',exact:true}).click();
    await expect(page.getByText('The save result is not confirmed. Check its status before retrying; your draft has been kept.')).toBeVisible();
    expect(await page.evaluate(()=>window.fixtureState.contacts.length)).toBe(0);
    await page.evaluate(()=>{window.fixtureStatusUnavailable=false});
    await page.getByRole('button',{name:'Add manual contact',exact:true}).click();
    await expect(page.getByTestId('contacts')).toHaveText('1');
    const operations=await page.evaluate(()=>window.fixturePosts);
    expect(operations).toHaveLength(2);expect(operations[1].operationId).toBe(operations[0].operationId);
    expect(operations[1].expectedRevision).toBe(operations[0].expectedRevision);
});
