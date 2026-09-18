const repository = process.env.GITHUB_REPOSITORY;
if (repository && !/^[\w.-]+\/[\w.-]+$/.test(repository))
  throw Error("Invalid GITHUB_REPOSITORY");
module.exports = {
  extends: null,
  ...require("./package.json").build,
  publish: repository
    ? [
        {
          provider: "github",
          owner: repository.split("/")[0],
          repo: repository.split("/")[1],
        },
      ]
    : null,
};
