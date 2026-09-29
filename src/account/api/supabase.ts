import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const backendConfigSchema=z.object({
  url:z.string().url(),
  publishableKey:z.string().min(20),
});
const originSchema=z.string().url().transform((value)=>new URL(value).origin);

let client:SupabaseClient|undefined;

export function getAccountSupabaseClient(){
  if(client)return client;
  const parsed=backendConfigSchema.safeParse({
    url:import.meta.env.VITE_SUPABASE_URL,
    publishableKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  if(!parsed.success)throw new Error("ACCOUNT_BACKEND_CONFIG_INVALID");
  client=createClient(parsed.data.url,parsed.data.publishableKey,{
    auth:{
      flowType:"pkce",
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:false,
    },
  });
  return client;
}

export function getAccountOAuthOrigin(){
  if(import.meta.env.PROD){
    const parsed=originSchema.safeParse(import.meta.env.VITE_ACCOUNT_CANONICAL_ORIGIN);
    if(!parsed.success||!parsed.data.startsWith("https://"))throw new Error("ACCOUNT_CANONICAL_ORIGIN_INVALID");
    return parsed.data;
  }
  return window.location.origin;
}

export function hasAccountApiConfiguration(){
  const backend=backendConfigSchema.safeParse({
    url:import.meta.env.VITE_SUPABASE_URL,
    publishableKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  }).success;
  if(!backend)return false;
  if(!import.meta.env.PROD)return true;
  const origin=originSchema.safeParse(import.meta.env.VITE_ACCOUNT_CANONICAL_ORIGIN);
  return origin.success&&origin.data.startsWith("https://");
}
