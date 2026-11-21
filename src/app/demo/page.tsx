// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Projector view: the live app inside an iPhone frame. Open /demo on the demo laptop.
import type { Metadata } from "next";
import DemoStage from "@/components/demo/DemoStage";

export const metadata: Metadata = { title: "Taste of T · Demo" };

export default function Page() {
  return <DemoStage />;
}
