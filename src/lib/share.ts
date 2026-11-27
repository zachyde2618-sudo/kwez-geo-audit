export interface ShareDetails {
  name: string;
  score: number | null;
  band: string | null;
}

/** The email that goes with the PDF. Plain text, so it works in any mail app. */
export function shareMessage({ name, score, band }: ShareDetails): { subject: string; body: string } {
  const scored = score === null ? "" : ` It scores ${score} out of 100${band ? ` (${band})` : ""} for`;
  return {
    subject: `Your AI visibility audit from Kwez: ${name}`,
    body:
      `Hi,\n\nPlease find attached the GEO audit for ${name}.` +
      (scored ? `${scored} how easily AI assistants such as ChatGPT, Claude, Gemini and Perplexity can find and recommend the business.` : "") +
      ` It also lists the fixes that would make the biggest difference, most valuable first.\n\nHappy to talk it through whenever suits you.\n\n`,
  };
}

