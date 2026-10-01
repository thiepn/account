import type { ReactNode } from "react";

export function Panel({title,description,children,className=""}:{title?:string;description?:string;children:ReactNode;className?:string}){
  const hasHeader=Boolean(title||description);
  return <section className={["ui-panel",className].filter(Boolean).join(" ")}>
    {hasHeader?<div className="ui-panel-header">
      {title?<h2 className="ui-panel-title">{title}</h2>:null}
      {description?<p className="ui-panel-description">{description}</p>:null}
    </div>:null}
    <div className="ui-panel-body">{children}</div>
  </section>;
}
