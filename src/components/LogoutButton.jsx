"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
export default function LogoutButton({ portal = false }) {
  const router = useRouter();
  async function logout() {
    if (
      portal &&
      !window.confirm(
        "Sign out of this device? Your one-time token cannot be used again. Contact the admin if you need to recover access.",
      )
    )
      return;
    const res = await fetch(
      portal ? "/api/portal/logout" : "/api/auth/logout",
      { method: "POST" },
    );
    if (res.ok) {
      router.push(portal ? "/compute" : "/admin");
      router.refresh();
    }
  }
  return (
    <button className="button button-small button-outline" onClick={logout}>
      <LogOut size={14} />
      Sign out
    </button>
  );
}
