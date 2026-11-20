"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setUserRole } from "@/lib/actions/misc";
import type { Role } from "@/lib/db/schema";
import { useI18n } from "@/i18n/client";

const ROLES: Role[] = ["admin", "librarian", "member"];

export function RoleSelect({ userId, role }: { userId: string; role: Role }) {
  const [pending, start] = useTransition();
  const { t } = useI18n();
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
      <SelectTrigger className="h-8 w-32" aria-label={t("members.role")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {t(`roles.${r}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
