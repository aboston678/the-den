import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { usernameProblem } from "@den/shared";
import { create } from "zustand";
import { useTvSource } from "../game/house/furniture/Tvs.tsx";

// Signing in (GAME_SPEC §14): Google through Supabase, then a username on first sign-in (your
// name tag). The session is remembered by the browser, so you stay signed in between visits.
// Signed-in players also get a private, short-lived link to the TV clips (GAME_SPEC §8.4).

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** The Supabase connection, or null if this build has no keys (then only development play works). */
export const supabase: SupabaseClient | null = URL && KEY ? createClient(URL, KEY) : null;

type Status = "loading" | "signed-out" | "needs-username" | "ready";

export const useAuth = create<{ status: Status; userId: string | null; username: string | null; error: string | null }>(() => ({
  status: supabase ? "loading" : "signed-out",
  userId: null,
  username: null,
  error: null,
}));

/** Ask Google to sign us in (the page goes to Google and comes back here). */
export async function signInWithGoogle() {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  if (error) useAuth.setState({ error: "Couldn't reach Google sign-in. Try again." });
}

export async function signOut() {
  await supabase?.auth.signOut();
  useAuth.setState({ status: "signed-out", userId: null, username: null, error: null });
  useTvSource.setState({ url: import.meta.env.DEV ? "/video/tv.mp4" : null });
}

/** The current access token, sent to the game server when joining a party. */
export async function accessToken() {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ?? null;
}

/** First sign-in: claim a username. Returns an error to show, or null when it worked. */
export async function chooseUsername(raw: string): Promise<string | null> {
  const name = raw.trim();
  const problem = usernameProblem(name);
  if (problem) return problem;
  const { userId } = useAuth.getState();
  if (!supabase || !userId) return "Sign in first.";
  const { error } = await supabase.from("profiles").insert({ id: userId, username: name });
  if (error) return error.code === "23505" ? "That name's taken. Try another." : "Couldn't save that. Try again.";
  useAuth.setState({ status: "ready", username: name });
  void loadTvLink();
  return null;
}

/** A private link to the TV clips, good for 6 hours (renewed before it runs out). */
async function loadTvLink() {
  if (!supabase) return;
  const { data } = await supabase.storage.from("private-media").createSignedUrl("tv.mp4", 6 * 3600);
  if (data?.signedUrl) useTvSource.setState({ url: data.signedUrl });
  setTimeout(() => void loadTvLink(), 5 * 3600 * 1000);
}

async function loadProfile(userId: string) {
  if (!supabase) return;
  const { data, error } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
  if (error) {
    useAuth.setState({ status: "signed-out", error: "Couldn't load your profile. Try signing in again." });
    return;
  }
  const username = (data as { username?: string } | null)?.username ?? null;
  useAuth.setState({ status: username ? "ready" : "needs-username", userId, username, error: null });
  if (username) void loadTvLink();
}

/** Start listening for sign-ins (call once when the app starts). */
export function initAuth() {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    const id = session?.user.id ?? null;
    if (!id) useAuth.setState({ status: "signed-out", userId: null, username: null });
    else if (id !== useAuth.getState().userId || useAuth.getState().status === "loading") {
      useAuth.setState({ userId: id });
      // Not awaited inside the callback (Supabase warns against that).
      setTimeout(() => void loadProfile(id), 0);
    }
  });
}
