import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { prLink } from "../shared/link.ts";

const run = promisify(execFile);
const prSchema = z.object({ number: z.number().int().positive(), title: z.string(), url: z.string().url() });

export async function lookupPr(directory: string) {
  let stdout: string;
  try {
    ({ stdout } = await run("gh", ["pr", "view", "--json", "number,title,url"], {
      cwd: directory, timeout: 15000, maxBuffer: 1024 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    }));
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean };
    if (failure.code === "ENOENT") throw new Error("Install GitHub CLI (gh) on the Paseo daemon and ensure the workspace directory exists.");
    if (failure.killed) throw new Error("GitHub PR lookup timed out. Check the daemon’s connection and retry.");
    throw new Error(`Could not find this branch’s PR. Verify gh auth login on the daemon and that the current branch has a PR. ${failure.stderr?.trim() ?? failure.message}`);
  }
  return prLink(prSchema.parse(JSON.parse(stdout)));
}
