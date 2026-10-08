import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./Button";

/** Shared confirmation surface for sensitive Account operations.
 * Catch rejected actions here as a last-resort boundary; callers may also
 * report domain-specific failures in their owning page. */
export function ConfirmDialog({
  open,title,description,confirmLabel="Confirm",danger=false,pending=false,onCancel,onConfirm,
}:{
  open:boolean;title:string;description:string;confirmLabel?:string;danger?:boolean;pending?:boolean;
  onCancel:()=>void;onConfirm:()=>void|Promise<void>;
}){
  const titleId=useId();
  const descriptionId=useId();
  const panelRef=useRef<HTMLDivElement>(null);
  const cancelRef=useRef<HTMLButtonElement>(null);
  const cancelActionRef=useRef(onCancel);
  const confirmLock=useRef(false);
  const [confirming,setConfirming]=useState(false);
  const [failed,setFailed]=useState(false);
  const blocked=pending||confirming;
  const blockedRef=useRef(blocked);
  cancelActionRef.current=onCancel;
  blockedRef.current=blocked;

  useEffect(()=>{
    if(!open)return;
    setFailed(false);
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    cancelRef.current?.focus();

    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){
        if(!blockedRef.current){
          event.preventDefault();
          cancelActionRef.current();
        }else{
          event.preventDefault();
        }
        return;
      }
      if(event.key!=="Tab")return;
      const nodes=panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if(!nodes?.length){
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first=nodes[0],last=nodes[nodes.length-1];
      if(!first||!last)return;
      if(event.shiftKey&&document.activeElement===first){
        event.preventDefault();
        last.focus();
      }else if(!event.shiftKey&&document.activeElement===last){
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown",onKeyDown);
    return()=>{
      document.removeEventListener("keydown",onKeyDown);
      document.body.style.overflow=oldOverflow;
      previous?.focus();
    };
  },[open]);

  async function confirm(){
    if(confirmLock.current||blocked)return;
    confirmLock.current=true;
    setConfirming(true);
    setFailed(false);
    try{
      await onConfirm();
    }catch{
      setFailed(true);
    }finally{
      confirmLock.current=false;
      setConfirming(false);
    }
  }

  if(!open)return null;
  return <div className="modal-layer">
    <div className="modal-backdrop" onMouseDown={()=>{if(!blockedRef.current)cancelActionRef.current();}} aria-hidden="true"/>
    <div ref={panelRef} tabIndex={-1} className="modal-panel" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      {failed?<p role="alert" className="text-sm text-red-600 dark:text-red-400">The action could not be confirmed. Check its current status before retrying.</p>:null}
      <div className="modal-actions">
        <Button ref={cancelRef} disabled={blocked} onClick={onCancel}>Cancel</Button>
        <Button variant={danger?"danger":"primary"} disabled={blocked} onClick={()=>void confirm()}>{blocked?"Working…":confirmLabel}</Button>
      </div>
    </div>
  </div>;
}
