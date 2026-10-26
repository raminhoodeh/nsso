# Deployment checks

Run from this application directory with Node.js 24:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Configure the environment variables used by the relevant features in the deployment environment. Keep service-role and provider keys server-side. Premium accounts are currently free; platform billing routes are disabled. Creator PayPal payments remain enabled.

Deploy the reviewed revision, then verify the deployed account/profile, creator storefront, Deity, RazinFlix and UAE Places routes. Local verification alone does not confirm a production deployment. Preserve existing database data and review any required schema changes separately.
