import { useSession } from '@/context/SessionContext';

/**
 * The signed-in visitor, if any, for the public pages' nav ("Open Rune"
 * instead of sign in). The standalone marketing site (landing_page/) has no
 * accounts, so its copy of this file always returns null.
 */
export function useSiteUser(): { id: string } | null {
  return useSession().user;
}
