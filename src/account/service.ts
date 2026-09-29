import type { AccountCapabilities, AccountProfile, AuthState, ConnectedAppSummary, DataSummary, DeviceSummary, Overview, SecuritySummary } from "./types";

export interface AuthService { getState():Promise<AuthState>; signIn():Promise<void>; signOut():Promise<void>; }
export interface UpdateProfileInput {
  displayName:string;
  preferredLanguage:string;
  timezone:string;
}

export interface ProfileService {
  getProfile():Promise<AccountProfile>;
  updateProfile(input:UpdateProfileInput):Promise<AccountProfile>;
}
export interface SecurityService { getSummary():Promise<SecuritySummary>; }
export interface DeviceService { listDevices():Promise<DeviceSummary[]>; }
export interface AppsService { listApps():Promise<ConnectedAppSummary[]>; }
export interface DataService { getSummary():Promise<DataSummary>; }
export interface PrivacyService { getSummary():Promise<{exportAvailable:boolean;appDeletionAvailable:boolean;accountDeletionAvailable:boolean}>; }
export interface CapabilityService { getCapabilities():Promise<AccountCapabilities>; }

export interface AccountService {
  auth:AuthService; profile:ProfileService; security:SecurityService; devices:DeviceService;
  apps:AppsService; data:DataService; privacy:PrivacyService; capabilities:CapabilityService;
  getOverview():Promise<Overview>;
}
