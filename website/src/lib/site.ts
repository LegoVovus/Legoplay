import { env as publicEnv } from '$env/dynamic/public';

export const SITE_NAME = publicEnv.PUBLIC_SITE_NAME || 'LegoPlay';
export const SITE_ORIGIN = (
	publicEnv.PUBLIC_SITE_ORIGIN ||
	publicEnv.PUBLIC_BETTER_AUTH_URL ||
	'https://legoplay.lordpipon.com'
).replace(/\/+$/, '');
export const SITE_DESCRIPTION =
	publicEnv.PUBLIC_SITE_DESCRIPTION ||
	'LegoPlay is a free crypto trading simulator. Create coins, trade on liquidity pools, predict markets, and play arcade games with virtual money.';

export const CONTACT_EMAIL = publicEnv.PUBLIC_SITE_CONTACT_EMAIL || 'legovova123@gmail.com';
export const DISCORD_INVITE = publicEnv.PUBLIC_DISCORD_INVITE || '';
export const GITHUB_REPO = publicEnv.PUBLIC_GITHUB_REPO || 'https://github.com/lordpipon/catplay';
export const ADSENSE_CLIENT = publicEnv.PUBLIC_ADSENSE_CLIENT || '';