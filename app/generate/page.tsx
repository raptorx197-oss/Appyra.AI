import GeneratorForm from "@/components/GeneratorForm";

export default function GeneratePage() {
  return (
    <main className="max-w-xl mx-auto px-6 py-20">
      <h1 className="text-3xl font-bold mb-2">Generate your website</h1>
      <p className="text-gray-600 mb-8">
        Tell us about your café or restaurant.
      </p>
      <GeneratorForm />
    </main>
  );
}
