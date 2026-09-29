import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {matchesExperience} from '../src/lib/places-experiences.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const payload=read('src/data/places-dubai.generated.json');
const curation=read('src/data/dubai-date-curation.json');
const editorial=read('src/data/places-editorial.json');
const id='the-courtyard-al-quoz',googleId='ChIJxWaG5CpqXz4R63SPc-GJlSM';
const place=payload.places.find(p=>p.id===id),canonical=curation.places.find(p=>p.id===id);

test('the Courtyard complex has its own verified pin, distinct from its café and theatre',()=>{
  assert.ok(place && canonical);
  assert.equal(payload.places.filter(p=>p.id===id || p.placeId===googleId).length,1);
  assert.equal(place.name,'The Courtyard — Al Quoz');
  assert.equal(place.placeId,googleId);
  assert.equal(place.emirate,'Dubai');
  assert.deepEqual(place.coordinates,{lat:25.1434824,lng:55.2232427});
  assert.equal(place.primaryGoogleType,'community_center');
  assert.equal(place.resolution.matchedName,'Courtyard');
  assert.equal(place.resolution.businessStatus,'OPERATIONAL');
  assert.equal(place.resolution.matchedAt,'2026-09-29T04:33:34.633Z');
  assert.equal(new URL(place.googleMapsSearchUri).searchParams.get('query_place_id'),googleId);
  for(const tenant of ['boston-lane-al-quoz','the-courtyard-playhouse']){
    const other=payload.places.find(p=>p.id===tenant);
    assert.ok(other);assert.notEqual(other.placeId,place.placeId);
  }
  for(const [key,value] of Object.entries(canonical))assert.deepEqual(place[key],value,key);
  assert.equal(payload.meta.placeCount,payload.places.length);
  assert.equal(payload.meta.curatedRecordCount,curation.places.length);
});

test('the complex appears in art spaces and strolls without inventing a dated event',()=>{
  assert.ok(matchesExperience(place,[],'arts-culture','galleries'));
  assert.ok(matchesExperience(place,[],'activities','strolls'));
  assert.equal(matchesExperience(place,[],'whats-on'),false);
  assert.equal(matchesExperience(place,[],'eat-drink','cafes'),false);
  assert.equal(place.events,undefined);
  assert.equal(place.listingType,'place');
  const guide=editorial.guides.find(g=>g.placeId===id);
  assert.equal(guide.verifiedAt,'2026-09-29');
  assert.match(guide.practicalities.find(p=>p.label==='Published complex hours').text,/Individual cafés.*different hours/);
  assert.deepEqual(guide.pairWithPlaceIds,['boston-lane-al-quoz','the-courtyard-playhouse']);
  for(const source of guide.sources)assert.equal(new URL(source.url).hostname,'www.courtyard-uae.com');
  assert.ok(Date.parse(editorial.researchedAt)>=Date.parse(guide.verifiedAt));
});

test('offline regeneration retains the Courtyard identity, pin and taxonomy',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nsso-courtyard-test-'));
  try{
    fs.writeFileSync(path.join(dir,'source.csv'),'Location Name,Location Description,Location URL,Location\n');
    fs.writeFileSync(path.join(dir,'curation.json'),JSON.stringify({version:1,places:[canonical]}));
    fs.writeFileSync(path.join(dir,'.places-geocode-cache.json'),JSON.stringify({[`google-place-id:${googleId}`]:{
      address:place.address,coordinates:place.coordinates,placeId:googleId,googleTypes:place.googleTypes,primaryGoogleType:place.primaryGoogleType,
      resolutionSource:place.resolution.source,resolutionStatus:place.resolution.status,fetchedAt:place.resolution.matchedAt,
      matchedName:place.resolution.matchedName,websiteUri:place.resolution.websiteUri,businessStatus:place.resolution.businessStatus,
    }}));
    fs.writeFileSync(path.join(dir,'no-network.mjs'),"globalThis.fetch=()=>{throw new Error('Unexpected network request');};\n");
    execFileSync(process.execPath,['--import',path.join(dir,'no-network.mjs'),path.join(root,'scripts/build-dubai-places.mjs'),'--source','source.csv','--curation','curation.json','--output','output.json','--as-of','2026-09-29T04:33:34.633Z'],{cwd:dir,env:{...process.env,GOOGLE_PLACES_ENRICHMENT_API_KEY:'offline-test-only'},timeout:15000});
    const result=JSON.parse(fs.readFileSync(path.join(dir,'output.json'),'utf8'));
    assert.equal(result.meta.cacheMisses,0);assert.equal(result.places.length,1);
    for(const [key,value] of Object.entries(canonical))assert.deepEqual(result.places[0][key],value,key);
    assert.deepEqual(result.places[0].coordinates,place.coordinates);
    assert.deepEqual(result.places[0].resolution,place.resolution);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
