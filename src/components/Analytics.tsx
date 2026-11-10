import { useEffect } from "react";
import { trpc } from "@/providers/trpc";

export function Analytics() {
  const { data } = trpc.public.bootstrap.useQuery();
  useEffect(() => {
    const enabled = data?.settings.ga4_enabled === true;
    const id = typeof data?.settings.ga4_measurement_id === "string" ? data.settings.ga4_measurement_id : "";
    if (!enabled || !/^G-[A-Z0-9]+$/.test(id) || document.getElementById("ga4-script")) return;
    const script = document.createElement("script"); script.id = "ga4-script"; script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer || [];
    function gtag(...args: unknown[]) { window.dataLayer.push(args); }
    gtag("js", new Date()); gtag("config", id, { anonymize_ip: true });
  }, [data]);
  return null;
}

declare global {
  interface Window { dataLayer: unknown[]; }
}
