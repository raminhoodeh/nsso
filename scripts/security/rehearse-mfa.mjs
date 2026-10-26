import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomBytes,randomUUID,createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
if(process.env.NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL!=='1')throw Error('Local rehearsal opt-in required')
const config=JSON.parse(await readFile(process.argv[2],'utf8'))
const url=new URL(config.API_URL)
if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Synthetic local Auth only')
const options={auth:{persistSession:false,autoRefreshToken:false}}
const service=createClient(url.origin,config.SERVICE_ROLE_KEY,options),client=createClient(url.origin,config.ANON_KEY,options)
const email=`nsso-mfa-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url')
let id
function totp(secret){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=''
 for(const letter of secret.toUpperCase().replace(/=+$/,'')){const index=alphabet.indexOf(letter);assert.ok(index>=0);bits+=index.toString(2).padStart(5,'0')}
 const key=Buffer.from((bits.match(/.{8}/g)||[]).map(byte=>parseInt(byte,2))),counter=Buffer.alloc(8)
 counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
 const digest=createHmac('sha1',key).update(counter).digest(),offset=digest.at(-1)&15
 return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')
}
try{
 const created=await service.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);id=created.data.user.id
 assert.equal((await client.auth.signInWithPassword({email,password})).error,null)
 assert.equal((await client.auth.mfa.getAuthenticatorAssuranceLevel()).data.currentLevel,'aal1')
 const enrolled=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic local Auth fixture'})
 if(enrolled.error)throw Error(`Local MFA enroll unavailable (${enrolled.error.code||enrolled.error.status})`)
 assert.equal((await client.auth.mfa.challengeAndVerify({factorId:enrolled.data.id,code:totp(enrolled.data.totp.secret)})).error,null)
 assert.equal((await client.auth.mfa.getAuthenticatorAssuranceLevel()).data.currentLevel,'aal2')
 assert.equal((await client.auth.getUser()).data.user.factors.some(factor=>factor.status==='verified'),true)
 assert.equal((await client.auth.mfa.unenroll({factorId:enrolled.data.id})).error,null)
 assert.equal((await client.auth.getUser()).data.user.factors?.some(factor=>factor.status==='verified')??false,false)
 console.log('PASS real local Auth: aal1 denied, TOTP enroll/challenge produces aal2, fresh removed-factor check denies stale session.')
}finally{if(id)assert.equal((await service.auth.admin.deleteUser(id)).error,null)}
