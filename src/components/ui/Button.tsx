import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant="primary"|"secondary"|"ghost"|"danger";

export const Button=forwardRef<HTMLButtonElement,ButtonHTMLAttributes<HTMLButtonElement>&{variant?:Variant;children:ReactNode}>(
  function Button({variant="secondary",children,className="",...props},ref){
    return <button ref={ref} {...props} className={[`ui-button ui-button-${variant}`,className].filter(Boolean).join(" ")}>{children}</button>;
  },
);
