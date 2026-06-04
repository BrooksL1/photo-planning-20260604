import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white">
      <h1 className="text-4xl font-bold tracking-tight mb-2">brooksl.com</h1>
      <p className="text-gray-400 mb-10 text-lg">Photography tools</p>
      <Link
        href="/PhotoPlanning"
        className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-lg rounded-xl transition-colors shadow-lg"
      >
        Photo Planning
      </Link>
    </main>
  );
}
