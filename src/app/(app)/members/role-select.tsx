"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setUserRole } from "@/lib/actions/misc";
import type { Role } from "@/lib/db/schema";
import { ROLE_LABEL } from "@/lib/permissions";

export function RoleSelect({ userId, role }: { userId: string; role: Role }) {
  const [pending, start] = useTransition();
  return (
    <Select
      defaultValue={role}
      disabled={pending}
      onValueChange={(next) =>
        start(async () => {
          const res = await setUserRole(userId, next);
          if (res.ok) toast.success(res.message);
          else toast.error(res.error);
        })
      }
    >
      <SelectTrigger className="h-8 w-32" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
