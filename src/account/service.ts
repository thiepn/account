import type { AccountCapabilities, AccountProfile, AppCloudDataDetail, AppCloudDataSummary, AuthState, BackupOperation, BackupPolicy, BackupSnapshot, BackupSummary, ConnectedAppDetail, ConnectedAppSummary, DataSummary, DeviceSummary, Overview, RestoreOperation, RestorePlan, SecurityEvent, SecuritySummary, SessionSummary } from "./types";

export interface AuthService { getState():Promise<AuthState>; signIn():Promise<void>; signOut():Promise<void>; }
export interface UpdateProfileInput { displayName:string; preferredLanguage:string; timezone:string; }
export interface ProfileService { getProfile():Promise<AccountProfile>; updateProfile(input:UpdateProfileInput):Promise<AccountProfile>; }
export interface SecurityService { getSummary():Promise<SecuritySummary>; listActivity():Promise<SecurityEvent[]>; getEvent(id:string):Promise<SecurityEvent|null>; }
export interface DeviceService {
  listDevices():Promise<DeviceSummary[]>; getDevice(id:string):Promise<DeviceSummary|null>; listSessions():Promise<SessionSummary[]>;
  revokeSession(id:string):Promise<void>; revokeDevice(id:string):Promise<void>; revokeOtherSessions():Promise<void>;
}
export interface AppsService {
  listApps():Promise<ConnectedAppSummary[]>;
  getApp(appId:string):Promise<ConnectedAppDetail|null>;
  grantPermission(appId:string,permissionId:string):Promise<ConnectedAppDetail>;
  revokePermission(appId:string,permissionId:string):Promise<ConnectedAppDetail>;
  disconnect(appId:string):Promise<void>;
}
export interface DataService {
  getSummary():Promise<DataSummary>;
  listAppData():Promise<AppCloudDataSummary[]>;
  getAppData(appId:string):Promise<AppCloudDataDetail|null>;
  retrySync(appId:string):Promise<AppCloudDataDetail>;
  updateSyncConfiguration(appId:string,enabled:boolean):Promise<AppCloudDataDetail>;
}
export interface BackupService {
  getSummary():Promise<BackupSummary>;
  listBackups():Promise<BackupSnapshot[]>;
  getBackup(id:string):Promise<BackupSnapshot|null>;
  createBackup():Promise<BackupOperation>;
  getPolicy():Promise<BackupPolicy>;
  updatePolicy(input:BackupPolicy):Promise<BackupPolicy>;
  planRestore(backupId:string,selectedApps:string[]):Promise<RestorePlan>;
  startRestore(planId:string):Promise<RestoreOperation>;
  getRestoreOperation(id:string):Promise<RestoreOperation|null>;
}
export interface PrivacyService { getSummary():Promise<{exportAvailable:boolean;appDeletionAvailable:boolean;accountDeletionAvailable:boolean}>; }
export interface CapabilityService { getCapabilities():Promise<AccountCapabilities>; }

export interface AccountService {
  auth:AuthService; profile:ProfileService; security:SecurityService; devices:DeviceService;
  apps:AppsService; data:DataService; backup:BackupService; privacy:PrivacyService; capabilities:CapabilityService;
  getOverview():Promise<Overview>;
}
