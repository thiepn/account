import { Boxes, DatabaseBackup, LayoutDashboard, LockKeyhole, Shield, UserRound, type LucideIcon } from "lucide-react";
import {HUB_SHARING_ENABLED} from './features';

export interface AccountRoute { path:string; label:string; title:string; icon:LucideIcon; }

export const accountRoutes:AccountRoute[]=[
  {path:"/",label:"Overview",title:"Overview",icon:LayoutDashboard},
  {path:"/profile",label:"Profile",title:"Profile",icon:UserRound},
  {path:"/security",label:"Security",title:"Security",icon:Shield},
  {path:"/apps",label:"Apps",title:"Apps",icon:Boxes},
  ...(HUB_SHARING_ENABLED?[{path:"/hub/connections",label:"Hub sharing",title:"Hub sharing",icon:Boxes}]:[]),
  {path:"/data",label:"Data & Backup",title:"Data & Backup",icon:DatabaseBackup},
  {path:"/privacy",label:"Privacy",title:"Privacy",icon:LockKeyhole},
];

export function routeTitle(pathname:string):string {
  const match=accountRoutes
    .filter((route)=>route.path==="/" ? pathname==="/" : pathname.startsWith(route.path))
    .sort((a,b)=>b.path.length-a.path.length)[0];
  return match?.title ?? "THIEPN Account";
}
