#!/usr/bin/env node

const { spawn } = require('child_process');

const answers = [
  'y', // Override existing project
  '2', // Link this directory to an existing project
  '1', // WPHub PRO organization
  '1', // WPHub PRO project
  'y', // Pull latest deployment source? Yes
  'n', // Skip this step? No
  'n', // Skip this step? No
];

const child = spawn('appwrite', ['init', 'project'], {
  stdio: ['pipe', 'inherit', 'inherit'],
});

let index = 0;

const sendNextAnswer = () => {
  if (index >= answers.length) {
    child.stdin.end();
    return;
  }

  const answer = answers[index++];
  child.stdin.write(`${answer}\n`);

  setTimeout(sendNextAnswer, 500);
};

setTimeout(sendNextAnswer, 1000);

child.on('close', (code) => {
  process.exit(code);
});

child.on('error', (err) => {
  console.error('Failed to start Appwrite CLI:', err);
  process.exit(1);
});