export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow the scopes already used in this repo's history
    'scope-enum': [0],
    // Allow longer headers for descriptive commit messages
    'header-max-length': [2, 'always', 120],
    // Allow Co-Authored-By trailers
    'trailer-exists': [0],
  },
};
