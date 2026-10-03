export const HUB_NOTE_PURPOSES = ['notes.hub.summary.read','notes.hub.continue.read','notes.hub.search.read'] as const;
export type HubNotePurpose = typeof HUB_NOTE_PURPOSES[number];
export type HubNotesConsent = {permissions:HubNotePurpose[];revision:string|null};
export function parseHubNotesConsent(value:unknown):HubNotesConsent {
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('HUB_CONSENT_INVALID');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='permissions,revision' || !Array.isArray(v.permissions) ||
     v.permissions.length>3 || !v.permissions.every(p=>HUB_NOTE_PURPOSES.includes(p)) ||
     new Set(v.permissions).size!==v.permissions.length ||
     !(v.revision===null || typeof v.revision==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.revision)) ||
     v.revision===null && v.permissions.length>0)throw new Error('HUB_CONSENT_INVALID');
  return {permissions:[...v.permissions].sort() as HubNotePurpose[],revision:v.revision as string|null};
}
