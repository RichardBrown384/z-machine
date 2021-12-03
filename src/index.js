const fs = require('fs');

const {
  argv,
  stdout,
  stderr,
} = require('process');

const readlineSync = require('readline-sync');

const runStory = require('./z-machine');

function main() {
  const [, , storyFile] = argv;
  if (!storyFile) {
    stderr.write('No story file specified\n');
    return;
  }

  const story = fs.readFileSync(storyFile);

  runStory({
    buffer: Uint8Array.from(story).buffer,
    stdout,
    stderr,
    readlineSync,
  });
}

main();
