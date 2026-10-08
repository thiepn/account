import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode="system"|"light"|"dark";
interface ThemeContextValue { mode:ThemeMode; cycle:()=>void; }
const ThemeContext=createContext<ThemeContextValue|null>(null);
const STORAGE_KEY="thiepn.account.theme";

function applyTheme(mode:ThemeMode){
  const dark=mode==="dark" || (mode==="system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme=dark ? "dark" : "light";
}

export function ThemeProvider({children}:{children:ReactNode}){
  const [mode,setMode]=useState<ThemeMode>(()=>{
    let value:string|null=null;
    try{value=localStorage.getItem(STORAGE_KEY);}catch{
      // Some privacy modes disable storage; theme preference remains in memory.
    }
    return value==="dark"||value==="light"||value==="system" ? value : "system";
  });
  useEffect(()=>{
    applyTheme(mode);
    try{localStorage.setItem(STORAGE_KEY,mode);}catch{
      // Keep the selected theme active even when browser storage is blocked.
    }
    if(mode!=="system") return;
    const media=window.matchMedia("(prefers-color-scheme: dark)");
    const update=()=>applyTheme("system");
    media.addEventListener("change",update);
    return()=>media.removeEventListener("change",update);
  },[mode]);
  const value=useMemo(()=>({
    mode,
    cycle:()=>setMode((current)=>current==="system"?"light":current==="light"?"dark":"system"),
  }),[mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(){
  const value=useContext(ThemeContext);
  if(!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
