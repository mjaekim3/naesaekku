require(
  process.argv.includes("--studio") ? "./studio-main.cjs" : "./pet-main.cjs",
);
