export type AccountStatus="active"|"restricted"|"deletion-pending";
export type AuthState="signed-out"|"signed-in"|"session-expired";

export interface AccountIdentity {
  accountId:string; displayName:string; primaryEmail:string; emailVerified:boolean;
  provider:"google"; createdAt:string; status:AccountStatus;
}
export interface AccountProfile { displayName:string; preferredLanguage:string; timezone:string; avatarUrl?:string|undefined; }

export type SecurityEventCategory="authentication"|"security"|"apps"|"account";
export interface SecurityEvent {
  id:string; type:string; category:SecurityEventCategory; severity:"info"|"warning"|"critical";
  occurredAt:string; title:string; description:string; deviceId?:string|undefined; sessionId?:string|undefined;
}
export interface SecuritySummary { attention:string[]; authMethod:"Google"; twoStepVerification:"enabled"|"disabled"|"unavailable"; recentActivity:SecurityEvent[]; }

export interface SessionSummary {
  id:string; deviceId:string; createdAt:string; lastActivityAt:string; authMethod:"Google";
  clientName:string; current:boolean; status:"active"|"revoked"|"expired";
}
export interface DeviceSummary {
  id:string; label:string; platform:string; current:boolean; firstSeenAt:string; lastActivityAt:string; sessions:SessionSummary[];
}

export interface PermissionDefinition {
  id:string; name:string; description:string; required:boolean; mutableByUser:boolean; sensitivity:"basic"|"sensitive";
}
export interface GrantedPermission {
  permissionId:string; status:"granted"|"denied"; updatedAt:string;
}
export interface AppCapabilities {
  accountIdentity:boolean; cloudSync:boolean; backup:boolean; export:boolean; cloudDataDeletion:boolean; permissionManagement:boolean;
}
export interface RegisteredApp {
  id:string; slug:string; name:string; description:string; status:"active"|"beta"|"deprecated"|"disabled";
  productUrl?:string|undefined; supportedCapabilities:AppCapabilities; availablePermissions:PermissionDefinition[];
}
export interface AppConnection {
  appId:string; status:"connected"|"limited"|"disconnected"|"suspended"|"error";
  connectedAt?:string|undefined; lastUsedAt?:string|undefined; grantedPermissions:GrantedPermission[];
}
export interface ConnectedAppSummary {
  id:string; name:string; status:"connected"|"limited"|"error"; lastUsedAt?:string|undefined; permissionCount:number;
}
export interface ConnectedAppDetail { app:RegisteredApp; connection:AppConnection; }

export type SyncStatus="up-to-date"|"syncing"|"pending"|"delayed"|"offline"|"conflict"|"error"|"disabled"|"unavailable";
export interface SyncIssueSummary { code:string; kind:"network"|"authorization"|"conflict"|"version"|"server"|"unknown"; message:string; retryable:boolean; }
export interface AppSyncState { status:SyncStatus; lastAttemptAt?:string|undefined; lastSuccessfulSyncAt?:string|undefined; lastDataChangeAt?:string|undefined; pendingChanges?:number|undefined; error?:SyncIssueSummary|undefined; }
export interface SyncConfiguration { supported:boolean; enabled:boolean; userControllable:boolean; }
export interface SyncClientSummary { id:string; label:string; lastSuccessfulSyncAt?:string|undefined; status:"up-to-date"|"pending"|"offline"|"reconciliation-required"; }
export interface AppCloudDataSummary {
  appId:string; appName:string; namespaceId:string; namespaceStatus:"active"|"retained"|"archived";
  generation:number; revision:number; schemaVersion:number;
  storageBytes:number; recordCount?:number|undefined; updatedAt?:string|undefined;
  sync:AppSyncState; configuration:SyncConfiguration;
}
export interface AppCloudDataDetail extends AppCloudDataSummary { clients:SyncClientSummary[]; }

