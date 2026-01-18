import FeedbackModal from "./FeedbackModal";

export default function WebsitePreview({ content }: { content: string }) {
  return (
    <main className="max-w-3xl mx-auto p-8 bg-white">
      <pre className="whitespace-pre-wrap text-sm">{content}</pre>
      <FeedbackModal />
    </main>
  );
}
