import { writeFileSync, mkdirSync } from 'node:fs';
import { buildCampaignHealthCurve, CAMPAIGN_HEALTH_FILE } from './balance/campaign-health-curve';

// npm run balance:smooth-health — rewrites shared/campaign-health-curve.ts from
// its committed source revision. The fit itself lives in scripts/balance/.
const { source, report } = buildCampaignHealthCurve();
writeFileSync(CAMPAIGN_HEALTH_FILE, source);
mkdirSync('local-data/campaign-health', { recursive: true });
writeFileSync('local-data/campaign-health/curve.json', JSON.stringify(report, null, 2));
