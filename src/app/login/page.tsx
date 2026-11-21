// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Sign in / create account. Signed-out visitors are sent here by src/proxy.ts.
import type { Metadata } from "next";
import { Screen } from "@/components/shared/ios";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Sign In · Taste of T" };

export default function Page() {
  return (
    <Screen title="Welcome" hideTabBar>
      <LoginForm />
    </Screen>
  );
}
