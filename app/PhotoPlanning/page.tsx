import Link from "next/link";
import GoldenHourCalculator from "./GoldenHourCalculator";

export const metadata = {
  title: "Photo Planning | brooksl.com",
  description: "Golden hour and blue hour calculator for photographers",
};

export default function PhotoPlanningPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm mb-8 inline-block transition-colors">
          ← brooksl.com
        </Link>
        <h1 className="text-3xl font-bold mb-1">Photo Planning</h1>
        <p className="text-gray-400 mb-8">Golden hour &amp; blue hour calculator</p>
        <GoldenHourCalculator />
      </div>
    </main>
  );
}
