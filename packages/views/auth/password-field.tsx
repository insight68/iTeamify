"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@iteamify/ui/components/ui/input";
import { Button } from "@iteamify/ui/components/ui/button";
import { useT } from "../i18n";
import { cn } from "@iteamify/ui/lib/utils";

export function PasswordField(props: Omit<ComponentProps<typeof Input>, "type">) {
  const { t } = useT("auth");
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-12", props.className)} />
      <Button
        type="button" size="icon" variant="ghost" disabled={props.disabled}
        className="absolute right-1 top-1/2 size-9 -translate-y-1/2"
        aria-label={visible ? t(($) => $.password.hide) : t(($) => $.password.show)}
        aria-pressed={visible} onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  );
}
