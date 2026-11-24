// Gets the app ready for the Homey App Store: built anew, with the packages it needs and no others, and built and checked by the
// Homey CLI the way it does when it sends the app. It sends nothing. Run it with `npm run app-store`.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = 'homey@4.6.3';
const root = fileURLToPath(new URL('..', import.meta.url));
const app = fileURLToPath(new URL('../homey-app', import.meta.url));

/** What npm tells the programs it starts about this folder: in the other one it would take the packages of this one. */
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^npm_/i.test(name)));

function run(command, cwd) {
  const { status } = spawnSync(command, { cwd, env, shell: true, stdio: 'inherit' });
  if (status !== 0) process.exit(status ?? 1);
}

run('npm run homey-app', root);
run('npm ci', app);
run(`npx --yes ${CLI} app build`, app);
run(`npx --yes ${CLI} app validate --level publish`, app);
console.log(`\nReady. To send it, from the folder homey-app:  npx ${CLI} app publish`);
