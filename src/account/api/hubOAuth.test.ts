import {describe,it,expect} from 'vitest';
import {hubOAuthRedirect,parseHubOAuthDetails,authorizationId} from './hubOAuth';
const A='11111111-1111-4111-8111-111111111111',CLIENT='33333333-3333-4333-8333-333333333333',ID='fictional-authorization';
const details={authorization_id:ID,redirect_uri:'https://thiepn.dev/home/',client:{id:CLIENT,uri:'https://thiepn.dev/'},user:{id:A},scope:'email'};
const callback='https://thiepn.dev/home/?code=fictional&state='+'x'.repeat(43);
describe('H14 Account managed OAuth request boundaries',()=>{
  it('accepts only the configured Hub client, owner, callback and scope',()=>{expect(parseHubOAuthDetails(details,ID,A,CLIENT)).toEqual({authorizationId:ID,owner:A,scope:'email'});expect(hubOAuthRedirect(callback)).toBe(callback);});
  it.each([{authorization_id:'other'},{redirect_uri:'https://evil.test/'},{scope:'email phone'},{client:{id:A,uri:'https://thiepn.dev/'}},{user:{id:CLIENT}}])('rejects mismatched request %j',patch=>expect(()=>parseHubOAuthDetails({...details,...patch},ID,A,CLIENT)).toThrow());
  it.each([callback.replace('thiepn.dev','evil.test'),callback+'&code=duplicate',callback+'#token',callback+'&next=https://evil.test','javascript:alert(1)'])('rejects unsafe redirect %s',url=>expect(()=>hubOAuthRedirect(url)).toThrow());
  it('accepts a bounded denial redirect without following client-provided URLs',()=>{const url='https://thiepn.dev/home/?error=access_denied&state='+'x'.repeat(43);expect(hubOAuthRedirect(url)).toBe(url);expect(()=>authorizationId('../secret')).toThrow();expect(()=>parseHubOAuthDetails(details,ID,A,'')).toThrow();});
});
