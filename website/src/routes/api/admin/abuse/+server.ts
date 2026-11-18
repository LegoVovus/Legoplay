import { auth } from '$lib/auth';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { adminLog, user } from '$lib/server/db/schema';
import { count, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { hasFlag } from '$lib/data/flags';
import { redis } from '$lib/server/redis';
import { writeAdminLog } from '$lib/server/admin-log';
import { getPublicUrl } from '$lib/utils';
import type { RequestHandler } from './$types';

const MAX_CASH = 50_000;
const MAX_GEMS = 1_000;
const MAX_TITLE = 60;
const MAX_MESSAGE = 280;

const EFFECTS = ['none', 'confetti', 'rain', 'shake'] as const;
type AbuseEffect = (typeof EFFECTS)[number];

type HeadAdmin = {
	id: number;
	username: string;
	image: string | null;
};

async function requireHeadAdmin(request: Request): Promise<HeadAdmin> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) throw error(401, 'Not authenticated');

	const [admin] = await db
		.select({ id: user.id, username: user.username, image: user.image, flags: user.flags })
		.from(user)
		.where(eq(user.id, Number(session.user.id)))
		.limit(1);

	if (!admin || !hasFlag(admin.flags, 'IS_HEAD_ADMIN')) {
		throw error(403, 'Head admin access required');
	}

	return { id: admin.id, username: admin.username, image: admin.image };
}

async function rateLimited(scope: string, limit: number, windowSeconds: number): Promise<boolean> {
	const key = `admin:abuse:rl:${scope}`;
	const hits = await redis.incr(key);
	if (hits === 1) {
		await redis.expire(key, windowSeconds);
	}
	return hits > limit;
}

function cleanText(value: unknown, max: number): string {
	return String(value ?? '')
		.replace(/[\u0000-\u001f\u007f]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);
}

function cleanEffect(value: unknown, fallback: AbuseEffect): AbuseEffect {
	return EFFECTS.includes(value as AbuseEffect) ? (value as AbuseEffect) : fallback;
}

function cleanNumber(value: unknown): number {
	const parsed = Math.floor(Number(value ?? 0));
	return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(amount: number): string {
	return '$' + Number(amount || 0).toLocaleString('en-US');
}

function lootText(cash: number, gems: number): string {
	return [
		cash > 0 ? formatMoney(cash) : null,
		gems > 0 ? `${gems.toLocaleString('en-US')} gems` : null
	]
		.filter(Boolean)
		.join(' + ');
}

async function applyGrant(userIds: number[], cash: number, gems: number): Promise<void> {
	if (userIds.length === 0 || (cash <= 0 && gems <= 0)) return;

	await db
		.update(user)
		.set({
			...(cash > 0
				? { baseCurrencyBalance: sql`${user.baseCurrencyBalance} + ${cash.toString()}` }
				: {}),
			...(gems > 0 ? { gems: sql`${user.gems} + ${gems}` } : {})
		})
		.where(inArray(user.id, userIds));
}

export const GET: RequestHandler = async ({ request }) => {
	await requireHeadAdmin(request);

	const [totals] = await db.select({ playerCount: count() }).from(user);

	const players = await db
		.select({
			id: user.id,
			username: user.username,
			image: user.image,
			cash: user.baseCurrencyBalance,
			gems: user.gems
		})
		.from(user)
		.orderBy(desc(user.id))
		.limit(500);

	const adminAlias = alias(user, 'abuseAdmin');

	const rows = await db
		.select({
			id: adminLog.id,
			action: adminLog.action,
			details: adminLog.details,
			createdAt: adminLog.createdAt,
			targetUserId: adminLog.targetUserId,
			adminId: adminLog.adminId,
			adminUsername: adminAlias.username,
			adminImage: adminAlias.image
		})
		.from(adminLog)
		.innerJoin(adminAlias, eq(adminLog.adminId, adminAlias.id))
		.where(inArray(adminLog.action, ['ABUSE_BROADCAST', 'ABUSE_GRANT']))
		.orderBy(desc(adminLog.id))
		.limit(25);

	return json({
		playerCount: Number(totals?.playerCount ?? 0),
		players: players.map((player) => ({
			id: player.id,
			username: player.username,
			avatarUrl: getPublicUrl(player.image),
			cash: Number(player.cash ?? 0),
			gems: Number(player.gems ?? 0)
		})),
		events: rows.map((row) => {
			let details: Record<string, unknown> = {};
			try {
				details = row.details ? JSON.parse(row.details) : {};
			} catch {
				details = { message: row.details };
			}
			return {
				id: row.id,
				action: row.action,
				details,
				createdAt: row.createdAt.getTime(),
				targetUserId: row.targetUserId,
				adminId: row.adminId,
				adminUsername: row.adminUsername,
				avatarUrl: getPublicUrl(row.adminImage)
			};
		})
	});
};

export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	if (body.kind === 'react') {
		return react(request, body);
	}

	const admin = await requireHeadAdmin(request);

	if (body.kind === 'broadcast') {
		return broadcast(admin, body);
	}
	if (body.kind === 'grant') {
		return grant(admin, body);
	}

	return json({ error: "Unknown action. Use 'broadcast', 'grant', or 'react'." }, { status: 400 });
};


