import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {validateReleaseCertification,REQUIRED_CHECKS,OPTIONAL_CHECKS} from './check-release-certification.mjs';

const original=JSON.parse(readFileSync(new URL('../docs/release-certification.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(original);
function fullySigned(){
  const ledger=clone();
  ledger.release='1.0.0';
  ledger.reviewedBy='Release reviewer';
  ledger.reviewedAt='2026-10-08T16:00:00.000Z';
  for(const entry of ledger.manualChecks){
    entry.status='passed';
    entry.evidence='https://example.test/release-evidence/'+entry.id;
    entry.verifiedBy='Device test operator';
    entry.verifiedAt='2026-10-08T16:00:00.000Z';
  }
  return ledger;
}

test('release-candidate ledger remains explicitly pending and syntactically sound',()=>{
  assert.equal(REQUIRED_CHECKS.length,19);
  assert.equal(OPTIONAL_CHECKS.length,1);
  assert.deepEqual(validateReleaseCertification('1.0.0-rc.2',clone()),[]);
});

test('renaming version to 1.0.0 cannot release without a completed ledger',()=>{
  const ledger=clone();
  ledger.release='1.0.0';
  const errors=validateReleaseCertification('1.0.0',ledger);
  assert.ok(errors.some(x=>x.startsWith('CERTIFICATION_BLOCKED:')));
  assert.ok(errors.includes('CERTIFICATION_FINAL_REVIEW_MISSING'));
});

test('a fully reviewed stable release can pass the structural gate',()=>{
  assert.deepEqual(validateReleaseCertification('1.0.0',fullySigned()),[]);
});

test('required checks cannot be marked N/A to bypass physical and destructive testing',()=>{
  const ledger=fullySigned();
  const required=ledger.manualChecks.find(x=>x.id==='account-delete-cancel');
  required.status='not-applicable';
  const errors=validateReleaseCertification('1.0.0',ledger);
  assert.ok(errors.includes('CERTIFICATION_REQUIRED_NOT_APPLICABLE:account-delete-cancel'));
  assert.ok(errors.includes('CERTIFICATION_BLOCKED:account-delete-cancel'));
});

test('optional iOS testing must be explicitly accounted for if no iOS device is available',()=>{
  const ledger=fullySigned();
  const optional=ledger.manualChecks.find(x=>x.id==='ios-safari');
  optional.status='not-applicable';
  optional.evidence='Operator confirmed no iOS device available for release certification';
  assert.deepEqual(validateReleaseCertification('1.0.0',ledger),[]);
  optional.status='pending';
  assert.ok(validateReleaseCertification('1.0.0',ledger)
    .includes('CERTIFICATION_OPTIONAL_NOT_DISPOSITIONED:ios-safari'));
});

test('missing, duplicate or fabricated status values invalidate the ledger',()=>{
  const ledger=fullySigned();
  ledger.manualChecks.push({...ledger.manualChecks[0]});
  assert.ok(validateReleaseCertification('1.0.0',ledger).includes('CERTIFICATION_DUPLICATE_OR_INVALID_CHECK'));
  ledger.manualChecks.pop();
  ledger.manualChecks[0].status='done';
  assert.ok(validateReleaseCertification('1.0.0',ledger).includes('CERTIFICATION_STATUS_INVALID:google-signin'));
  ledger.manualChecks[0].status='passed';
  ledger.manualChecks[0].evidence='';
  assert.ok(validateReleaseCertification('1.0.0',ledger).includes('CERTIFICATION_EVIDENCE_MISSING:google-signin'));
});

test('copying old rc evidence without updating the release field fails',()=>{
  const errors=validateReleaseCertification('1.0.0',clone());
  assert.ok(errors.includes('CERTIFICATION_RELEASE_MISMATCH'));
});
