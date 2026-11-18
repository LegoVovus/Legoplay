import { writable, get } from 'svelte/store';
import { toast } from 'svelte-sonner';
import { USER_DATA } from './user-data';
import { fetchGemsBalance } from './gems';
import { fetchPortfolioSummary } from './portfolio-data';

export type AbuseEffect = 'none' | 'confetti' | 'rain' | 'shake';
export type AbuseReactionEmoji = '?' | '?' | '??';

export const ABUSE_REACTION_EMOJIS: AbuseReactionEmoji[] = ['?', '?', '??'];

export interface AbuseReactionState {
	counts: Record<AbuseReactionEmoji, number>;
	mine: AbuseReactionEmoji | null;
}

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
export const ADMIN_ABUSE_REACTIONS = writable<Record<number, AbuseReactionState>>({});

function emptyReactionState(): AbuseReactionState {
	return { counts: { '?': 0, '?': 0, '??': 0 }, mine: null };
}

export function setAdminAbuseReactionCounts(
	eventId: number,
	counts: Partial<Record<AbuseReactionEmoji, number>>
): void {
	ADMIN_ABUSE_REACTIONS.update((map) => {
		const prev = map[eventId] ?? emptyReactionState();
		return {
			...map,
			[eventId]: {
				...prev,
				counts: {
					'?': Number(counts['?'] ?? prev.counts['?'] ?? 0),
					'?': Number(counts['?'] ?? prev.counts['?'] ?? 0),
					'??': Number(counts['??'] ?? prev.counts['??'] ?? 0)
				}
			}
		};
	});
}

export function markMyAdminAbuseReaction(eventId: number, emoji: AbuseReactionEmoji): void {
	ADMIN_ABUSE_REACTIONS.update((map) => {
		const prev = map[eventId] ?? emptyReactionState();
		return { ...map, [eventId]: { ...prev, mine: emoji } };
	});
}

export async function reactToAdminAbuse(eventId: number, emoji: AbuseReactionEmoji): Promise<void> {
	const current = get(ADMIN_ABUSE_REACTIONS)[eventId];
	if (current?.mine) return;
	markMyAdminAbuseReaction(eventId, emoji);
	try {
		const response = await fetch('/api/admin/abuse', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ kind: 'react', eventId, emoji })
		});
		if (!response.ok) {
			ADMIN_ABUSE_REACTIONS.update((map) => {
				const prev = map[eventId] ?? emptyReactionState();
				return { ...map, [eventId]: { ...prev, mine: null } };
			});
			const data = await response.json().catch(() => ({}));
			toast.error(data.error || 'Could not add reaction');
			return;
		}
		const data = await response.json().catch(() => null);
		if (data?.reactions) setAdminAbuseReactionCounts(eventId, data.reactions);
	} catch {
		ADMIN_ABUSE_REACTIONS.update((map) => {
			const prev = map[eventId] ?? emptyReactionState();
			return { ...map, [eventId]: { ...prev, mine: null } };
		});
		toast.error('Could not add reaction');
	}
}

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
			// The sidebar wallet reads from the portfolio summary, so refresh it too.
			fetchPortfolioSummary();
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
