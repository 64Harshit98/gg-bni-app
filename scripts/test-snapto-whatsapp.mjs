// One-off connectivity test for the Snapto WhatsApp Business API.
// Usage (PowerShell):
//   $env:SNAPTO_API_KEY = "your-api-key"
//   node scripts/test-snapto-whatsapp.mjs <recipient-number> ["custom message"]
//   node scripts/test-snapto-whatsapp.mjs <recipient-number> --template <template-name> [lang] [var1] [var2] ...
//
// Recipient number should include country code, digits only (e.g. 919876543210).

const apiKey = process.env.SNAPTO_API_KEY;
const [, , to, ...rest] = process.argv;

if (!apiKey) {
  console.error("Missing SNAPTO_API_KEY environment variable.");
  process.exit(1);
}

if (!to) {
  console.error('Usage: node scripts/test-snapto-whatsapp.mjs <recipient-number> ["message" | --template <name> [lang] [vars...]]');
  process.exit(1);
}

const baseUrl = "https://app.snapto.ai";
const endpoint = `${baseUrl}/api/v1/whatsapp/sendMessage`;

let body;
if (rest[0] === "--template") {
  const templateName = rest[1];
  const lang = rest[2] || "en";
  let fileUrl;
  let varsStart = 3;
  if (rest[3] === "--file") {
    fileUrl = rest[4];
    varsStart = 5;
  }
  const templateVariables = rest.slice(varsStart);
  if (!templateName) {
    console.error("Missing template name after --template");
    process.exit(1);
  }
  body = {
    templateName,
    language: lang,
    to,
    ...(fileUrl ? { fileUrl } : {}),
    templateVariables,
  };
} else {
  body = {
    to,
    text: rest[0] || "Hello, this is a test message from the app integration test script.",
  };
}

try {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);

  console.log("Request body:", JSON.stringify(body, null, 2));
  console.log("Status:", res.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (!res.ok) {
    process.exitCode = 1;
  }
} catch (err) {
  console.error("Request failed:", err);
  process.exitCode = 1;
}
