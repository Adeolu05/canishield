// An inline <script> that runs from the server HTML only. On the client React
// sees type="text/plain", so it neither warns nor re-runs it (Next.js guide:
// "Preventing flash before hydration").
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
