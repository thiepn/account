import type { ReactNode } from "react";
export function Panel({title,description,children}:{title:string;description?:string;children:ReactNode}){
  return <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
    <div className="mb-4"><h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>{description?<p className="mt-1 text-sm text-[var(--muted)]">{description}</p>:null}</div>
    {children}
  </section>;
}