const REACTION_EMOJIS = ['?', '?', '??'] as const;
type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

async function react(request: Request, body: Record<string, unknown>) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) return json({ error: 'Not authenticated' }, { status: 401 });

	const userId = Number(session.user.id);
	const eventId = cleanNumber(body.eventId);
	const emoji = String(body.emoji ?? '');

	if (!Number.isFinite(eventId) || eventId <= 0) {
		return json({ error: 'Invalid event.' }, { status: 400 });
	}
	if (!REACTION_EMOJIS.includes(emoji as ReactionEmoji)) {
		return json({ error: 'Invalid reaction.' }, { status: 400 });
	}

	if (await rateLimited(`react:fast:${userId}`, 10, 30)) {
		return json({ error: 'Too many reactions, slow down.' }, { status: 429 });
	}

	const reactedKey = `admin:abuse:reacted:${eventId}:${userId}`;
	const countsKey = `admin:abuse:reactions:${eventId}`;

	const first = await redis.set(reactedKey, emoji, 'EX', 3600, 'NX');
	if (first !== 'OK') {
		const existing = await redis.hgetall(countsKey);
		return json({
			success: true,
			already: true,
			reactions: {
				'?': Number(existing['?'] || 0),
				'?': Number(existing['?'] || 0),
				'??': Number(existing['??'] || 0)
			}
		});
	}

	await redis.hincrby(countsKey, emoji, 1);
	await redis.expire(countsKey, 3600);
	const counts = await redis.hgetall(countsKey);
	const reactions = {
		'?': Number(counts['?'] || 0),
		'?': Number(counts['?'] || 0),
		'??': Number(counts['??'] || 0)
	};

	const event = {
		type: 'admin_abuse_reaction',
		eventId,
		reactions,
		sentAt: Date.now()
	};
	await redis.publish('admin:abuse', JSON.stringify(event));

	return json({ success: true, reactions });
}

async function broadcast(admin: HeadAdmin, body: Record<string, unknown>) {
	if (await rateLimited(`broadcast:fast:${admin.id}`, 1, 4)) {
		return json({ error: 'Easy there — wait a few seconds between announcements.' }, { status: 429 });
	}
	if (await rateLimited(`broadcast:window:${admin.id}`, 30, 600)) {
		return json(
			{ error: 'Announcement limit reached (30 per 10 minutes). Take a breath.' },
			{ status: 429 }
		);
	}

	const title = cleanText(body.title, MAX_TITLE);
	const message = cleanText(body.message, MAX_MESSAGE);

	if (!title || !message) {
		return json({ error: 'A title and a message are required.' }, { status: 400 });
	}

	const effect = cleanEffect(body.effect, 'confetti');
	const details = { title, message, effect, audience: 'everyone' };
	const entry = await writeAdminLog(admin.id, 'ABUSE_BROADCAST', null, JSON.stringify(details));

	const event = {
		type: 'admin_abuse',
		id: entry?.id ?? Date.now(),
		kind: 'broadcast' as const,
		adminId: admin.id,
		adminUsername: admin.username,
		avatarUrl: getPublicUrl(admin.image),
		title,
		message,
		effect,
		duration: effect === 'none' ? 6_500 : 9_500,
		scope: 'all' as const,
		targetUserId: null,
		targetUsername: null,
		cash: 0,
		gems: 0,
		recipients: 0,
		sentAt: Date.now()
	};

	await redis.publish('admin:abuse', JSON.stringify(event));

	return json({ success: true, event });
}

