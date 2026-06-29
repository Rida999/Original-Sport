import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — SportsWear Inventory" }] }),
  component: Suppliers,
});

type Supplier = { id: string; company_name: string; contact_person: string | null; phone: string | null; email: string | null; address: string | null; notes: string | null };

function Suppliers() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [form, setForm] = useState({ company_name: "", contact_person: "", phone: "", email: "", address: "", notes: "" });

  const { data } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => ((await supabase.from("suppliers").select("*").order("company_name")).data ?? []) as Supplier[],
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null])) as Record<string, string | null>;
      payload.company_name = form.company_name.trim();
      if (editing) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert(payload as { company_name: string });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Supplier updated" : "Supplier added"); setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["suppliers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("suppliers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Supplier deleted"); setDelId(null); qc.invalidateQueries({ queryKey: ["suppliers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ company_name: "", contact_person: "", phone: "", email: "", address: "", notes: "" }); setOpen(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setForm({ company_name: s.company_name, contact_person: s.contact_person ?? "", phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "", notes: s.notes ?? "" }); setOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} total</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openNew}><Plus className="size-4 mr-1.5" /> Add supplier</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? "Edit supplier" : "New supplier"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {(["company_name", "contact_person", "phone", "email", "address"] as const).map((k) => (
                <div key={k} className="space-y-1.5">
                  <Label className="capitalize">{k.replace("_", " ")}</Label>
                  <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
              <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={!form.company_name.trim()}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="text-left">
              <th className="p-3 font-medium">Company</th>
              <th className="p-3 font-medium">Contact</th>
              <th className="p-3 font-medium">Phone</th>
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data ?? []).map((s) => (
              <tr key={s.id} className="hover:bg-muted/30">
                <td className="p-3 font-medium">{s.company_name}</td>
                <td className="p-3 text-muted-foreground">{s.contact_person ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{s.phone ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{s.email ?? "—"}</td>
                <td className="p-3">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDelId(s.id)}><Trash2 className="size-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {(data?.length ?? 0) === 0 && <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">No suppliers. Only admins can manage suppliers.</td></tr>}
          </tbody>
        </table>
      </Card>

      <AlertDialog open={!!delId} onOpenChange={(v) => !v && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete supplier?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => delId && del.mutate(delId)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
