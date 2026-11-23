import { auth } from '/auth';
import { error, json } from '@sveltejs/kit';
import { db } from '/server/db';
import { dailyQuestProgress, lotteryTicket, predictionBet, transaction, user } from '/server/db/schema';
import { and, count, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './';
import { createNotification } from '/server/notification';

type QuestDef = {
	type: string;
	label: string;
	description: string;
	target: number;
};

type SlotDef = {
	slot: number;
	difficulty: 'easy' | 'medium' | 'hard';
	rewardCash: number;
	rewardGems: number;
	pool: QuestDef[];
};

const SLOTS: SlotDef[] = [
	{
		slot: 1,
		difficulty: 'easy',
		rewardCash: 10000,
		rewardGems: 0,
		pool: [
			{ type: 'trades', label: 'First Steps', description: 'Complete {target} trades', target: 3 },
			{ type: 'arcade_games', label: 'Arcade Warmup', description: 'Play {target} arcade games', target: 5 },
			{ type: 'predictions', label: 'Lucky Guess', description: 'Place {target} prediction bets', target: 1 },
			{ type: 'lottery_tickets', label: 'Ticket Grab', description: 'Buy {target} lottery tickets', target: 3 }
		]
	},
	{
		slot: 2,
		difficulty: 'medium',
		rewardCash: 40000,
		rewardGems: 100,
		pool: [
			{ type: 'trades', label: 'Active Trader', description: 'Complete {target} trades', target: 10 },
			{ type: 'arcade_games', label: 'Arcade Grinder', description: 'Play {target} arcade games', target: 15 },
			{ type: 'volume_traded', label: 'Volume Pusher', description: 'Trade  in total volume', target: 25000 },
			{ type: 'predictions', label: 'Oracle', description: 'Place {target} prediction bets', target: 3 }
		]
	},
	{
		slot: 3,
		difficulty: 'hard',
		rewardCash: 80000,
		rewardGems: 150,
		pool: [
			{ type: 'trades', label: 'Market Maker', description: 'Complete {target} trades', target: 25 },
			{ type: 'arcade_games', label: 'Arcade Marathon', description: 'Play {target} arcade games', target: 30 },
			{ type: 'volume_traded', label: 'Whale Moves', description: 'Trade  in total volume', target: 75000 },
			{ type: 'predictions', label: 'Prophet', description: 'Place {target} prediction bets', target: 8 }
		]
	}
];

function utcDay(now = new Date()): string {
	return now.toISOString().slice(0, 10);
}

function nextUtcMidnight(now = new Date()): string {
	const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
	return next.toISOString();
}

function hashString(input: string): number {
	let h = 2166136261;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function pickQuest(slotDef: SlotDef, day: string): QuestDef {
	const idx = hashString(`${day}:${slotDef.slot}`) % slotDef.pool.length;
	return slotDef.pool[idx];
}

function formatTarget(type: string, target: number): string {
	if (type === 'volume_traded') return target.toLocaleString('en-US');
	return String(target);
}

async function getRawCounts(userId: number, userData: any) {
	const [tradeRes] = await db
		.select({
			trades: count(),
			volume: sql<string>`COALESCE(SUM(CASE WHEN ${transaction.type} IN ('BUY','SELL') THEN CAST(${transaction.totalBaseCurrencyAmount} AS NUMERIC) ELSE 0 END), 0)`
		})
		.from(transaction)
		.where(eq(transaction.userId, userId));

	const [lotteryRes] = await db
		.select({ tickets: sql<string>`COALESCE(SUM(${lotteryTicket.quantity}), 0)` })
		.from(lotteryTicket)
		.where(eq(lotteryTicket.userId, userId));

	const [predRes] = await db
		.select({ cnt: count() })
		.from(predictionBet)
		.where(eq(predictionBet.userId, userId));

	return {
		trades: Number(tradeRes?.trades ?? 0),
		arcade_games: Number(userData?.totalArcadeGamesPlayed ?? 0),
		volume_traded: Math.floor(Number(tradeRes?.volume ?? 0)),
		lottery_tickets: Number(lotteryRes?.tickets ?? 0),
		predictions: Number(predRes?.cnt ?? 0)
	} as Record<string, number>;
}

function getCurrentValue(raw: Record<string, number>, type: string): number {
	return Math.max(0, Math.floor(raw[type] ?? 0));
}

async function ensureDailyQuests(userId: number, day: string, raw: Record<string, number>) {
	const existing = await db
		.select()
		.from(dailyQuestProgress)
		.where(and(eq(dailyQuestProgress.userId, userId), eq(dailyQuestProgress.day, day)));

	const bySlot = new Map(existing.map((r) => [r.slot, r]));
	const result = [] as typeof existing;

	for (const slotDef of SLOTS) {
		const found = bySlot.get(slotDef.slot);
		if (found) {
			result.push(found);
			continue;
		}
		const quest = pickQuest(slotDef, day);
		const baseline = getCurrentValue(raw, quest.type);
		const [inserted] = await db
			.insert(dailyQuestProgress)
			.values({
				userId,
				day,
				slot: slotDef.slot,
				questType: quest.type,
				target: quest.target,
				rewardCash: String(slotDef.rewardCash),
				rewardGems: slotDef.rewardGems,
				baseline,
				claimed: false
			})
			.onConflictDoNothing()
			.returning();
		if (inserted) {
			result.push(inserted);
		} else {
			const [row] = await db
				.select()
				.from(dailyQuestProgress)
				.where(
					and(
						eq(dailyQuestProgress.userId, userId),
						eq(dailyQuestProgress.day, day),
						eq(dailyQuestProgress.slot, slotDef.slot)
					)
				)
				.limit(1);
			if (row) result.push(row);
		}
	}

	return result.sort((a, b) => a.slot - b.slot);
}

function decorate(rows: any[], day: string, raw: Record<string, number>) {
	return rows.map((row) => {
		const slotDef = SLOTS.find((s) => s.slot === row.slot)!;
		const quest = slotDef.pool.find((q) => q.type === row.questType) ?? pickQuest(slotDef, day);
		const current = getCurrentValue(raw, row.questType);
		const progress = Math.max(0, Math.min(row.target, current - row.baseline));
		const completed = progress >= row.target;
		const description = quest.description.replace('{target}', formatTarget(row.questType, row.target));
		return {
			id: row.id,
			slot: row.slot,
			difficulty: slotDef.difficulty,
			questType: row.questType,
			label: quest.label,
			description,
			target: row.target,
			progress,
			completed,
			claimed: row.claimed,
			claimedAt: row.claimedAt,
			reward: {
				cash: Number(row.rewardCash),
				gems: Number(row.rewardGems)
			}
		};
	});
}

export const GET: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) throw error(401, 'Unauthorized');

	const userId = Number(session.user.id);
	const now = new Date();
	const day = utcDay(now);

	const [userRow] = await db
		.select({
			id: user.id,
			totalArcadeGamesPlayed: user.totalArcadeGamesPlayed
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (!userRow) throw error(404, 'User not found');

	const raw = await getRawCounts(userId, userRow);
	const rows = await ensureDailyQuests(userId, day, raw);
	const quests = decorate(rows, day, raw);

	const totalCash = quests.reduce((s, q) => s + q.reward.cash, 0);
	const totalGems = quests.reduce((s, q) => s + q.reward.gems, 0);
	const claimedCount = quests.filter((q) => q.claimed).length;

	return json({
		day,
		resetsAt: nextUtcMidnight(now),
		quests,
		summary: {
			claimedCount,
			totalCount: quests.length,
			totalCash,
			totalGems,
			allClaimed: quests.length > 0 && claimedCount === quests.length
		}
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) throw error(401, 'Unauthorized');

	const userId = Number(session.user.id);
	const body = await request.json().catch(() => ({}));
	const slot = Number(body?.slot);
	if (!Number.isInteger(slot) || slot < 1 || slot > 3) {
		throw error(400, 'Invalid slot');
	}

	const now = new Date();
	const day = utcDay(now);

	const [userRow] = await db
		.select({
			id: user.id,
			totalArcadeGamesPlayed: user.totalArcadeGamesPlayed
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (!userRow) throw error(404, 'User not found');

	const raw = await getRawCounts(userId, userRow);
	const rows = await ensureDailyQuests(userId, day, raw);
	const row = rows.find((r) => r.slot === slot);
	if (!row) throw error(404, 'Quest not found');

	if (row.claimed) {
		throw error(400, 'Quest already claimed');
	}

	const current = getCurrentValue(raw, row.questType);
	const progress = Math.max(0, current - row.baseline);
	if (progress < row.target) {
		throw error(400, 'Quest not completed yet');
	}

	const cash = Number(row.rewardCash);
	const gems = Number(row.rewardGems);

	const updated = await db.transaction(async (tx) => {
		const [claimedRow] = await tx
			.update(dailyQuestProgress)
			.set({ claimed: true, claimedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(dailyQuestProgress.id, row.id),
					eq(dailyQuestProgress.userId, userId),
					eq(dailyQuestProgress.claimed, false)
				)
			)
			.returning({ id: dailyQuestProgress.id });

		if (!claimedRow) {
			throw error(400, 'Quest already claimed');
		}

		await tx
			.update(user)
			.set({
				baseCurrencyBalance: sql`CAST(${user.baseCurrencyBalance} AS NUMERIC) + ${cash}`,
				gems: sql`${user.gems} + ${gems}`,
				updatedAt: new Date()
			})
			.where(eq(user.id, userId));

		return claimedRow;
	});

	const slotDef = SLOTS.find((s) => s.slot === slot)!;
	const quest = slotDef.pool.find((q) => q.type === row.questType) ?? pickQuest(slotDef, day);
	const rewardLabel = gems > 0 ? `${cash.toLocaleString('en-US')} + ${gems} gems` : `${cash.toLocaleString('en-US')}`;

	await createNotification(
		String(userId),
		'SYSTEM',
		'Daily Quest Completed!',
		`${quest.label}: ${rewardLabel}`,
		'/quests'
	).catch(() => {});

	return json({
		success: true,
		slot,
		reward: { cash, gems },
		quest: {
			label: quest.label,
			difficulty: slotDef.difficulty
		}
	});
};
