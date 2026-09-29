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

export interface DataSummary { totalStorageBytes:number; appCount:number; syncStatus:"healthy"|"attention"|"unavailable"; lastBackupAt?:string|undefined; backupStatus:"verified"|"failed"|"none"; }
export interface Overview { identity:AccountIdentity; security:SecuritySummary; devices:DeviceSummary[]; apps:ConnectedAppSummary[]; data:DataSummary; }
export interface AccountCapabilities { profileRead:boolean; profileWrite:boolean; securityRead:boolean; devicesRead:boolean; appsRead:boolean; dataRead:boolean; privacyRead:boolean; }
export interface AccountError {
  code:string;
  kind:"network"|"authentication"|"authorization"|"validation"|"conflict"|"rate_limit"|"server"|"unsupported";
  message?:string|undefined; retryable:boolean;
}
