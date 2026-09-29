import { Boxes, DatabaseBackup, LayoutDashboard, LockKeyhole, MonitorSmartphone, Shield, UserRound, type LucideIcon } from "lucide-react";

export interface AccountRoute { path:string; label:string; title:string; icon:LucideIcon; }

export const accountRoutes:AccountRoute[]=[
  {path:"/",label:"Overview",title:"Overview",icon:LayoutDashboard},
  {path:"/profile",label:"Profile",title:"Profile",icon:UserRound},
  {path:"/security",label:"Security",title:"Security",icon:Shield},
  {path:"/devices",label:"Devices",title:"Devices",icon:MonitorSmartphone},
  {path:"/apps",label:"Apps",title:"Apps",icon:Boxes},
  {path:"/data",label:"Data & Backup",title:"Data & Backup",icon:DatabaseBackup},
  {path:"/privacy",label:"Privacy",title:"Privacy",icon:LockKeyhole},
];

export function routeTitle(pathname:string):string {
  const match=accountRoutes
    .filter((route)=>route.path==="/" ? pathname==="/" : pathname.startsWith(route.path))
    .sort((a,b)=>b.path.length-a.path.length)[0];
  return match?.title ?? "THIEPN Account";
}
