import {createElement,act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {AccountServiceProvider} from '../account/context';
import type {AccountService} from '../account/service';
import type {HubNotesConsent} from '../account/api/hubConsent';
import {HubConnectionsPage} from './HubConnectionsPage';

const REV='11111111-1111-4111-8111-111111111111';
const ready:HubNotesConsent={permissions:[],revision:REV};
let root:Root|undefined,container:HTMLDivElement|undefined;
afterEach(async()=>{if(root)await act(async()=>root!.unmount());container?.remove();root=undefined;container=undefined;});
async function mount(hub:AccountService['hub']){
  let listener:()=>void=()=>{};
  const service={hub,auth:{subscribe:(next:()=>void)=>{listener=next;return()=>{};}}} as unknown as AccountService;
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
  await act(async()=>root!.render(createElement(AccountServiceProvider,{service,children:createElement(HubConnectionsPage)})));
  return async()=>{await act(async()=>listener());};
}
describe('H12 consent UI ownership and recovery',()=>{
  it('starts with all sharing unchecked and saves only explicit choices with the revision',async()=>{
    const saveConsent=vi.fn(async()=>ready);await mount({readConsent:async()=>ready,saveConsent});
    expect([...container!.querySelectorAll('input')].every(input=>!input.checked)).toBe(true);
    await act(async()=>container!.querySelector<HTMLInputElement>('input')!.click());
    await act(async()=>[...container!.querySelectorAll('button')].find(b=>b.textContent==='Save choices')!.click());
    expect(saveConsent).toHaveBeenCalledWith(['notes.hub.summary.read'],REV);
  });
  it('retains the draft after a failed save without claiming it succeeded',async()=>{
    await mount({readConsent:async()=>ready,saveConsent:async()=>{throw new Error('SQL private error');}});
    await act(async()=>container!.querySelector<HTMLInputElement>('input')!.click());
    await act(async()=>[...container!.querySelectorAll('button')].find(b=>b.textContent==='Save choices')!.click());
    expect(container!.querySelector<HTMLInputElement>('input')!.checked).toBe(true);expect(container!.textContent).toContain('Changes were not saved');expect(container!.textContent).not.toContain('SQL private error');
  });
  it('clears the earlier draft on account change and ignores a late old-owner read',async()=>{
    let resolve!:(value:HubNotesConsent)=>void;let calls=0;
    const change=await mount({readConsent:async()=>++calls===1?new Promise(r=>{resolve=r;}):ready,saveConsent:async()=>ready});
    await change();await act(async()=>resolve({permissions:['notes.hub.search.read'],revision:REV}));
    expect([...container!.querySelectorAll('input')].every(input=>!input.checked)).toBe(true);
  });
  it('revokes every purpose in one save without deleting notes',async()=>{
    const saveConsent=vi.fn(async()=>ready);await mount({readConsent:async()=>({permissions:['notes.hub.search.read'],revision:REV}),saveConsent});
    await act(async()=>[...container!.querySelectorAll('button')].find(b=>b.textContent==='Revoke all Hub access')!.click());
    expect(saveConsent).toHaveBeenCalledWith([],REV);expect(container!.textContent).toContain('Hub access revoked');
  });
});
