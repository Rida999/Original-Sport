import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — SportsWear Inventory" }] }),
  component: Settings,
});

function Settings() {
  const [fullName, setFullName] = useState("");
  const [storeName, setStoreName] = useState(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem("store_name") ?? "SportsWear Shop")
      : "SportsWear Shop",
  );

  const saveProfile = async () => {
    localStorage.setItem("profile_full_name", fullName);
    toast.success("Profile saved");
  };
  const saveStore = () => {
    localStorage.setItem("store_name", storeName);
    toast.success("Store settings saved");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Your profile</h2>
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <Button onClick={saveProfile} size="sm">
          Save profile
        </Button>
      </Card>
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Store</h2>
        <div className="space-y-1.5">
          <Label>Store name</Label>
          <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
        </div>
        <Button onClick={saveStore} size="sm">
          Save store
        </Button>
      </Card>
    </div>
  );
}
