import type { Metadata } from "next";
import Workspace from "./Workspace";
export const metadata: Metadata = { title: "Rank & Rate Photos — brooksL", description: "Compare photographs with GPT-6.1 Terra, choose your best images, and review flexible star ratings.", robots: { index: true, follow: true }, referrer: "no-referrer" };
export default function Page() { return <Workspace />; }
