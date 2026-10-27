import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminEmailEligible, isVerifiedAdminIdentity, canAccessAdmin } from '../src/lib/admin-access.ts';

test('administrator email eligibility is an exact normalized allowlist, not a domain or metadata rule', () => {
    for (const email of ['raminhoodeh@gmail.com','troy@nsso.me',' RAMINHOODEH@GMAIL.COM ','TROY@NSSO.ME']) assert.equal(isAdminEmailEligible(email),true,email);
    for (const email of [null,undefined,{},'','admin@nsso.me','troy+admin@nsso.me','troy@nsso.me.evil.test','raminhoodeh@gmail.com.evil.test','raminhoodeh@gmail.com\n.attacker']) assert.equal(isAdminEmailEligible(email),false,String(email));
});

test('email verification comes from the current Auth identity, never generic or phone confirmation and metadata', () => {
    assert.equal(isVerifiedAdminIdentity({email:'troy@nsso.me',email_confirmed_at:'2026-01-01T00:00:00Z'}),true);
    for (const user of [null,undefined,{email:'outside@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'},{email:'troy@nsso.me'},{email:'troy@nsso.me',email_confirmed_at:''},{email:'troy@nsso.me',confirmed_at:'2026-01-01T00:00:00Z',phone_confirmed_at:'2026-01-01T00:00:00Z',user_metadata:{email_confirmed_at:'2026-01-01T00:00:00Z'}}]) assert.equal(isVerifiedAdminIdentity(user),false);
});

test('administrator navigation requires an eligible email and the server-issued protected capability', () => {
    assert.equal(canAccessAdmin({email:'TROY@NSSO.ME',permissions:['nsso:admin']}),true);
    for (const user of [null,undefined,{email:'troy@nsso.me'},{email:'troy@nsso.me',permissions:['razinflix:manage']},{email:'other@example.test',permissions:['nsso:admin']},{email:'troy@nsso.me',user_type:'admin',permissions:[]}]) assert.equal(canAccessAdmin(user),false);
});
