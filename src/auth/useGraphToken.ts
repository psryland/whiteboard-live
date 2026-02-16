import { useState, useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { login_scopes } from './MsalConfig';

export interface GraphAuth {
	is_signed_in: boolean;
	user_name: string | null;
	user_email: string | null;
	Sign_In: () => Promise<string | null>;
	Sign_Out: () => Promise<void>;
	Get_Token: () => Promise<string | null>;
}

/**
 * Hook providing Graph API token acquisition.
 * Uses redirect flow for sign-in (more reliable than popup across browsers).
 * Uses silent acquisition for subsequent token requests.
 */
export function useGraphToken(): GraphAuth {
	const { instance, accounts } = useMsal();
	const [user_name, set_user_name] = useState<string | null>(
		accounts[0]?.name ?? null
	);

	const is_signed_in = accounts.length > 0;

	const Get_Token = useCallback(async (): Promise<string | null> => {
		if (accounts.length === 0) return null;
		try {
			const result = await instance.acquireTokenSilent({
				scopes: login_scopes,
				account: accounts[0],
			});
			return result.accessToken;
		} catch (err) {
			if (err instanceof InteractionRequiredAuthError) {
				// Redirect for re-auth
				await instance.acquireTokenRedirect({ scopes: login_scopes });
				return null;
			}
			return null;
		}
	}, [instance, accounts]);

	const Sign_In = useCallback(async (): Promise<string | null> => {
		try {
			// Use redirect flow — works reliably across all browsers
			await instance.loginRedirect({
				scopes: login_scopes,
			});
			// Page will redirect, so this won't return
			return null;
		} catch {
			return null;
		}
	}, [instance]);

	const Sign_Out = useCallback(async (): Promise<void> => {
		try {
			await instance.logoutRedirect();
			set_user_name(null);
		} catch {
			// ignore
		}
	}, [instance]);

	return { is_signed_in, user_name, user_email: accounts[0]?.username ?? null, Sign_In, Sign_Out, Get_Token };
}
