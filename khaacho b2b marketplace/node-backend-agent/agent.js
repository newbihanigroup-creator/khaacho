require("dotenv").config();
const scanRepo = require("./scan");
const fs = require("fs");

async function callLLM(prompt) {
  /*
    ZERO-COST MODE:
    - Copy the prompt printed in console
    - Paste it into a free AI chat
    - Paste the response into report.md manually
  */
  console.log("----- COPY PROMPT BELOW -----");
  console.log(prompt);
  console.log("----- END PROMPT -----");

  return "PASTE_AI_RESPONSE_HERE";
}

(async () => {
  const BACKEND_PATH = "..";
 // CHANGE THIS

  if (!fs.existsSync(BACKEND_PATH)) {
    console.error("Backend path not found");
    process.exit(1);
  }

  const instructions = fs.readFileSync("prompt.txt", "utf8");
  const files = await scanRepo(BACKEND_PATH);

  const context = files
    .map(f => `FILE: ${f.file}\n${f.content}`)
    .join("\n\n");

  const finalPrompt = `
${instructions}

CODEBASE:
${context}
`;

  const response = await callLLM(finalPrompt);
  fs.writeFileSync("report.md", response);
  console.log("DONE. See report.md");
})();
