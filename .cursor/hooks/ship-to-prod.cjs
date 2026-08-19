#!/usr/bin/env node
/**
 * Страховка: если агент забыл выложить работу, коммит + push в origin/main.
 * Не делает force-push. Если rebase на origin/main не сходится — выходит без пуша.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SECRET = /(^|\/|\\)\.env($|\.)|credentials\.json|\.pem$|\.p12$|\.key$/i;

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function git(args, opts = {}) {
  const r = spawnSync("git", args, {
    encoding: "utf8",
    cwd: opts.cwd || process.cwd(),
    env: process.env
  });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim()
  };
}

function gitOk(args, opts) {
  const r = git(args, opts);
  if (r.status !== 0) {
    const err = new Error(r.stderr || r.stdout || `git ${args.join(" ")} failed`);
    err.result = r;
    throw err;
  }
  return r.stdout;
}

function isSecret(file) {
  return SECRET.test(file.replace(/\\/g, "/"));
}

function say(msg) {
  process.stderr.write(`[ship-to-prod] ${msg}\n`);
}

function main() {
  readStdin();

  const top = git(["rev-parse", "--show-toplevel"]);
  if (top.status !== 0) {
    say("не git-репозиторий, пропуск");
    return;
  }
  const root = top.stdout;
  process.chdir(root);

  const inside = git(["rev-parse", "--is-inside-work-tree"]);
  if (inside.stdout !== "true") {
    say("не work tree, пропуск");
    return;
  }

  gitOk(["fetch", "origin"]);

  const status = gitOk(["status", "--porcelain"]);
  if (status) {
    gitOk(["add", "-A"]);
    const staged = gitOk(["diff", "--cached", "--name-only"])
      .split(/\r?\n/)
      .filter(Boolean);
    for (const file of staged) {
      if (isSecret(file)) gitOk(["reset", "-q", "HEAD", "--", file]);
    }
    const kept = gitOk(["diff", "--cached", "--name-only"])
      .split(/\r?\n/)
      .filter(Boolean);
    if (kept.length) {
      const short = kept.slice(0, 4).join(", ");
      const extra = kept.length > 4 ? ` (+${kept.length - 4})` : "";
      const msg = `agent: auto-ship ${short}${extra}`;
      const commit = git(["commit", "-m", msg]);
      if (commit.status !== 0) {
        say(`коммит не удался: ${commit.stderr || commit.stdout}`);
        return;
      }
      say(`коммит: ${msg}`);
    }
  }

  const rebase = git(["rebase", "origin/main"]);
  if (rebase.status !== 0) {
    git(["rebase", "--abort"]);
    say("rebase на origin/main не сошёлся — прод не трогаю (нет force-push)");
    return;
  }

  const head = gitOk(["rev-parse", "HEAD"]);
  const main = git(["rev-parse", "origin/main"]);
  if (main.status === 0 && head === main.stdout) {
    say("origin/main уже на этом коммите");
    return;
  }

  const push = git(["push", "origin", "HEAD:main"]);
  if (push.status !== 0) {
    say(`push в main не удался: ${push.stderr || push.stdout}`);
    return;
  }
  say("запушено в origin/main (прод)");
}

try {
  main();
} catch (err) {
  say(err.message || String(err));
}
process.exit(0);
