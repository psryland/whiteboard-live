import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
	const [matches, set_matches] = useState(() => window.matchMedia(query).matches);

	useEffect(() => {
		const mql = window.matchMedia(query);
		const handler = (e: MediaQueryListEvent) => set_matches(e.matches);
		mql.addEventListener('change', handler);
		set_matches(mql.matches);
		return () => mql.removeEventListener('change', handler);
	}, [query]);

	return matches;
}
