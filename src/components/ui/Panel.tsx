import type { ReactNode } from "react";

export function Panel({title,description,children,className=""}:{title:string;description?:string;children:ReactNode;className?:string}){
  return <section className={["ui-panel",className].filter(Boolean).join(" ")}>
    <div className="ui-panel-header">
      <h2 className="ui-panel-title">{title}</h2>
      {description?<p className="ui-panel-description">{description}</p>:null}
    </div>
    <div className="ui-panel-body">{children}</div>
  </section>;
}
