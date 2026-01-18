import Link from "next/link";

export default function Home() {
  return (
    <main>
      <section className="max-w-6xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-5xl font-bold leading-tight mb-6">
            Create a beautiful website<br />
            for your café or restaurant<br />
            <span className="text-gray-500">in minutes.</span>
          </h1>

          <p className="text-lg text-gray-600 mb-8">
            Appyra instantly generates a clean, modern website for cafés and restaurants.
            No design skills. No setup.
          </p>

          <Link
            href="/generate"
            className="inline-block bg-black text-white px-6 py-3 rounded-lg text-lg hover:bg-gray-800 transition"
          >
            Generate my website →
          </Link>

          <p className="text-sm text-gray-400 mt-4">
            Free prototype · No signup required
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg border p-6">
          <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            <div className="h-6 bg-gray-100 rounded" />
            <div className="h-4 bg-gray-100 rounded w-5/6" />
            <div className="h-4 bg-gray-100 rounded w-4/6" />
            <div className="h-32 bg-gray-100 rounded mt-4" />
          </div>
        </div>
      </section>
    </main>
  );
}
