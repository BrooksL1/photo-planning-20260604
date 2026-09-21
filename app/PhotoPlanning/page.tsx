import Link from "next/link";
import GoldenHourCalculator from "./GoldenHourCalculator";

export const metadata = {
  title: "Photo Planning | brooksl.com",
  description: "Golden hour and blue hour calculator for photographers",
};

export default function PhotoPlanningPage() {
  return (
    <main className="min-h-screen bg-white text-gray-900 px-4 sm:px-8 py-6">
      <div className="max-w-[1040px] mx-auto">
        <Link
          href="/"
          className="text-gray-400 hover:text-gray-600 text-xs mb-3 inline-block transition-colors"
        >
          ← brooksl.com
        </Link>
        <GoldenHourCalculator />
      </div>
    </main>
  );
}
