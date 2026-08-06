import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";
import { installProtectedRestAuthTransport } from "@/lib/protected-rest-auth";

installProtectedRestAuthTransport();

export const trpc = createTRPCReact<AppRouter>();
