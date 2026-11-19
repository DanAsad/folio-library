"use client";

import { useRef, useState, useTransition } from "react";
import { BookCheck, Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { checkInBarcode } from "@/lib/actions/loans";

/**
 * Fast check-in at the desk: scan (USB scanners type like a keyboard and press Enter) or
 * type a copy's barcode. Optionally record the copy's condition as it comes back.
 */
export function DeskCheckIn({ example }: { example?: string }) {
  const [barcode, setBarcode] = useState("");
  const [condition, setCondition] = useState("unchanged");
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const submit = () => {
    const code = barcode.trim();
    if (!code) return;
    start(async () => {
      const res = await checkInBarcode(code, condition === "unchanged" ? undefined : condition);
      if (res.ok) {
        toast.success(res.message);
        setBarcode("");
        setCondition("unchanged");
      } else toast.error(res.error);
      input.current?.focus();
    });
  };

  return (
    <form
      className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <ScanLine className="ml-1 size-5 text-primary" />
      <label htmlFor="desk-barcode" className="text-sm font-medium">
        Check in
      </label>
      <Input
        id="desk-barcode"
        ref={input}
        value={barcode}
        onChange={(e) => setBarcode(e.target.value.toUpperCase())}
        placeholder={`Scan or type a copy barcode${example ? `, e.g. ${example}` : ""}`}
        className="h-9 min-w-48 flex-1 font-mono"
        autoComplete="off"
      />
      <Select value={condition} onValueChange={setCondition}>
        <SelectTrigger className="h-9 w-36" aria-label="Condition on return">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unchanged">Condition as before</SelectItem>
          {["good", "fair", "poor", "damaged"].map((c) => (
            <SelectItem key={c} value={c} className="capitalize">
              Now {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" disabled={pending || !barcode.trim()}>
        {pending ? <Loader2 className="animate-spin" /> : <BookCheck />} Check in
      </Button>
    </form>
  );
}
