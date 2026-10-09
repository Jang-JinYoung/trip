"use client";

import { useEffect, useState } from "react";
import { Compass, LoaderCircle, LockKeyhole } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { loginEmail } from "@/lib/login";
import {
  createWorkspaceAccess,
  type WorkspaceAccess,
} from "@/lib/workspace-access";
import Workspace from "./workspace";

export default function WorkspaceGate() {
  const [access, setAccess] = useState<WorkspaceAccess>({ status: "checking" });
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setAccess({ status: "signed-out" });
      return;
    }
    const controller = createWorkspaceAccess(async (id) => {
      // Leave the auth event callback before calling another auth method.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const auth = await client.auth.getUser();
      if (auth.error || !auth.data.user || auth.data.user.id !== id)
        throw Error("Invalid session");
      const result = await client
        .from("travel_workspaces")
        .select("places")
        .eq("user_id", id)
        .maybeSingle();
      if (result.error) throw result.error;
      const places = result.data?.places ?? [];
      if (
        !Array.isArray(places) ||
        !places.every(
          (p) =>
            p &&
            typeof p.id === "string" &&
            typeof p.name === "string" &&
            typeof p.region === "string",
        )
      )
        throw Error("Invalid workspace data");
      return { user: auth.data.user, places };
    }, setAccess);
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      void controller.change(session?.user.id ?? null);
    });
    return () => {
      controller.dispose();
      data.subscription.unsubscribe();
    };
  }, []);

  async function authenticate(signUp: boolean) {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      const email = loginEmail(identifier);
      if (signUp && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim()))
        throw Error("새 계정은 이메일 주소로 가입해 주세요.");
      if (signUp && password.length < 8)
        throw Error("가입 비밀번호는 8자 이상 입력해 주세요.");
      const result = signUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setPassword("");
      if (signUp) setMessage("가입 확인 메일을 확인한 뒤 로그인해 주세요.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "로그인에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (access.status === "ready")
    return (
      <Workspace
        key={access.user.id}
        user={access.user}
        initialPlaces={access.places}
        onLogout={async () => {
          const result = await supabase!.auth.signOut({ scope: "local" });
          if (result.error) throw result.error;
          setAccess({ status: "signed-out" });
        }}
      />
    );

  const loading = access.status === "checking" || access.status === "loading";
  return (
    <main className="login-screen">
      <section className="auth-modal login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <Compass size={27} /> trip<span>atlas</span>
        </div>
        <span className="stat-icon blue">
          <LockKeyhole size={23} />
        </span>
        <h1 id="login-title">나만의 여행 공간</h1>
        <p>로그인하면 저장한 장소와 여행 지도를 볼 수 있어요.</p>
        {loading ? (
          <p className="login-loading" role="status">
            <LoaderCircle className="spin" size={18} />
            {access.status === "loading"
              ? "내 장소를 불러오는 중…"
              : "로그인 확인 중…"}
          </p>
        ) : !supabase ? (
          <p role="alert">
            로그인 서비스 연결이 필요합니다. 관리자에게 문의해 주세요.
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void authenticate(false);
            }}
          >
            <label>
              이메일 또는 아이디
              <input
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="이메일 또는 admin"
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button
              className="button primary full"
              type="submit"
              disabled={busy}
            >
              {busy ? "로그인 중…" : "로그인"}
            </button>
            <button
              className="button full"
              type="button"
              disabled={busy}
              onClick={() => void authenticate(true)}
            >
              새 계정 만들기
            </button>
          </form>
        )}
        {(message || access.status === "error") && (
          <p className="login-message" role="alert">
            {message || (access.status === "error" ? access.message : "")}
          </p>
        )}
      </section>
    </main>
  );
}
