import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cpu, Loader2, AlertCircle } from "lucide-react";

function LocalLoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Authentication failed");
      }
    } catch {
      setError("Connection error — is the API server running?");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2 text-left">
        <Label htmlFor="username" className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
          Username
        </Label>
        <Input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="admin"
          autoComplete="username"
          className="font-mono bg-background/50"
          required
        />
      </div>
      <div className="space-y-2 text-left">
        <Label htmlFor="password" className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
          Password
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          className="font-mono bg-background/50"
          required
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-xs font-mono bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full font-mono font-bold tracking-wider"
        disabled={isPending}
        data-testid="button-login"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            AUTHENTICATING...
          </>
        ) : (
          "AUTHORIZE OPERATOR"
        )}
      </Button>
    </form>
  );
}

function ReplitLoginButton({ login }: { login: () => void }) {
  return (
    <Button
      onClick={login}
      size="lg"
      className="w-full font-mono font-bold tracking-wider"
      data-testid="button-login"
    >
      AUTHORIZE OPERATOR
    </Button>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, login } = useAuth();
  const isLocalAuth = import.meta.env.VITE_LOCAL_AUTH === "true";

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 font-mono text-sm text-muted-foreground animate-pulse">INITIALIZING SYSTEM...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

        <div className="relative z-10 w-full max-w-md p-8 border border-border bg-card/80 backdrop-blur-xl shadow-2xl rounded-lg text-center">
          <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-6 border border-primary/20">
            <Cpu className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-mono font-bold text-foreground tracking-tight mb-2">NEXUS_CTRL</h1>
          <p className="text-muted-foreground font-mono text-sm mb-8 uppercase tracking-widest">
            Restricted Access Zone
          </p>

          {isLocalAuth ? <LocalLoginForm /> : <ReplitLoginButton login={login} />}

          <div className="mt-8 pt-6 border-t border-border/50 text-xs text-muted-foreground font-mono">
            SECURE SCADA TERMINAL V1.0.4
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
