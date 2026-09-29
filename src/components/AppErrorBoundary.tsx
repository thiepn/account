import { Component, type ErrorInfo, type ReactNode } from "react";

export class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:Error,info:ErrorInfo){
    if(import.meta.env.DEV) console.error("Account render failure",error,info);
  }
  render(){
    if(this.state.failed)return <main className="grid min-h-dvh place-items-center bg-[var(--background)] px-4 text-[var(--foreground)]"><div className="max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"><h1 className="text-xl font-semibold">THIEPN Account couldn’t start.</h1><p className="mt-2 text-sm text-[var(--muted)]">Reload the page to try again.</p><button className="primary-button mt-5" onClick={()=>window.location.reload()}>Reload</button></div></main>;
    return this.props.children;
  }
}
