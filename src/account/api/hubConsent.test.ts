import {describe,expect,it} from 'vitest';
import {parseHubNotesConsent,HUB_NOTE_PURPOSES} from './hubConsent';
const revision='11111111-1111-4111-8111-111111111111';
describe('Hub consent response boundary',()=>{
  it('accepts unconfigured consent without adopting any permission',()=>expect(parseHubNotesConsent({permissions:[],revision:null})).toEqual({permissions:[],revision:null}));
  it('accepts explicit purpose permissions and copies their array',()=>{const permissions=[...HUB_NOTE_PURPOSES];const result=parseHubNotesConsent({permissions,revision});permissions.length=0;expect(result.permissions).toHaveLength(5);});
  it.each([null,[],{}, {permissions:['app_data.read'],revision}, {permissions:['notes.hub.inbox.attention.write'],revision},{permissions:[HUB_NOTE_PURPOSES[0],HUB_NOTE_PURPOSES[0]],revision},{permissions:[HUB_NOTE_PURPOSES[0]],revision:null},{permissions:[],revision:'not-a-revision'},{permissions:[],revision,accountId:'caller-owner'}])('rejects untrusted snapshot %j',value=>expect(()=>parseHubNotesConsent(value)).toThrow('HUB_CONSENT_INVALID'));
});
