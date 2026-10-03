import {describe,expect,it} from 'vitest';
import {parseHubTmsConsent,HUB_TMS_PURPOSES} from './hubTmsConsent';
const revision='11111111-1111-4111-8111-111111111111';
describe('Hub consent response boundary',()=>{
  it('accepts unconfigured consent without adopting any permission',()=>expect(parseHubTmsConsent({permissions:[],revision:null})).toEqual({permissions:[],revision:null}));
  it('accepts explicit purpose permissions and copies their array',()=>{const permissions=[...HUB_TMS_PURPOSES];const result=parseHubTmsConsent({permissions,revision});permissions.length=0;expect(result.permissions).toHaveLength(3);});
  it.each([null,[],{}, {permissions:['app_data.read'],revision},{permissions:[HUB_TMS_PURPOSES[0],HUB_TMS_PURPOSES[0]],revision},{permissions:[HUB_TMS_PURPOSES[0]],revision:null},{permissions:[],revision:'not-a-revision'},{permissions:[],revision,accountId:'caller-owner'}])('rejects untrusted snapshot %j',value=>expect(()=>parseHubTmsConsent(value)).toThrow('HUB_CONSENT_INVALID'));
});
