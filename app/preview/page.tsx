import WebsitePreview from "@/components/WebsitePreview";

export default function Preview({ searchParams }: any) {
  const data = JSON.parse(decodeURIComponent(searchParams.data));
  return <WebsitePreview content={data.content} />;
}
