import { writable, get } from 'svelte/store';
import { toast } from 'svelte-sonner';
import { USER_DATA } from './user-data';
import { fetchGemsBalance } from './gems';

export type AbuseEffect = 'none' | 'confetti' | 'rain' | 'shake';

export interface AdminAbuseEvent {
	id: number;
	kind: 'broadcast' | 'grant';
	adminId: number;
	adminUsername: string;
	avatarUrl: string | null;
	title: string;
	message: string;
	effect: AbuseEffect;
	duration: number;
	scope: 'all' | 'user';
	targetUserId: number | null;
	targetUsername: string | null;
	cash: number;
	gems: number;
	recipients?: number;
	sentAt: number;
	preview?: boolean;
}

/**
 * Queue of full-screen Admin Abuse messages. Only the first entry is rendered at a
 * time; the overlay dismisses it after its own duration and the next one shows up.
 */
export const ADMIN_ABUSE_QUEUE = writable<AdminAbuseEvent[]>([]);

const SEEN_LIMIT = 400;
const seen = new Set<string>();

function remember(key: string): boolean {
	if (seen.has(key)) return false;
	seen.add(key);
	if (seen.size > SEEN_LIMIT) {
		const oldest = seen.values().next().value;
		if (oldest) seen.delete(oldest);
	}
	return true;
}

export function formatAbuseMoney(amount: number): string {
	return '$' + Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function isForMe(event: AdminAbuseEvent): boolean {
	const me = get(USER_DATA);
	if (!me) return false;
	if (event.scope === 'all') return true;
	return event.targetUserId !== null && Number(me.id) === event.targetUserId;
}

function lootText(event: AdminAbuseEvent): string {
	return [
		event.cash > 0 ? formatAbuseMoney(event.cash) : null,
		event.gems > 0 ? `${event.gems.toLocaleString('en-US')} gems` : null
	]
		.filter(Boolean)
		.join(' + ');
}

/**
 * Entry point for every `admin_abuse` websocket message.
 * Applies the granted amount to the local balance once (deduplicated by event id)
 * and queues the overlay.
 */
export function pushAdminAbuseEvent(event: AdminAbuseEvent): void {
	if (!event || !event.kind) return;

	if (!event.preview) {
		const key = `${event.kind}:${event.id}`;
		if (!remember(key)) return;
	}

	ADMIN_ABUSE_QUEUE.update((queue) => [...queue, event]);

	if (event.preview) return;

	const mine = isForMe(event);

	if (event.kind === 'grant' && mine) {
		if (event.cash > 0) {
			USER_DATA.update((user) =>
				user
					? {
							...user,
							baseCurrencyBalance: Number(user.baseCurrencyBalance || 0) + event.cash
						}
					: user
			);
		}
		if (event.gems > 0) {
			fetchGemsBalance();
		}
	}

	// A private gift is only a full-screen moment for the receiver; everyone else
	// gets a compact toast about the flex.
	if (event.kind === 'grant' && !mine) {
		const who = event.targetUsername ? `@${event.targetUsername}` : 'Someone';
		toast.message(`@${event.adminUsername} is abusing their power`, {
			description: `${who} received ${lootText(event)}.`,
			duration: 6000
		});
	}
}

export function dismissAdminAbuse(id?: number): void {
	ADMIN_ABUSE_QUEUE.update((queue) =>
		id === undefined ? queue.slice(1) : queue.filter((event) => event.id !== id)
	);
}
