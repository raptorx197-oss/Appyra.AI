"use client";

export default function FeedbackModal() {
  async function submitFeedback(e: any) {
    e.preventDefault();
    const form = e.target;

    await fetch("/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        rating: form.rating.value,
        message: form.message.value,
        email: form.email.value
      })
    });

    alert("Thanks for the feedback!");
  }

  return (
    <form onSubmit={submitFeedback} className="mt-8 space-y-2">
      <select name="rating" className="border p-2 rounded w-full">
        <option>5</option><option>4</option><option>3</option><option>2</option><option>1</option>
      </select>

      <textarea
        name="message"
        placeholder="What was missing or annoying?"
        className="w-full border p-2 rounded"
      />

      <input
        name="email"
        placeholder="Email (optional)"
        className="w-full border p-2 rounded"
      />

      <button className="bg-black text-white px-4 py-2 rounded w-full">
        Send feedback
      </button>
    </form>
  );
}
