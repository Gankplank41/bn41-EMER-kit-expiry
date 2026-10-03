import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await signIn(email, password);
    setLoading(false);
    if (signInError) setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-kit-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-kit-border bg-white p-8 shadow-sm">
        <h1 className="font-display text-xl font-semibold text-kit-crimson-dark">
          BN41 แจ้งเตือนยากล่องฉุกเฉิน
        </h1>
        <p className="mt-1 text-sm text-kit-muted">เข้าสู่ระบบเพื่อจัดการเช็คลิสต์และวันหมดอายุ</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-kit-ink" htmlFor="email">
              อีเมล
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-kit-border px-3 py-2 text-sm focus:border-kit-crimson focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-kit-ink" htmlFor="password">
              รหัสผ่าน
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-kit-border px-3 py-2 text-sm focus:border-kit-crimson focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-status-critical">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-kit-crimson px-4 py-2 text-sm font-semibold text-white transition hover:bg-kit-crimson-dark disabled:opacity-60"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}
