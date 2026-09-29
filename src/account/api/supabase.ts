import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const configSchema=z.object({
  url:z.string().url(),
  publishableKey:z.string().min(20),
});

let client:SupabaseClient|undefined;

export function getAccountSupabaseClient(){
  if(client)return client;
  const parsed=configSchema.safeParse({
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

export function hasAccountApiConfiguration(){
  return configSchema.safeParse({url:import.meta.env.VITE_SUPABASE_URL,publishableKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}).success;
}
