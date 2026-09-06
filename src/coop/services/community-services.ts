import { createGuildService } from "./guild-service";
import { createSocialService } from "./social-service";

/** Guild membership and social actions share the root connection and save barrier. */
export function createCommunityServices(dependencies: Parameters<typeof createSocialService>[0]) {
  return { guildService: createGuildService(dependencies), socialService: createSocialService(dependencies) };
}
