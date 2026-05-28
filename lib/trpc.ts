import { httpLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@/backend/trpc/app-router";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  const url = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;

  // Allow app to run without tRPC backend during development
  // We're migrating to Supabase, so tRPC will be removed
  if (!url) {
    console.warn("EXPO_PUBLIC_RORK_API_BASE_URL not configured - tRPC disabled");
    return "http://localhost:3000"; // Placeholder URL
  }

  return url;
};

// Flag to check if tRPC is properly configured
export const isTrpcConfigured = !!process.env.EXPO_PUBLIC_RORK_API_BASE_URL;

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
    }),
  ],
});
