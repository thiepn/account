import type { AccountService } from "../service";
import { createMockAccountService } from "../mock/MockAccountService";
import { createApiAccountService } from "./ApiAccountService";
import { hasAccountApiConfiguration } from "./supabase";
import { unavailableAccountService } from "./UnavailableAccountService";

export function createAccountService():AccountService{
  const requested=import.meta.env.VITE_ACCOUNT_SERVICE_MODE;
  if(import.meta.env.DEV&&requested!=="real")return createMockAccountService();
  if((requested==="real"||import.meta.env.PROD)&&hasAccountApiConfiguration())return createApiAccountService();
  return unavailableAccountService;
}
