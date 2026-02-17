const { glob } = require("glob");
const fs = require("fs-extra");

async function scanRepo(rootPath) {
  const files = await glob("**/*.{js,ts}", {
    cwd: rootPath,
    ignore: ["node_modules/**", "dist/**", "build/**"]
  });

  const results = [];

  for (const file of files) {
    const content = await fs.readFile(`${rootPath}/${file}`, "utf8");
    results.push({
      file,
      content: content.slice(0, 8000)
    });
  }

  return results;
}

module.exports = scanRepo;
