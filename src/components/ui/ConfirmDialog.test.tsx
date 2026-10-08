import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("sensitive Account confirmation dialog",()=>{
  let host:HTMLDivElement;
  let root:Root;

  beforeEach(()=>{
    (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    host=document.createElement("div");
    document.body.appendChild(host);
    root=createRoot(host);
  });

  afterEach(async()=>{
    await act(async()=>{root.unmount();});
    host.remove();
    document.body.style.overflow="";
  });

  it("blocks concurrent confirmation, reports rejection, and permits a safe retry",async()=>{
    let rejectOperation:(error:Error)=>void=()=>{};
    const onConfirm=vi.fn()
      .mockImplementationOnce(()=>new Promise<void>((_resolve,reject)=>{rejectOperation=reject;}))
      .mockResolvedValue(undefined);

    await act(async()=>{
      root.render(<ConfirmDialog open title="Delete cloud data?" description="Test confirmation" confirmLabel="Delete" danger onCancel={()=>{}} onConfirm={onConfirm}/>);
    });

    const cancel=host.querySelector<HTMLButtonElement>(".modal-actions button:first-child")!;
    const submit=host.querySelector<HTMLButtonElement>(".modal-actions button:last-child")!;

    await act(async()=>{
      submit.click();
      submit.click();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(cancel.disabled).toBe(true);
    expect(submit.disabled).toBe(true);

    await act(async()=>{rejectOperation(new Error("simulated network failure"));});

    expect(host.querySelector('[role="alert"]')?.textContent).toContain("could not be confirmed");
    expect(cancel.disabled).toBe(false);
    expect(submit.disabled).toBe(false);

    await act(async()=>{submit.click();});
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("locks dismissal during a pending action and restores keyboard focus",async()=>{
    const dismiss=vi.fn();
    const opener=document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    let resolveOperation:()=>void=()=>{};
    const onConfirm=()=>new Promise<void>((resolve)=>{resolveOperation=resolve;});

    await act(async()=>{
      root.render(<ConfirmDialog open title="Revoke sessions?" description="This signs out other sessions." pending={false} onCancel={dismiss} onConfirm={onConfirm}/>);
    });
    const cancel=host.querySelector<HTMLButtonElement>(".modal-actions button:first-child")!;
    const confirm=host.querySelector<HTMLButtonElement>(".modal-actions button:last-child")!;
    expect(document.activeElement).toBe(cancel);

    await act(async()=>{confirm.click();});
    await act(async()=>{
      document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
      host.querySelector<HTMLElement>(".modal-backdrop")?.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}));
    });
    expect(dismiss).not.toHaveBeenCalled();

    await act(async()=>{resolveOperation();});
    await act(async()=>{
      root.render(<ConfirmDialog open={false} title="Revoke sessions?" description="This signs out other sessions." onCancel={dismiss} onConfirm={onConfirm}/>);
    });
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
