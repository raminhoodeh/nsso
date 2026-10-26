/** Start a NEW isolated local synthetic Supabase stack. Never accepts cloud IDs.
 * node scripts/security/start-ci-database.mjs /tmp/nsso-security-ci-UNIQUE
 * Local credentials and CLI output stay in DIR/private (0600 files).
 */
import assert from 'node:assert/strict'
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve,basename,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
const directory=resolve(process.argv[2]||'')
if(!process.argv[2]||!/^nsso-security-ci-[a-z0-9-]+$/.test(basename(directory)))throw Error('Expected new nsso-security-ci-* temporary directory')
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
if(directory===repository||directory.startsWith(repository+'/'))throw Error('Local credentials must remain outside repository')
if(existsSync(resolve(directory,'supabase/config.toml')))throw Error('Existing stack is never reset by CI startup')
mkdirSync(resolve(directory,'private'),{recursive:true,mode:0o700})
function cli(args,label){
 const run=spawnSync('npx',['--yes','supabase@2.122.0',...args,'--workdir',directory],{encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,NO_COLOR:'1'}})
 writeFileSync(resolve(directory,'private',label+'.log'),(run.stdout||'')+(run.stderr||''),{mode:0o600})
 assert.equal(run.status,0,'Local CLI '+label+' failed; inspect private log')
 return run.stdout
}
cli(['init'],'init')
const file=resolve(directory,'supabase/config.toml');let config=readFileSync(file,'utf8')
for(const [before,after]of [[54321,55941],[54322,55942],[54320,55940],[54323,55943],[54324,55944],[54327,55947],[54329,55949]])config=config.replaceAll(String(before),String(after))
config=config.replace(/(\[db\.seed\]\s*\n)([^[]*)/,(whole,header,body)=>header+body.replace('enabled = true','enabled = false'))
config=config.replace(/(\[auth\.mfa\.totp\]\s*\n)([^[]*)/,(whole,header,body)=>header+body.replace('enroll_enabled = false','enroll_enabled = true').replace('verify_enabled = false','verify_enabled = true'))
writeFileSync(file,config,{mode:0o600})
cli(['start','--exclude','studio,realtime,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta'],'start')
const status=JSON.parse(cli(['status','--output','json'],'status'))
writeFileSync(resolve(directory,'private/local-status.json'),JSON.stringify(status),{mode:0o600})
console.log('Started isolated local project '+basename(directory)+'. Credentials remain in its private directory.')
