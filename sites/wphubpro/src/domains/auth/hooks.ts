import { userHasAdminLabel } from '@/domains/auth/adminLabel';
import { useQuery } from '@tanstack/react-query';
import { account } from '../../services/appwrite';

/**
 * Hook to fetch the current logged-in user including roles (admin label).
 */
export const useUser = () => {
  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        const user = await account.get();
        const isAdmin = userHasAdminLabel(user.labels as string[] | undefined);

        return {
          ...user,
          isAdmin,
        } as any;
      } catch {
        // If there is no active session, return null
        return null;
      }
    },
    // Avoid unnecessary retries if the user is simply not logged in
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minuten
  });
};

/**
 * Placeholder voor login logica
 */
export const useLogin = () => {
  // You can add the login mutation here later
};

/**
 * Placeholder voor logout logica
 */
export const useLogout = () => {
  // You can add the logout mutation here later
};
