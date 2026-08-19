#!/usr/bin/env node
/**
 * Закон репозитория: одна ветка main, прод = origin/main.
 *
 *   node .cursor/hooks/ship-to-prod.cjs          — коммит (если есть изменения) + merge + push
 *   node .cursor/hooks/ship-to-prod.cjs --sync   — только fetch, checkout main, merge origin/main
 *
 * Без force-push. При конфликте merge — выход без пуша.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");

const SECRET =
  /(^|\/|\\)\.env($|\.)|credentials\.json|\.pem$|\.p12$|\.key$|id_rsa|\.secret/i;
const EPHEMERAL_BRANCH = /^(cursor\/|agent\/|feature\/|fix\/)/i;

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

function repoRoot() {
  const top = git(["rev-parse", "--show-toplevel"]);
  if (top.status !== 0) return null;
  return top.stdout;
}

function ensureWorkTree() {
  const inside = git(["rev-parse", "--is-inside-work-tree"]);
  return inside.stdout === "true";
}

function currentBranch() {
  const branch = gitOk(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === "HEAD") return null;
  return branch;
}

function syncOriginMain() {
  gitOk(["fetch", "origin"]);
  const branch = currentBranch();
  if (!branch) {
    say("detached HEAD — пропуск sync");
    return { branch: null, synced: false };
  }

  const dirty = gitOk(["status", "--porcelain"]);
  if (branch !== "main" && dirty) {
    say(`${branch}: есть незакоммиченные изменения — sync отложен до ship`);
    return { branch, synced: false };
  }

  if (branch !== "main") {
    say(`переключаюсь на main (были на ${branch})`);
    gitOk(["checkout", "main"]);
  }

  gitOk(["merge", "--no-edit", "origin/main"]);
  say("main синхронизирован с origin/main");
  return { branch, synced: true };
}

function commitWorkingTree() {
  const status = gitOk(["status", "--porcelain"]);
  if (!status) return null;

  gitOk(["add", "-A"]);
  const staged = gitOk(["diff", "--cached", "--name-only"])
    .split(/\r?\n/)
    .filter(Boolean);

  for (const file of staged) {
    if (isSecret(file)) {
      gitOk(["reset", "-q", "HEAD", "--", file]);
      say(`секрет не коммитим: ${file}`);
    }
  }

  const kept = gitOk(["diff", "--cached", "--name-only"])
    .split(/\r?\n/)
    .filter(Boolean);
  if (!kept.length) return null;

  const short = kept.slice(0, 4).join(", ");
  const extra = kept.length > 4 ? ` (+${kept.length - 4})` : "";
  const msg = `agent: auto-ship ${short}${extra}`;
  const commit = git(["commit", "-m", msg]);
  if (commit.status !== 0) {
    say(`коммит не удался: ${commit.stderr || commit.stdout}`);
    return null;
  }
  say(`коммит: ${msg}`);
  return msg;
}

function mergeBranchIntoMain(sourceBranch) {
  if (!sourceBranch || sourceBranch === "main") return true;

  if (EPHEMERAL_BRANCH.test(sourceBranch)) {
    say(`вливаю временную ветку ${sourceBranch} в main`);
  } else {
    say(`вливаю ${sourceBranch} в main (закон: одна ветка)`);
  }

  const mergeBranch = git(["merge", "--no-edit", sourceBranch]);
  if (mergeBranch.status !== 0) {
    git(["merge", "--abort"]);
    say(`merge ${sourceBranch} → main не сошёлся — прод не трогаю`);
    return false;
  }
  return true;
}

function deleteBranchEverywhere(branchName) {
  if (!branchName || branchName === "main") return;
  git(["push", "origin", "--delete", branchName]);
  git(["branch", "-D", branchName]);
  say(`ветка ${branchName} удалена (локально и на origin)`);
}

function pushMainIfAhead() {
  const head = gitOk(["rev-parse", "HEAD"]);
  const remoteMain = git(["rev-parse", "origin/main"]);
  if (remoteMain.status !== 0) {
    say("origin/main недоступен — push пропущен");
    return;
  }
  if (head === remoteMain.stdout) {
    say("origin/main уже на этом коммите");
    return;
  }
  const push = git(["push", "origin", "main"]);
  if (push.status !== 0) {
    say(`push origin main не удался: ${push.stderr || push.stdout}`);
    return;
  }
  say("запушено в origin/main (прод)");
}

function ship() {
  const sourceBranch = currentBranch();
  if (!sourceBranch) {
    say("detached HEAD — ship пропущен");
    return;
  }

  gitOk(["fetch", "origin"]);
  commitWorkingTree();

  if (sourceBranch !== "main") {
    const co = git(["checkout", "main"]);
    if (co.status !== 0) {
      say(`не смог checkout main: ${co.stderr || co.stdout}`);
      return;
    }
  }

  const mergeOrigin = git(["merge", "--no-edit", "origin/main"]);
  if (mergeOrigin.status !== 0) {
    git(["merge", "--abort"]);
    say("merge origin/main не сошёлся — прод не трогаю (нет force-push)");
    return;
  }

  if (!mergeBranchIntoMain(sourceBranch)) return;

  pushMainIfAhead();
  deleteBranchEverywhere(sourceBranch !== "main" ? sourceBranch : null);
  git(["remote", "prune", "origin"]);
}

function main() {
  readStdin();

  const root = repoRoot();
  if (!root) {
    say("не git-репозиторий, пропуск");
    return;
  }
  process.chdir(root);

  if (!ensureWorkTree()) {
    say("не work tree, пропуск");
    return;
  }

  const syncOnly = process.argv.includes("--sync");
  if (syncOnly) {
    syncOriginMain();
    return;
  }

  ship();
}

try {
  main();
} catch (err) {
  say(err.message || String(err));
}
process.exit(0);
