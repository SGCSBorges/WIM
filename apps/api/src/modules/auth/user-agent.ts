/**
 * Device labelling, kept free of any I/O so it can be shared by the session
 * service and by tooling that runs outside the API process (the demo seeder
 * labels seeded sessions with the exact strings a real sign-in would store).
 */
/** Build a short, human-readable label from a User-Agent string. We only
 *  recognize the common families — anything else falls through to the raw
 *  UA so we never claim to know what we don't. */
export function labelFromUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browsers = [
    { name: "Edge", re: /Edg\// },
    { name: "Opera", re: /OPR\// },
    { name: "Chrome", re: /Chrome\// },
    { name: "Firefox", re: /Firefox\// },
    { name: "Safari", re: /Safari\// },
  ];
  const oss = [
    { name: "iOS", re: /iPhone|iPad/ },
    { name: "Android", re: /Android/ },
    { name: "macOS", re: /Macintosh|Mac OS/ },
    { name: "Windows", re: /Windows/ },
    { name: "Linux", re: /Linux/ },
  ];
  const browser = browsers.find((b) => b.re.test(ua))?.name;
  const os = oss.find((o) => o.re.test(ua))?.name;
  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return ua.slice(0, 80);
}
