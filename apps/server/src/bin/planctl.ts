const [, , command, sessionId] = process.argv;

if (command !== "notify" || !sessionId) {
  console.error("Usage: planctl notify <sessionId>");
  process.exit(1);
}

const response = await fetch(`http://localhost:8787/api/sessions/${sessionId}/notify`, {
  method: "POST",
});

if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}

console.log(JSON.stringify(await response.json(), null, 2));

export {};
