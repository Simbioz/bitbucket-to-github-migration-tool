import { readFile, writeFile } from "fs/promises";

const fetchRepos = async (workspace, username, password) => {
  let url = `https://api.bitbucket.org/2.0/repositories/${workspace}`;
  let repos = [];

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` },
    });
    const data = await res.json();
    repos.push(...data.values);
    url = data.next ?? null;
  }

  return repos;
};

const creds = JSON.parse(await readFile("info.json", { encoding: "utf8" }));

const repos = await fetchRepos(creds.bitbucket_workspace, creds.bitbucket_username, creds.bitbucket_app_password);
await writeFile("repos/repos.json", JSON.stringify(repos, undefined, 2));

console.info("Wrote repos file to repos/repos.json");
