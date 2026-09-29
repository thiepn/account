import { LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAccountService } from "../../account/context";
import { accountRoutes, routeTitle } from "../../app/routes";
import { useTheme } from "../../app/theme";

function Navigation({onNavigate}:{onNavigate?:()=>void}){
  return <nav aria-label="Account"><ul className="space-y-1">{accountRoutes.map((route)=>{
    const Icon=route.icon;
    return <li key={route.path}><NavLink to={route.path} end={route.path==="/"} onClick={onNavigate}
      className={({isActive})=>["flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",isActive?"bg-[var(--accent-soft)] text-[var(--foreground)]":"text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"].join(" ")}>
      <Icon size={18} aria-hidden="true"/><span>{route.label}</span></NavLink></li>;
  })}</ul></nav>;
}

export function AccountShell(){
  const [drawerOpen,setDrawerOpen]=useState(false);
  const location=useLocation(); const navigate=useNavigate(); const service=useAccountService(); const queryClient=useQueryClient(); const theme=useTheme();
  useEffect(()=>{
    const title=routeTitle(location.pathname);
    document.title=title==="Overview"?"THIEPN Account":`${title} — THIEPN Account`;
    setDrawerOpen(false); window.scrollTo({top:0,behavior:"instant"});
  },[location.pathname]);
  async function signOut(){await service.auth.signOut();queryClient.clear();navigate("/auth/sign-in",{replace:true});}
  return <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--surface)] focus:px-4 focus:py-2">Skip to content</a>
    <header className="sticky top-0 z-30 flex h-14 items-center border-b border-[var(--border)] bg-[var(--background)]/95 px-3 backdrop-blur md:hidden">
      <button className="icon-button" onClick={()=>setDrawerOpen(true)} aria-label="Open navigation"><Menu size={20}/></button>
      <div className="ml-3 min-w-0 flex-1 truncate font-semibold">THIEPN Account</div>
      <button className="avatar-button" aria-label="Account menu">J</button>
    </header>
    <div className="mx-auto flex min-h-dvh max-w-[1240px]">
      <aside className="hidden w-[232px] shrink-0 border-r border-[var(--border)] px-4 py-6 md:block">
        <div className="mb-8 px-2 text-lg font-semibold">THIEPN Account</div><Navigation/>
        <div className="mt-8 border-t border-[var(--border)] pt-4">
          <button className="nav-secondary" onClick={theme.cycle}>{theme.mode==="dark"?<Moon size={18}/>:<Sun size={18}/>}Theme: {theme.mode}</button>
          <button className="nav-secondary" onClick={signOut}><LogOut size={18}/>Sign out</button>
        </div>
      </aside>
      <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8"><div className="mx-auto max-w-[1000px]"><Outlet/></div></main>
    </div>
    {drawerOpen?<div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Account navigation">
      <button className="absolute inset-0 bg-black/45" onClick={()=>setDrawerOpen(false)} aria-label="Close navigation"/>
      <div className="relative h-dvh w-[min(320px,85vw)] bg-[var(--surface)] p-4 shadow-2xl">
        <div className="mb-5 flex h-11 items-center justify-between"><strong>THIEPN Account</strong><button className="icon-button" onClick={()=>setDrawerOpen(false)} aria-label="Close navigation"><X size={20}/></button></div>
        <Navigation onNavigate={()=>setDrawerOpen(false)}/>
        <div className="mt-8 border-t border-[var(--border)] pt-4">
          <button className="nav-secondary" onClick={theme.cycle}><Sun size={18}/>Theme: {theme.mode}</button>
          <button className="nav-secondary" onClick={signOut}><LogOut size={18}/>Sign out</button>
        </div>
      </div>
    </div>:null}
  </div>;
}
