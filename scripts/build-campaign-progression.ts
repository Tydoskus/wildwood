import { writeFileSync } from 'node:fs';
import { buildCampaignProgression, CAMPAIGN_PROGRESSION_FILE } from './balance/campaign-progression';

// npx tsx scripts/build-campaign-progression.ts — rewrites shared/campaign-progression.ts
// from its committed source revision. The fit itself lives in scripts/balance/.
writeFileSync(CAMPAIGN_PROGRESSION_FILE, buildCampaignProgression());
