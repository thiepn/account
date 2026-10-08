import { LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAccountService } from "../../account/context";
import { useOverview, usePrivacySummary } from "../../account/hooks";
import { accountRoutes, routeTitle } from "../../app/routes";
import { useTheme } from "../../app/theme";

function Brand({compact=false}:{compact?:boolean}){
  return <div className={compact?"mobile-brand":"account-brand"}>
    <div className="account-brand-copy"><strong>THIEPN</strong><span>Account</span></div>
  </div>;
}

function Navigation({onNavigate}:{onNavigate?:()=>void}){
  return <nav aria-label="Account" className="account-nav-wrap"><ul className="account-nav-list">{accountRoutes.map((route)=>{
    const Icon=route.icon;
    return <li key={route.path}><NavLink to={route.path} end={route.path==="/"} onClick={onNavigate}
      className={({isActive})=>["account-nav-link",isActive?"account-nav-link-active":""].filter(Boolean).join(" ")}>
      <span className="account-nav-icon"><Icon size={17} strokeWidth={1.8} aria-hidden="true"/></span><span>{route.label}</span></NavLink></li>;
  })}</ul></nav>;
}

export function AccountShell(){
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [signOutBusy,setSignOutBusy]=useState(false);
  const [signOutError,setSignOutError]=useState(false);
  const signOutLock=useRef(false);
  const menuRef=useRef<HTMLButtonElement>(null);
  const drawerRef=useRef<HTMLDivElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const location=useLocation();
  const navigate=useNavigate();
  const service=useAccountService();
  const queryClient=useQueryClient();
  const theme=useTheme();
  const privacy=usePrivacySummary();
  const overview=useOverview();
  const profileName=overview.data?.identity.displayName??"THIEPN Account";
  const profileEmail=overview.data?.identity.primaryEmail??"";
  const profileInitial=profileName.trim().charAt(0).toUpperCase()||"T";

  useEffect(()=>{
    const title=routeTitle(location.pathname);
    document.title=title==="Overview"?"THIEPN Account":`${title} — THIEPN Account`;
    setDrawerOpen(false);
    window.scrollTo({top:0,behavior:"auto"});
  },[location.pathname]);

  useEffect(()=>{
    if(!drawerOpen)return;
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    closeRef.current?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setDrawerOpen(false);return;}
      if(event.key!=="Tab")return;
      const nodes=drawerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])');
      if(!nodes?.length)return;
      const first=nodes[0],last=nodes[nodes.length-1];
      if(!first||!last)return;
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",keydown);
    return()=>{document.removeEventListener("keydown",keydown);document.body.style.overflow=oldOverflow;menuRef.current?.focus();};
  },[drawerOpen]);

  async function signOut(){
    if(signOutLock.current)return;
    signOutLock.current=true;
    setSignOutBusy(true);
    setSignOutError(false);
    try{
      await service.auth.signOut();
      queryClient.clear();
      navigate("/auth/sign-in",{replace:true});
    }catch{
      setSignOutError(true);
    }finally{
      signOutLock.current=false;
      setSignOutBusy(false);
    }
  }

  return <div className="account-app">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--surface)] focus:px-4 focus:py-2">Skip to content</a>

    <header className="mobile-header">
      <button ref={menuRef} className="icon-button" onClick={()=>setDrawerOpen(true)} aria-label="Open navigation" aria-expanded={drawerOpen}><Menu size={19}/></button>
      <Brand compact/>
      <button className="avatar-button" aria-label="Account menu" aria-expanded={drawerOpen} onClick={()=>setDrawerOpen(true)}>{profileInitial}</button>
    </header>

    {privacy.data?.accountStatus==="deletion-pending"?<div className="deletion-banner"><div className="deletion-banner-inner"><span>Account deletion is scheduled. Account-changing actions are restricted until you cancel it or deletion completes.</span><Link className="font-semibold underline underline-offset-2" to="/account/deletion/status">View deletion status</Link></div></div>:null}

    <div className="account-layout">
      <aside className="account-sidebar">
        <Brand/>
        <Navigation/>
        <div className="sidebar-bottom">
          <a className="nav-secondary" href="https://thiepn.dev/home/" referrerPolicy="no-referrer">Return to Hub</a>
          <div className="sidebar-profile">
            <div className="sidebar-avatar" aria-hidden="true">{profileInitial}</div>
            <div className="sidebar-profile-copy"><strong>{profileName}</strong><span>{profileEmail||"Personal account"}</span></div>
          </div>
          <div className="sidebar-actions">
            <button className="nav-secondary" onClick={theme.cycle} aria-label={`Theme: ${theme.mode}`}>{theme.mode==="dark"?<Moon size={16}/>:<Sun size={16}/>}<span>Theme</span></button>
            <button className="nav-secondary" disabled={signOutBusy} onClick={()=>void signOut()}><LogOut size={16}/><span>{signOutBusy?"Signing out…":"Sign out"}</span></button>
          </div>
          {signOutError?<p role="alert" className="text-xs text-red-600 dark:text-red-400">Sign out failed. Check your connection and try again.</p>:null}
        </div>
      </aside>

      <main id="main-content" className="account-main"><div className="account-content"><Outlet/></div></main>
    </div>

    {drawerOpen?<div className="fixed inset-0 z-40 md:hidden">
      <div className="drawer-backdrop" onMouseDown={()=>setDrawerOpen(false)} aria-hidden="true"/>
      <div ref={drawerRef} className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Account navigation">
        <div className="drawer-brand"><Brand compact/><button ref={closeRef} className="icon-button" onClick={()=>setDrawerOpen(false)} aria-label="Close navigation"><X size={19}/></button></div>
        <Navigation onNavigate={()=>setDrawerOpen(false)}/>
        <div className="sidebar-bottom">
          <a className="nav-secondary" href="https://thiepn.dev/home/" referrerPolicy="no-referrer">Return to Hub</a>
          <div className="sidebar-profile">
            <div className="sidebar-avatar" aria-hidden="true">{profileInitial}</div>
            <div className="sidebar-profile-copy"><strong>{profileName}</strong><span>{profileEmail||"Personal account"}</span></div>
          </div>
          <div className="sidebar-actions">
            <button className="nav-secondary" onClick={theme.cycle} aria-label={`Theme: ${theme.mode}`}>{theme.mode==="dark"?<Moon size={16}/>:<Sun size={16}/>}<span>Theme</span></button>
            <button className="nav-secondary" disabled={signOutBusy} onClick={()=>void signOut()}><LogOut size={16}/><span>{signOutBusy?"Signing out…":"Sign out"}</span></button>
          </div>
          {signOutError?<p role="alert" className="text-xs text-red-600 dark:text-red-400">Sign out failed. Check your connection and try again.</p>:null}
        </div>
      </div>
    </div>:null}
  </div>;
}
