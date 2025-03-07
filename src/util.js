import { execSync } from "child_process";
import readline from "readline/promises";

export const run = (command) => {
  return execSync(command, { stdio: "inherit" })?.toString();
};

export const confirm = async (question) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question + " (y/n) ")).toLowerCase();
  rl.close();
  return answer === "y";
};
