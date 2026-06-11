/**
 * Dragon Avatar Asset Map
 *
 * Maps the r2-pub.rork.com dragon-avatar URLs (used in AppContext, settings,
 * practice, and the rewards table's avatar_url column) to local bundled
 * images, so the app no longer depends on Rork's CDN for these core UI
 * assets at runtime. Unknown/AI-generated URLs pass through unchanged.
 */

import { ImageSourcePropType } from "react-native";

const DRAGON_ASSETS: Record<string, ImageSourcePropType> = {
  // Starter / "Baby Dragon I-IX" rewards (sort_order 100-108)
  "https://r2-pub.rork.com/generated-images/d987cb8d-3a1c-4153-b962-4f4a5a3bde41.png": require("@/assets/images/dragons/starter/d987cb8d-3a1c-4153-b962-4f4a5a3bde41.png"),
  "https://r2-pub.rork.com/generated-images/d93b981e-f6ea-4972-8107-b576496c24cb.png": require("@/assets/images/dragons/starter/d93b981e-f6ea-4972-8107-b576496c24cb.png"),
  "https://r2-pub.rork.com/generated-images/178d349f-b91d-42b8-ac42-9aa352cc4def.png": require("@/assets/images/dragons/starter/178d349f-b91d-42b8-ac42-9aa352cc4def.png"),
  "https://r2-pub.rork.com/generated-images/fda8ce80-6fd8-4b5f-abfc-19bc79c31d5e.png": require("@/assets/images/dragons/starter/fda8ce80-6fd8-4b5f-abfc-19bc79c31d5e.png"),
  "https://r2-pub.rork.com/generated-images/6ece8f2e-1e13-4bed-be15-309669d9c15c.png": require("@/assets/images/dragons/starter/6ece8f2e-1e13-4bed-be15-309669d9c15c.png"),
  "https://r2-pub.rork.com/generated-images/657b192c-fb2e-4f82-8204-e9ec107e293d.png": require("@/assets/images/dragons/starter/657b192c-fb2e-4f82-8204-e9ec107e293d.png"),
  "https://r2-pub.rork.com/generated-images/bc4aa1f6-2d6d-483e-8cb6-ca2e7b25e77d.png": require("@/assets/images/dragons/starter/bc4aa1f6-2d6d-483e-8cb6-ca2e7b25e77d.png"),
  "https://r2-pub.rork.com/generated-images/f78eaa5e-ef63-408e-9505-0d171c3b4e4c.png": require("@/assets/images/dragons/starter/f78eaa5e-ef63-408e-9505-0d171c3b4e4c.png"),
  "https://r2-pub.rork.com/generated-images/7be0c5cb-b02c-4377-82a1-df22516fe0ab.png": require("@/assets/images/dragons/starter/7be0c5cb-b02c-4377-82a1-df22516fe0ab.png"),

  // Teenage Dragon I-IX (sort_order 200-208, unlocked at 10 wins)
  "https://r2-pub.rork.com/generated-images/0d77351e-5ae4-4fd4-85c9-d40337247e61.png": require("@/assets/images/dragons/teenage/0d77351e-5ae4-4fd4-85c9-d40337247e61.png"),
  "https://r2-pub.rork.com/generated-images/2c7178ac-3096-416e-be22-cf009c5c489d.png": require("@/assets/images/dragons/teenage/2c7178ac-3096-416e-be22-cf009c5c489d.png"),
  "https://r2-pub.rork.com/generated-images/69b5e875-14b0-4b40-bf22-96c695d6b2be.png": require("@/assets/images/dragons/teenage/69b5e875-14b0-4b40-bf22-96c695d6b2be.png"),
  "https://r2-pub.rork.com/generated-images/47fcabb7-7000-4456-83c2-e6859069b70d.png": require("@/assets/images/dragons/teenage/47fcabb7-7000-4456-83c2-e6859069b70d.png"),
  "https://r2-pub.rork.com/generated-images/f42d0447-3172-4b8a-80a2-d2b2050ff66a.png": require("@/assets/images/dragons/teenage/f42d0447-3172-4b8a-80a2-d2b2050ff66a.png"),
  "https://r2-pub.rork.com/generated-images/4d9bc44e-e1de-464f-8f12-4c7fe48c84d3.png": require("@/assets/images/dragons/teenage/4d9bc44e-e1de-464f-8f12-4c7fe48c84d3.png"),
  "https://r2-pub.rork.com/generated-images/af03441f-c644-46ce-8ab1-44a2a267ba28.png": require("@/assets/images/dragons/teenage/af03441f-c644-46ce-8ab1-44a2a267ba28.png"),
  "https://r2-pub.rork.com/generated-images/7b7d41b2-8aaf-4077-b084-b463d9da58c5.png": require("@/assets/images/dragons/teenage/7b7d41b2-8aaf-4077-b084-b463d9da58c5.png"),
  "https://r2-pub.rork.com/generated-images/4891fc39-750e-4ebd-b2fa-73600f8549a0.png": require("@/assets/images/dragons/teenage/4891fc39-750e-4ebd-b2fa-73600f8549a0.png"),

  // Adult Dragon I-IX (sort_order 300-308, unlocked at 75 wins)
  "https://r2-pub.rork.com/generated-images/d5421ced-b222-469e-86e9-bf57414cd738.png": require("@/assets/images/dragons/non_fierce_adult/d5421ced-b222-469e-86e9-bf57414cd738.png"),
  "https://r2-pub.rork.com/generated-images/46bcf6c6-8dca-4af3-aa89-ce289ea66004.png": require("@/assets/images/dragons/non_fierce_adult/46bcf6c6-8dca-4af3-aa89-ce289ea66004.png"),
  "https://r2-pub.rork.com/generated-images/2f70b854-6a4a-4f81-a1c8-857d5031cd61.png": require("@/assets/images/dragons/non_fierce_adult/2f70b854-6a4a-4f81-a1c8-857d5031cd61.png"),
  "https://r2-pub.rork.com/generated-images/adf6e262-3a9b-4cdf-9e15-d41f4d687826.png": require("@/assets/images/dragons/non_fierce_adult/adf6e262-3a9b-4cdf-9e15-d41f4d687826.png"),
  "https://r2-pub.rork.com/generated-images/b3053a7e-b6e6-45fd-aded-154af7b1bd06.png": require("@/assets/images/dragons/non_fierce_adult/b3053a7e-b6e6-45fd-aded-154af7b1bd06.png"),
  "https://r2-pub.rork.com/generated-images/6086acd7-2054-4db0-a38b-ddb62d8173a7.png": require("@/assets/images/dragons/non_fierce_adult/6086acd7-2054-4db0-a38b-ddb62d8173a7.png"),
  "https://r2-pub.rork.com/generated-images/d4928689-63db-46a9-a7c4-806463141952.png": require("@/assets/images/dragons/non_fierce_adult/d4928689-63db-46a9-a7c4-806463141952.png"),
  "https://r2-pub.rork.com/generated-images/637923f8-0483-4397-8775-a745526d7f32.png": require("@/assets/images/dragons/non_fierce_adult/637923f8-0483-4397-8775-a745526d7f32.png"),
  "https://r2-pub.rork.com/generated-images/6c6df691-2973-4fa3-9236-d8ce2ce0a9b5.png": require("@/assets/images/dragons/non_fierce_adult/6c6df691-2973-4fa3-9236-d8ce2ce0a9b5.png"),

  // Fierce Dragon I-IX (sort_order 400-408, unlocked at 200 wins)
  "https://r2-pub.rork.com/generated-images/4090decb-e03e-4e1e-836d-6a97455932cf.png": require("@/assets/images/dragons/fierce_adult/4090decb-e03e-4e1e-836d-6a97455932cf.png"),
  "https://r2-pub.rork.com/generated-images/4924e9b1-d303-43b7-8b57-3476ed6f13d1.png": require("@/assets/images/dragons/fierce_adult/4924e9b1-d303-43b7-8b57-3476ed6f13d1.png"),
  "https://r2-pub.rork.com/generated-images/a3c6b842-cef7-4a61-a6c9-f84aeac959f8.png": require("@/assets/images/dragons/fierce_adult/a3c6b842-cef7-4a61-a6c9-f84aeac959f8.png"),
  "https://r2-pub.rork.com/generated-images/3f3a6e15-3411-4972-8348-766fa05572db.png": require("@/assets/images/dragons/fierce_adult/3f3a6e15-3411-4972-8348-766fa05572db.png"),
  "https://r2-pub.rork.com/generated-images/6233121d-9638-41cd-9cc0-831af74194eb.png": require("@/assets/images/dragons/fierce_adult/6233121d-9638-41cd-9cc0-831af74194eb.png"),
  "https://r2-pub.rork.com/generated-images/3f21ea07-c0f6-4802-9c4e-d7df12cc6b31.png": require("@/assets/images/dragons/fierce_adult/3f21ea07-c0f6-4802-9c4e-d7df12cc6b31.png"),
  "https://r2-pub.rork.com/generated-images/c7776511-a385-4bf9-a051-7cce392c1409.png": require("@/assets/images/dragons/fierce_adult/c7776511-a385-4bf9-a051-7cce392c1409.png"),
  "https://r2-pub.rork.com/generated-images/d0da5601-05dc-405b-b099-4e6b1ff8dd3e.png": require("@/assets/images/dragons/fierce_adult/d0da5601-05dc-405b-b099-4e6b1ff8dd3e.png"),
  "https://r2-pub.rork.com/generated-images/30e626dc-e0de-411a-859d-edd24d7608fc.png": require("@/assets/images/dragons/fierce_adult/30e626dc-e0de-411a-859d-edd24d7608fc.png"),

  // Dead asset on Rork's CDN (404) - used as the "beginner" practice bot avatar.
  // Substituted with an existing local dragon illustration.
  "https://r2-pub.rork.com/generated-images/c6e13d72-4e3e-4370-ac6c-d36eb6e5ee42.png": require("@/assets/images/ui/dragon_1.png"),
};

/**
 * Resolve a dragon-avatar URL to a local bundled asset when available,
 * falling back to a remote `{ uri }` source for unrecognized URLs
 * (e.g. AI-generated avatars).
 */
export function getDragonAvatarSource(url?: string | null): ImageSourcePropType | undefined {
  if (!url) return undefined;
  return DRAGON_ASSETS[url] ?? { uri: url };
}

/** Local replacement for the now-dead `https://rork.app/.../tct_coin` image. */
export const TCT_COIN_IMAGE: ImageSourcePropType = require("@/assets/images/ui/coin_stack.png");
