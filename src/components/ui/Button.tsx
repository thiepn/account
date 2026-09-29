import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant="primary"|"secondary"|"ghost"|"danger";

export function Button({variant="secondary",children,className="",...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:Variant;children:ReactNode}){
  return <button {...props} className={[`ui-button ui-button-${variant}`,className].filter(Boolean).join(" ")}>{children}</button>;
}
