import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const REQUIRED_CHECKS=Object.freeze([
  'google-signin','protected-deeplink','current-session-signout',
  'same-account-reauth','different-account-reauth','sessions-other',
  'profile-update','app-permission','app-disconnect-reconnect',
  'data-inventory-export','wttn-delete','tms60-restore',
  'account-delete-cancel','android-chrome','samsung-internet',
  'edge-desktop','keyboard-zoom','screen-reader','theme-modes',
]);
export const OPTIONAL_CHECKS=Object.freeze(['ios-safari']);

const safeText=x=>typeof x==='string'&&x.trim().length>=3;
const iso=x=>typeof x==='string'&&!Number.isNaN(Date.parse(x))
  && new Date(x).toISOString()===x;

/**
 * Read-only release gate. It never authorizes a destructive test or changes a
 * user's data. Human evidence must be provided out of band and reviewed.
 */
export function validateReleaseCertification(version,ledger){
  const errors=[];
  if(!ledger||typeof ledger!=='object'||ledger.schemaVersion!==1
    ||!Array.isArray(ledger.manualChecks))return ['CERTIFICATION_LEDGER_INVALID'];
  if(ledger.release!==version)errors.push('CERTIFICATION_RELEASE_MISMATCH');
  const checks=new Map();
  for(const item of ledger.manualChecks){
    if(!item||typeof item.id!=='string'||checks.has(item.id)){
      errors.push('CERTIFICATION_DUPLICATE_OR_INVALID_CHECK');continue;
    }
    checks.set(item.id,item);
  }
  for(const id of [...REQUIRED_CHECKS,...OPTIONAL_CHECKS]){
    if(!checks.has(id))errors.push('CERTIFICATION_CHECK_MISSING:'+id);
  }
  for(const item of ledger.manualChecks){
    if(![...REQUIRED_CHECKS,...OPTIONAL_CHECKS].includes(item.id))
      errors.push('CERTIFICATION_UNKNOWN_CHECK:'+item.id);
    if(typeof item.description!=='string'||item.description.trim().length<10)
      errors.push('CERTIFICATION_DESCRIPTION_MISSING:'+item.id);
    if(typeof item.required!=='boolean'||item.required!==REQUIRED_CHECKS.includes(item.id))
      errors.push('CERTIFICATION_REQUIRED_FLAG_INVALID:'+item.id);
    if(!['pending','passed','not-applicable'].includes(item.status))
      errors.push('CERTIFICATION_STATUS_INVALID:'+item.id);
    if(item.required&&item.status==='not-applicable')
      errors.push('CERTIFICATION_REQUIRED_NOT_APPLICABLE:'+item.id);
    if(item.status!=='pending'&&(!safeText(item.evidence)||!safeText(item.verifiedBy)
       ||!iso(item.verifiedAt)))
      errors.push('CERTIFICATION_EVIDENCE_MISSING:'+item.id);
  }
  if(version==='1.0.0'){
    if(!safeText(ledger.reviewedBy)||!iso(ledger.reviewedAt))
      errors.push('CERTIFICATION_FINAL_REVIEW_MISSING');
    for(const item of ledger.manualChecks){
      if(item.required&&item.status!=='passed')
        errors.push('CERTIFICATION_BLOCKED:'+item.id);
      if(!item.required&&item.status==='pending')
        errors.push('CERTIFICATION_OPTIONAL_NOT_DISPOSITIONED:'+item.id);
    }
  }
  return errors;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const root=new URL('../',import.meta.url);
  const packageJson=JSON.parse(readFileSync(new URL('package.json',root),'utf8'));
  const ledger=JSON.parse(readFileSync(new URL('docs/release-certification.json',root),'utf8'));
  const errors=validateReleaseCertification(packageJson.version,ledger);
  if(errors.length){
    console.error('Account release gate failed:\\n'+errors.join('\\n'));
    process.exitCode=1;
  }else{
    console.log('Account release gate passed:',packageJson.version,
      packageJson.version==='1.0.0'?'human sign-off evidence recorded':'release candidate only');
  }
}
