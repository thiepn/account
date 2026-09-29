import { useEffect, useRef } from "react";
import { Button } from "./Button";

export function ConfirmDialog({
  open,title,description,confirmLabel="Confirm",danger=false,pending=false,onCancel,onConfirm,
}:{
  open:boolean;title:string;description:string;confirmLabel?:string;danger?:boolean;pending?:boolean;
  onCancel:()=>void;onConfirm:()=>void|Promise<void>;
}){
  const panelRef=useRef<HTMLDivElement>(null);
  const cancelRef=useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    cancelRef.current?.focus();

    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"&&!pending){event.preventDefault();onCancel();return;}
      if(event.key!=="Tab")return;
      const nodes=panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if(!nodes?.length)return;
      const first=nodes[0],last=nodes[nodes.length-1];
      if(!first||!last)return;
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",onKeyDown);
    return()=>{document.removeEventListener("keydown",onKeyDown);document.body.style.overflow=oldOverflow;previous?.focus();};
  },[open,pending,onCancel]);

  if(!open)return null;
  return <div className="modal-layer">
    <div className="modal-backdrop" onMouseDown={()=>{if(!pending)onCancel();}} aria-hidden="true"/>
    <div ref={panelRef} className="modal-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-description">{description}</p>
      <div className="modal-actions">
        <Button ref={cancelRef} disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button variant={danger?"danger":"primary"} disabled={pending} onClick={()=>void onConfirm()}>{pending?"Working…":confirmLabel}</Button>
      </div>
    </div>
  </div>;
}
