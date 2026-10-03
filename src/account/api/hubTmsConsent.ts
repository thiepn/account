export const HUB_TMS_PURPOSES = ['tms60.hub.summary.read','tms60.hub.continue.read','tms60.hub.search.read'] as const;
export type HubTmsPurpose = typeof HUB_TMS_PURPOSES[number];
export type HubTmsConsent = {permissions:HubTmsPurpose[];revision:string|null};
export function parseHubTmsConsent(value:unknown):HubTmsConsent {
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('HUB_CONSENT_INVALID');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='permissions,revision' || !Array.isArray(v.permissions) ||
     v.permissions.length>3 || !v.permissions.every(p=>HUB_TMS_PURPOSES.includes(p)) ||
     new Set(v.permissions).size!==v.permissions.length ||
     !(v.revision===null || typeof v.revision==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.revision)) ||
     v.revision===null && v.permissions.length>0)throw new Error('HUB_CONSENT_INVALID');
  return {permissions:[...v.permissions].sort() as HubTmsPurpose[],revision:v.revision as string|null};
}

export const TMS_TRANSLATIONS = ["esv","niv","nlt","hfa","schlachter1951","klb1985","krv1961"] as const;
export type TmsTranslation = typeof TMS_TRANSLATIONS[number];
