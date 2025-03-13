import { rm, readFile, writeFile } from "fs/promises";
import { run } from "./src/util.js";
import { existsSync } from "fs";
import { confirm } from "./src/util.js";
import yargs from "yargs";

const options = yargs(process.argv.slice(2)).argv;

const confirmBeforePush = options["confirm-before-push"];
const confirmBeforeNext = options["confirm-before-next"];
const ignoreFailure = options["ignore-failure"];
const lfs = options.lfs;

const cloneRepo = async (repo, destination) => {
  const url = repo.links.clone.find((link) => link.name === "ssh").href;
  await rm(destination, { recursive: true, force: true });
  run(`git clone --mirror ${url} ${destination}`);
};

const fetchGithub = async (url, token, options = {}) => {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  const res = await fetch(url, { headers, ...options });
  if (!res.ok) {
    if (res.status === 404) return null; // Handle "not found" cases
    throw new Error(`GitHub API error: ${await res.text()}`);
  }
  return res.json();
};

const getExistingGithubRepoPushURL = async (name, organization, token) => {
  const url = `https://api.github.com/repos/${organization}/${name}`;
  const repo = await fetchGithub(url, token);
  if (repo?.size > 0) throw new Error(`Repository ${name} exists but is not empty`);
  return repo?.ssh_url;
};

const createGithubRepo = async (name, organization, token) => {
  const url = `https://api.github.com/orgs/${organization}/repos`;
  const body = JSON.stringify({ name, private: true });

  const repo = await fetchGithub(url, token, { method: "POST", body });
  return repo.ssh_url;
};

const pushRepo = async (path, pushURL) => {
  run(`git -C ${path} push --mirror ${pushURL}`);
};

const gitLFSImport = async (path, pattern) => {
  run(`git -C ${path} lfs migrate import --include="${pattern}" --everything`);
};

const reposFile = "repos/repos.json";
const unmigratedReposFile = "repos/unmigrated.json";
const migratedReposFile = "repos/migrated.json";
const failedReposFile = "repos/failed.json";

// Make sure the repos have been obtained at least once
if (!existsSync(reposFile)) throw new Error("Use get-repos to generate the repos file before using this script!");

// Create the unmigrated repos file if it doesn't exist
if (!existsSync(unmigratedReposFile)) {
  const json = await readFile(reposFile, { encoding: "utf8" });
  await writeFile(unmigratedReposFile, json);
}

// Create the migrated repos file if it doesn't exist
if (!existsSync(migratedReposFile)) {
  await writeFile(migratedReposFile, JSON.stringify([]));
}

// Create the failed repos file if it doesn't exist
if (!existsSync(failedReposFile)) {
  await writeFile(failedReposFile, JSON.stringify([]));
}

// Load repos to migrate from the unmigrated repos file
const unmigratedRepos = JSON.parse(await readFile(unmigratedReposFile, { encoding: "utf8" }));

const creds = JSON.parse(await readFile("info.json", { encoding: "utf8" }));

console.info(`===> ${unmigratedRepos.length} repos to migrate`);

while (unmigratedRepos.length > 0) {
  console.info(`===> ${unmigratedRepos.length} repos remaining`);
  const repo = unmigratedRepos.shift();
  const destination = `./repos/mirrors/${repo.name}`;
  try {
    console.info(`===> Migrating ${repo.name}`);

    console.info(`=> Creating Github repo`);
    let pushURL = await getExistingGithubRepoPushURL(repo.name, creds.github_organization, creds.github_token);
    if (!pushURL) pushURL = await createGithubRepo(repo.name, creds.github_organization, creds.github_token);

    console.info(`=> Mirroring Bitbucket repo locally`);
    await cloneRepo(repo, destination);

    if (lfs) {
      console.info(`=> Importing files matching pattern \`${lfs}\` into Git LFS`);
      await gitLFSImport(destination, lfs);
    }

    if (confirmBeforePush) {
      const proceed = await confirm("Proceed with push now?");
      if (!proceed) break;
    }

    console.info(`=> Pushing mirror to Github`);
    await pushRepo(destination, pushURL);

    console.info(`=> Deleting local mirror`);
    await rm(destination, { recursive: true, force: true });

    // Write the unmigrated.json file with the successfully migrated repo removed
    await writeFile(unmigratedReposFile, JSON.stringify(unmigratedRepos, undefined, 2));

    // Write the migrated.json file with the successfully migrated repo added
    const migrated = JSON.parse(await readFile(migratedReposFile, { encoding: "utf8" }));
    await writeFile(migratedReposFile, JSON.stringify([...migrated, repo], undefined, 2));
  } catch (error) {
    console.error(`Failed to migrate repo ${repo.name}`, error);

    // Remove the local mirror (clean start)
    await rm(destination, { recursive: true, force: true });

    if (!ignoreFailure) {
      // Write the unmigrated.json file with the failed repo removed
      // (so we can continue processing it until it's empty and handle failures later)
      await writeFile(unmigratedReposFile, JSON.stringify(unmigratedRepos, undefined, 2));

      // Write the failed.json file with the failed repo added
      const failed = JSON.parse(await readFile(failedReposFile, { encoding: "utf8" }));
      await writeFile(failedReposFile, JSON.stringify([...failed, repo], undefined, 2));
    }
  }

  if (confirmBeforeNext && !(await confirm("Proceed to next repo? (y/n) "))) break;
}
