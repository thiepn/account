import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateFirstPartyOnboarding} from './first-party-onboarding-contract.mjs';

const library='https://thiepn.dev/library/';
const callback='https://thiepn.dev/library/auth/callback/';
const id='76e41661-f8a9-4181-b8b9-4084f2e2acbf';

test('accepts a registered first-party path-based production app',()=>{
  assert.deepEqual(validateFirstPartyOnboarding(library,id,callback),{
    appUrl:library,
    appOrigin:'https://thiepn.dev',
    callbackUrl:callback,
    clientId:id,
  });
});

test('accepts first-party apps on distinct HTTPS subdomains',()=>{
  const result=validateFirstPartyOnboarding(
    'https://languages.thiepn.dev/',
    'c4522235-beb3-4f48-94fb-e274e92b7c84',
    'https://languages.thiepn.dev/auth/callback/',
  );
  assert.equal(result.appOrigin,'https://languages.thiepn.dev');
});

test('rejects untrusted or non-TLS app origins',()=>{
  for(const app of [
    'http://thiepn.dev/library/',
    'https://thiepn.dev.evil.test/library/',
    'https://evil.test/',
    'https://user:pass@thiepn.dev/library/',
    'https://thiepn.dev:444/library/',
    'https://thiepn.dev/library/?redirect=evil',
    'https://thiepn.dev/library/#token',
    'https://localhost:4173/',
  ]){
    assert.throws(()=>validateFirstPartyOnboarding(app,id,callback),{message:'FIRST_PARTY_HTTPS_URL_REQUIRED'});
  }
});

test('rejects callback on another origin even if it is another first-party app',()=>{
  assert.throws(()=>validateFirstPartyOnboarding(
    'https://languages.thiepn.dev/',id,callback,
  ),{message:'FIRST_PARTY_CALLBACK_ORIGIN_MISMATCH'});
});

test('rejects invalid client IDs and suspicious callback URLs',()=>{
  assert.throws(()=>validateFirstPartyOnboarding(library,'not-uuid',callback),{message:'FIRST_PARTY_CLIENT_ID_INVALID'});
  assert.throws(()=>validateFirstPartyOnboarding(library,id,'http://thiepn.dev/library/auth/callback/'),{message:'FIRST_PARTY_HTTPS_URL_REQUIRED'});
  assert.throws(()=>validateFirstPartyOnboarding(library,id,callback+'?code=bad'),{message:'FIRST_PARTY_HTTPS_URL_REQUIRED'});
});
