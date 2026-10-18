/**
 * Vercel Express entrypoint. Must exist in git (service entrypoint check).
 * On deploy, `npm run build:vercel` overwrites this file with the esbuild bundle.
 * Do not commit the built bundle — keep this placeholder in the repo.
 */
module.exports = (_req, res) => {
  res.statusCode = 503;
  res.end("API bundle missing. Run build:vercel.");
};
