"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function GeneratorForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: any) {
    e.preventDefault();
    setLoading(true);

    const form = e.target;

    const res = await fetch("/api/generate", {
      method: "POST",
      body: JSON.stringify({
        name: form.name.value,
        type: form.type.value,
        city: form.city.value,
        cuisine: form.cuisine.value
      })
    });

    const data = await res.json();
    router.push(`/preview?data=${encodeURIComponent(JSON.stringify(data))}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input name="name" placeholder="Business name" required className="w-full p-2 border rounded" />
      <select name="type" className="w-full p-2 border rounded">
        <option value="cafe">Café</option>
        <option value="restaurant">Restaurant</option>
      </select>
      <input name="city" placeholder="City" required className="w-full p-2 border rounded" />
      <input name="cuisine" placeholder="Cuisine (optional)" className="w-full p-2 border rounded" />

      <button className="bg-black text-white px-4 py-2 rounded w-full">
        {loading ? "Generating..." : "Generate website"}
      </button>
    </form>
  );
}
