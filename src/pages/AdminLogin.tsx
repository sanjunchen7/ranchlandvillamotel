import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { saveStaffToken } from "@/lib/staff-session";

export default function AdminLogin() {
  const auth = trpc.auth.me.useQuery();
  const navigate = useNavigate(); const location = useLocation();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const login = trpc.auth.login.useMutation({
    onSuccess: async (staff) => {
      const stored = saveStaffToken(staff.sessionToken);
      try {
        const refreshed = await auth.refetch();
        if (refreshed.data) navigate((location.state as { from?: string } | null)?.from || "/admin");
        else setError(stored ? "Your account was accepted, but the session could not be verified. Please try again in a new tab." : "Your browser blocked both cookies and site storage. Please open the website in a new tab or allow site data, then try again.");
      } catch {
        setError("Signed in, but the session could not be verified. Please try again in a new tab.");
      }
    },
    onError: (e) => setError(e.message),
  });
  useEffect(() => { if (auth.data) navigate("/admin"); }, [auth.data, navigate]);
  const submit = (e: React.FormEvent) => { e.preventDefault(); setError(""); login.mutate({ email: email.trim(), password }); };
  return <div className="flex min-h-dvh items-center justify-center bg-slate-900 p-5"><div className="w-full max-w-md bg-white p-7 shadow-xl md:p-9"><img src="/icons/icon.svg" alt="" className="h-14 w-14" /><h1 className="mt-6 font-serif text-3xl font-bold text-slate-900">Staff sign in</h1><p className="mt-2 text-sm text-slate-600">Ranchland Villa Motel reservation management</p><form onSubmit={submit} className="mt-7 flex flex-col gap-5"><label><span className="mb-1.5 block text-sm font-semibold">Staff email</span><input className="admin-field" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label><span className="mb-1.5 block text-sm font-semibold">Password</span><div className="relative"><input className="admin-field pr-12" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /><button type="button" className="absolute right-1 top-1 inline-flex min-h-9 min-w-9 items-center justify-center text-slate-500" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{error && <p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{error}</p>}<button className="admin-btn bg-slate-900 text-white hover:bg-slate-700" disabled={login.isPending}>{login.isPending ? <LoaderCircle className="animate-spin" size={18} /> : <LockKeyhole size={18} />}Sign in securely</button></form><p className="mt-6 text-xs leading-5 text-slate-500">Authorized staff only. Sessions expire automatically. Never enter a guest’s full card number or CVV into this system.</p></div></div>;
}