async function grant(admin: HeadAdmin, body: Record<string, unknown>) {
	if (await rateLimited(`grant:fast:${admin.id}`, 1, 3)) {
		return json({ error: 'Slow down — wait a few seconds between handouts.' }, { status: 429 });
	}
	if (await rateLimited(`grant:window:${admin.id}`, 30, 600)) {
		return json({ error: 'Grant limit reached (30 per 10 minutes).' }, { status: 429 });
	}

	const cash = cleanNumber(body.cash);
	const gems = cleanNumber(body.gems);

	if (cash < 0 || gems < 0) {
		return json({ error: 'Amounts cannot be negative.' }, { status: 400 });
	}
	if (cash === 0 && gems === 0) {
		return json({ error: 'Give at least some cash or some gems.' }, { status: 400 });
	}
	if (cash > MAX_CASH) {
		return json({ error: `Cash is capped at ${formatMoney(MAX_CASH)} per grant.` }, { status: 400 });
	}
	if (gems > MAX_GEMS) {
		return json({ error: `Gems are capped at ${MAX_GEMS.toLocaleString('en-US')} per grant.` }, { status: 400 });
	}

	const effect = cleanEffect(body.effect, 'confetti');
	const customMessage = cleanText(body.message, MAX_MESSAGE);
	const targetRaw = (cleanText(body.target, 60) || 'all').replace(/^@/, '');
	const targetKey = targetRaw.toLowerCase();

	let recipientIds: number[] = [];
	let recipientNames: string[] = [];
	let targetUserId: number | null = null;
	let targetUsername: string | null = null;
	let scope: 'all' | 'user' = 'all';

	if (targetKey === 'all' || targetKey === 'everyone') {
		const everyone = await db.select({ id: user.id }).from(user);
		recipientIds = everyone.map((row) => row.id);
	} else if (targetKey === 'random') {
		const [picked] = await db
			.select({ id: user.id, username: user.username })
			.from(user)
			.orderBy(sql`random()`)
			.limit(1);
		if (!picked) {
			return json({ error: 'No players found.' }, { status: 404 });
		}
		recipientIds = [picked.id];
		recipientNames = [picked.username];
		targetUserId = picked.id;
		targetUsername = picked.username;
		scope = 'user';
	} else {
		const [picked] = await db
			.select({ id: user.id, username: user.username })
			.from(user)
			.where(eq(user.username, targetRaw))
			.limit(1);
		if (!picked) {
			return json({ error: `Player "${targetRaw}" not found.` }, { status: 404 });
		}
		recipientIds = [picked.id];
		recipientNames = [picked.username];
		targetUserId = picked.id;
		targetUsername = picked.username;
		scope = 'user';
	}

	if (recipientIds.length === 0) {
		return json({ error: 'No recipients found.' }, { status: 404 });
	}

	await applyGrant(recipientIds, cash, gems);

	const loot = lootText(cash, gems);
	const details = {
		target: scope === 'all' ? 'everyone' : targetUsername,
		cash,
		gems,
		recipients: recipientIds.length,
		message: customMessage || null,
		effect
	};
	const entry = await writeAdminLog(admin.id, 'ABUSE_GRANT', targetUserId, JSON.stringify(details));

	const title =
		scope === 'all'
			? cash > 0 && gems > 0
				? 'Free Money & Gems!'
				: cash > 0
					? 'Free Money!'
					: 'Free Gems!'
			: cash > 0 && gems > 0
				? 'You Got Loot!'
				: cash > 0
					? 'You Got Cash!'
					: 'You Got Gems!';

	const message =
		customMessage ||
		`@${admin.username} dropped ${loot} on ${
			scope === 'all' ? 'every single player' : `@${targetUsername}`
		}.`;

	const event = {
		type: 'admin_abuse',
		id: entry?.id ?? Date.now(),
		kind: 'grant' as const,
		adminId: admin.id,
		adminUsername: admin.username,
		avatarUrl: getPublicUrl(admin.image),
		title,
		message,
		effect,
		duration: effect === 'none' ? 5_500 : 9_000,
		scope,
		targetUserId,
		targetUsername,
		cash,
		gems,
		recipients: recipientIds.length,
		sentAt: Date.now()
	};

	await redis.publish('admin:abuse', JSON.stringify(event));

	return json({
		success: true,
		event,
		recipients: recipientIds.length,
		recipientNames: recipientNames
	});
}
