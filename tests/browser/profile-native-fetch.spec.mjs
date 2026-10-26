import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle
test.beforeAll(async () => {
    const result = await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',
        stdin:{resolveDir:root,loader:'ts',contents:`import {ProfileMutationClient} from './src/lib/profile-mutation-client';window.client=new ProfileMutationClient(0,fetch,'actor-a');`}})
    bundle=result.outputFiles[0].text
})

test('native browser fetch sends, reconciles and undoes profile operations',async({page})=>{
    const requests=[]
    const journal=new Map()
    let revision=0
    const server=createServer(async(request,response)=>{
        const url=new URL(request.url,'http://127.0.0.1')
        const json=(status,body)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store'});response.end(JSON.stringify(body))}
        if(url.pathname==='/fixture.js'){response.writeHead(200,{'Content-Type':'application/javascript'});response.end(bundle);return}
        if(url.pathname==='/'){response.writeHead(200,{'Content-Type':'text/html'});response.end('<script src="/fixture.js"></script><p>Actual native browser fetch fixture</p>');return}
        if(url.pathname.startsWith('/api/profile/operations')){
            requests.push({method:request.method,path:url.pathname,account:request.headers['x-nsso-account']})
            if(request.method==='GET'){
                const id=url.searchParams.get('operationId')
                json(200,journal.get(id)||{status:'not_found',operationId:id,revision,changes:[]});return
            }
            let raw='';for await(const bytes of request)raw+=bytes
            const body=JSON.parse(raw)
            const result={status:'applied',operationId:body.operationId,revision:++revision,changes:[]}
            journal.set(body.operationId,result);json(200,result);return
        }
        json(404,{error:'Unexpected test endpoint'})
    })
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    try{
        // No fetch replacement, route interception or injected transport: Chrome's
        // native fetch must receive a valid receiver through the real client.
        await page.goto('http://127.0.0.1:'+server.address().port)
        const applied=await page.evaluate(()=>window.client.apply([{kind:'profile.patch',patch:{bio:'Native fetch fixture'}}]))
        expect(applied.status).toBe('applied')
        const confirmed=await page.evaluate(id=>window.client.status(id),applied.operationId)
        expect(confirmed.status).toBe('applied')
        const undone=await page.evaluate(id=>window.client.undo(id),applied.operationId)
        expect(undone.status).toBe('applied')
        expect(requests.map(r=>r.method)).toEqual(['POST','GET','POST'])
        expect(requests.every(r=>r.account==='actor-a')).toBe(true)
        expect(requests.at(-1).path).toBe('/api/profile/operations/undo')
    }finally{await new Promise(resolve=>server.close(resolve))}
})
