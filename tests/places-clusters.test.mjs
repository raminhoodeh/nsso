import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterPlaces } from '../src/lib/places-clusters.ts';
const a={id:'a',coordinates:{lat:25.19,lng:55.28}}, b={id:'b',coordinates:{lat:25.1901,lng:55.2801}}, c={id:'c',coordinates:{lat:24.4,lng:54.4}};
test('mobile clustering reduces nearby pins without dropping any venue',()=>{const groups=clusterPlaces([a,b,c],11);assert.equal(groups.length,2);assert.deepEqual(groups.flatMap(x=>x.places.map(p=>p.id)).sort(),['a','b','c']);});
test('selected pins remain individually actionable',()=>{const groups=clusterPlaces([a,b,c],7,'a');assert.equal(groups.find(g=>g.places.some(p=>p.id==='a')).places.length,1);});
test('street-level zoom and empty sets remain navigable',()=>{assert.equal(clusterPlaces([a,b,c],17).length,3);assert.deepEqual(clusterPlaces([],10),[]);});
test('clusters are stable across source ordering and use finite in-region positions',()=>{const one=clusterPlaces([a,b,c],7),two=clusterPlaces([c,b,a],7);assert.deepEqual(one,two);for(const g of one)assert.ok(Number.isFinite(g.coordinates.lat)&&Number.isFinite(g.coordinates.lng));});
