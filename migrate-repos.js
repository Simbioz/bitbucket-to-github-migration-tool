import { rm, readFile, writeFile } from "fs/promises";
import { run } from "./src/util.js";
import { existsSync } from "fs";

const cloneRepo = async (repo, destination) => {
  const url = repo.links.clone.find((link) => link.name === "ssh").href;
  await rm(destination, { recursive: true, force: true });
  run(`git clone --mirror ${url} ${destination}`);
};

const createGithubRepo = async (name, organization, token) => {
  const url = `https://api.github.com/orgs/${organization}/repos`; // For organization repos
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({
    name: name,
    private: true,
  });

  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${await res.text()}`);
  }

  const repo = await res.json();
  return repo.ssh_url; // SSH push URL
};

const pushRepo = async (path, pushURL) => {
  run(`git -C ${path} push --mirror ${pushURL}`);
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

while (unmigratedRepos.length > 0) {
  console.info(`===> ${unmigratedRepos.length} repos remaining`);
  const repo = unmigratedRepos.shift();
  const destination = `./repos/mirrors/${repo.name}`;
  try {
    console.info(`===> Migrating ${repo.name}`);
    console.info(`1. Creating Github repo`);
    const pushURL = await createGithubRepo(repo.name, creds.github_organization, creds.github_token);
    console.info(`2. Mirroring Bitbucket repo locally`);
    await cloneRepo(repo, destination);
    console.info(`3. Pushing mirror to Github`);
    await pushRepo(destination, pushURL);
    console.info(`4. Deleting local mirror`);
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

    // Write the unmigrated.json file with the failed repo removed
    // (so we can continue processing it until it's empty and handle failures later)
    await writeFile(unmigratedReposFile, JSON.stringify(unmigratedRepos, undefined, 2));

    // Write the failed.json file with the failed repo added
    const failed = JSON.parse(await readFile(failedReposFile, { encoding: "utf8" }));
    await writeFile(failedReposFile, JSON.stringify([...failed, repo], undefined, 2));
  }
}