export interface BackupAppSnapshot {
  appId:string; appName:string; namespaceId:string; sourceGeneration:number; sourceRevision:number; schemaVersion:number; sizeBytes:number;
}
export interface BackupSnapshot {
  id:string; createdAt:string; status:"creating"|"verified"|"unverified"|"failed"|"corrupted";
  type:"automatic"|"manual"|"pre-restore"; destination:{type:"mock";label:string}; sizeBytes:number; apps:BackupAppSnapshot[];
  integrity:{status:"pending"|"verified"|"failed";verifiedAt?:string|undefined}; manifestVersion:number;
}
export interface BackupOperation { id:string; status:"queued"|"collecting"|"writing"|"verifying"|"completed"|"failed"; startedAt:string; completedAt?:string|undefined; backupId?:string|undefined; }
export interface BackupPolicy { enabled:boolean; frequency:"daily"|"weekly"|"manual-only"; includedApps:string[]; }
export interface BackupSummary { lastSuccessful?:BackupSnapshot|undefined; activeOperation?:BackupOperation|undefined; policy:BackupPolicy; attention?:string|undefined; }
export interface RestorePlan {
  id:string; backupId:string; selectedApps:string[]; blockers:string[]; warnings:string[]; safetySnapshotRequired:boolean; requiresReauthentication:boolean; expiresAt:string;
}
export interface RestoreAppResult { appId:string; status:"restored"|"skipped"|"failed"|"rolled-back"; verified:boolean; newGeneration?:number|undefined; errorCode?:string|undefined; }
export interface RestoreOperation {
  id:string; backupId:string; selectedApps:string[]; status:"planning"|"creating-safety-snapshot"|"restoring"|"verifying"|"completed"|"partially-completed"|"failed"|"cancelled";
  startedAt:string; completedAt?:string|undefined; appResults?:RestoreAppResult[]|undefined; safetyBackupId?:string|undefined;
}

export interface ExportRequest {
  id:string; scope:"account"|"selected-apps"; appIds?:string[]|undefined;
  status:"queued"|"collecting"|"packaging"|"ready"|"expired"|"failed";
  requestedAt:string; completedAt?:string|undefined; expiresAt?:string|undefined; sizeBytes?:number|undefined;
}
export interface AppDataDeletionPlan {
  id:string; appId:string; appName:string; storageBytes:number; blockers:string[]; warnings:string[];
  backupImpact:string; requiresReauthentication:boolean; expiresAt:string;
}
export interface AppDataDeletionOperation {
  id:string; appId:string; status:"queued"|"deleting-live-data"|"processing-backups"|"verifying"|"completed"|"partially-completed"|"failed";
  startedAt:string; completedAt?:string|undefined;
}
export interface AccountDeletionPlan {
  id:string; appCount:number; namespaceCount:number; backupCount:number; blockers:string[]; warnings:string[];
  gracePeriodDays:number; requiresReauthentication:boolean; expiresAt:string;
}
export interface AccountDeletionRequest {
  id:string; status:"pending"|"cancelling"|"deleting"|"verifying"|"completed"|"failed"|"cancelled";
  requestedAt:string; cancellableUntil?:string|undefined; scheduledDeletionAt?:string|undefined; completedAt?:string|undefined;
}
export interface PrivacySummary {
  exportCount:number; readyExportCount:number; storedAppCount:number; retainedAppCount:number; accountStatus:AccountStatus;
  accountDeletion?:AccountDeletionRequest|undefined;
}

export interface DataSummary { totalStorageBytes:number; appCount:number; syncStatus:"healthy"|"attention"|"unavailable"; attentionCount:number; lastBackupAt?:string|undefined; backupStatus:"verified"|"failed"|"none"; }
export interface Overview { identity:AccountIdentity; security:SecuritySummary; devices:DeviceSummary[]; apps:ConnectedAppSummary[]; data:DataSummary; }
export interface AccountCapabilities { profileRead:boolean; profileWrite:boolean; securityRead:boolean; devicesRead:boolean; appsRead:boolean; dataRead:boolean; privacyRead:boolean; }
export interface AccountError {
  code:string;
  kind:"network"|"authentication"|"authorization"|"validation"|"conflict"|"rate_limit"|"server"|"unsupported";
  message?:string|undefined; retryable:boolean;
}
