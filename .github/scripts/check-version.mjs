// Pull request check: report whether merging publishes a new date-based version.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { archivosQuePublican } from "../../scripts/version.mjs";

const { BASE_SHA, HEAD_SHA, GITHUB_STEP_SUMMARY } = process.env;
const summary = (text) => GITHUB_STEP_SUMMARY && appendFileSync(GITHUB_STEP_SUMMARY, `${text}\n`);

const changed = execFileSync("git", ["diff", "--name-only", `${BASE_SHA}...${HEAD_SHA}`], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const needsRelease = archivosQuePublican(changed);
const msg = needsRelease.length
  ? "Package changes detected: merging publishes a new UTC date-based version to npm."
  : "Only docs, tests or CI changed: merging publishes nothing.";
console.log(msg);
summary(msg);
