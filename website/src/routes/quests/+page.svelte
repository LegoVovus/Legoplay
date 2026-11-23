<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import SEO from '$lib/components/self/SEO.svelte';
	import { toast } from 'svelte-sonner';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { GiftIcon, Clock01Icon, Tick01Icon, Loading03Icon, GemIcon, Coins01Icon } from '@hugeicons/core-free-icons';
	import { USER_DATA } from '$lib/stores/user-data';
	import { fetchPortfolioSummary } from '$lib/stores/portfolio-data';

	interface Quest {
		id: number;
		slot: number;
		difficulty: 'easy' | 'medium' | 'hard';
		questType: string;
		label: string;
		description: string;
		target: number;
		progress: number;
		completed: boolean;
		claimed: boolean;
		claimedAt: string | null;
		reward: { cash: number; gems: number };
	}

	interface Summary {
		claimedCount: number;
		totalCount: number;
		totalCash: number;
		totalGems: number;
		allClaimed: boolean;
	}

	let quests = $state<Quest[]>([]);
	let summary = $state<Summary | null>(null);
	let resetsAt = $state<string | null>(null);
	let loading = $state(true);
	let claimingSlot = $state<number | null>(null);
	let now = $state(Date.now());

	const difficultyLabel: Record<string, string> = {
		easy: 'Easy',
		medium: 'Medium',
		hard: 'Hard'
	};

	const difficultyClass: Record<string, string> = {
		easy: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30',
		medium: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
		hard: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
	};

	function formatCash(n: number) {
		return '$' + n.toLocaleString('en-US');
	}

	function timeUntil(iso: string | null) {
		if (!iso) return '';
		const ms = new Date(iso).getTime() - now;
		if (ms <= 0) return 'soon';
		const totalSec = Math.floor(ms / 1000);
		const h = Math.floor(totalSec / 3600);
		const m = Math.floor((totalSec % 3600) / 60);
		const s = totalSec % 60;
		if (h > 0) return `${h}h ${m}m`;
		if (m > 0) return `${m}m ${s}s`;
		return `${s}s`;
	}

	async function loadQuests() {
		loading = true;
		try {
			const res = await fetch('/api/quests');
			if (!res.ok) {
				const d = await res.json().catch(() => ({}));
				throw new Error(d.message || 'Failed to load quests');
			}
			const d = await res.json();
			quests = d.quests ?? [];
			summary = d.summary ?? null;
			resetsAt = d.resetsAt ?? null;
		} catch (e: any) {
			toast.error(e?.message || 'Failed to load quests');
		} finally {
			loading = false;
		}
	}

	async function claim(slot: number) {
		if (claimingSlot !== null) return;
		claimingSlot = slot;
		try {
			const res = await fetch('/api/quests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ slot })
			});
			const d = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(d.message || 'Failed to claim quest');
			const cash = d.reward?.cash ?? 0;
			const gems = d.reward?.gems ?? 0;
			const rewardText = gems > 0 ? `${formatCash(cash)} + ${gems} gems` : formatCash(cash);
			toast.success(`Claimed ${rewardText}!`);
			await Promise.all([loadQuests(), fetchPortfolioSummary()]);
		} catch (e: any) {
			toast.error(e?.message || 'Failed to claim quest');
		} finally {
			claimingSlot = null;
		}
	}

	onMount(() => {
		if ($USER_DATA) loadQuests();
		else loading = false;
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});
</script>

<SEO title="Daily Quests" description="Complete daily quests to earn cash and gems." />

<div class="container mx-auto max-w-5xl px-4 py-8">
	<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="flex items-center gap-2 text-3xl font-bold">
				<HugeiconsIcon icon={GiftIcon} class="h-8 w-8" />
				Daily Quests
			</h1>
			<p class="text-muted-foreground mt-1">
				Complete 3 quests every day. Harder quests give bigger rewards.
			</p>
		</div>
		{#if resetsAt}
			<div class="text-muted-foreground flex items-center gap-2 text-sm">
				<HugeiconsIcon icon={Clock01Icon} class="h-4 w-4" />
				<span>Resets in {timeUntil(resetsAt)}</span>
			</div>
		{/if}
	</div>

	{#if !$USER_DATA}
		<Card.Root>
			<Card.Content class="py-10 text-center">
				<p class="text-muted-foreground">Sign in to view and complete daily quests.</p>
			</Card.Content>
		</Card.Root>
	{:else if loading}
		<div class="grid gap-4 md:grid-cols-3">
			{#each [1, 2, 3] as _}
				<Card.Root>
					<Card.Content class="py-10 text-center text-muted-foreground">Loading...</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else}
		{#if summary}
			<div class="mb-6 grid gap-3 sm:grid-cols-3">
				<Card.Root>
					<Card.Content class="py-4">
						<div class="text-muted-foreground text-xs uppercase tracking-wide">Claimed Today</div>
						<div class="text-2xl font-semibold">{summary.claimedCount}/{summary.totalCount}</div>
					</Card.Content>
				</Card.Root>
				<Card.Root>
					<Card.Content class="py-4">
						<div class="text-muted-foreground text-xs uppercase tracking-wide">Daily Cash</div>
						<div class="text-2xl font-semibold">{formatCash(summary.totalCash)}</div>
					</Card.Content>
				</Card.Root>
				<Card.Root>
					<Card.Content class="py-4">
						<div class="text-muted-foreground text-xs uppercase tracking-wide">Daily Gems</div>
						<div class="text-2xl font-semibold">{summary.totalGems}</div>
					</Card.Content>
				</Card.Root>
			</div>
		{/if}

		<div class="grid gap-4 md:grid-cols-3">
			{#each quests as quest (quest.slot)}
				<Card.Root class={quest.claimed ? 'opacity-80' : ''}>
					<Card.Header class="pb-3">
						<div class="flex items-center justify-between gap-2">
							<span class={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${difficultyClass[quest.difficulty] || ''}`}>
								{difficultyLabel[quest.difficulty] || quest.difficulty}
							</span>
							{#if quest.claimed}
								<span class="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
									<HugeiconsIcon icon={Tick01Icon} class="h-4 w-4" /> Claimed
								</span>
							{/if}
						</div>
						<Card.Title class="mt-2 text-lg">{quest.label}</Card.Title>
						<Card.Description>{quest.description}</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div>
							<div class="mb-1 flex items-center justify-between text-sm">
								<span class="text-muted-foreground">Progress</span>
								<span class="font-medium">{Math.min(quest.progress, quest.target).toLocaleString('en-US')} / {quest.target.toLocaleString('en-US')}</span>
							</div>
							<Progress value={Math.min(100, (quest.progress / Math.max(1, quest.target)) * 100)} />
						</div>

						<div class="flex flex-wrap gap-2 text-sm">
							<div class="bg-muted inline-flex items-center gap-1 rounded-md px-2 py-1">
								<HugeiconsIcon icon={Coins01Icon} class="h-4 w-4" />
								<span>{formatCash(quest.reward.cash)}</span>
							</div>
							{#if quest.reward.gems > 0}
								<div class="bg-muted inline-flex items-center gap-1 rounded-md px-2 py-1">
									<HugeiconsIcon icon={GemIcon} class="h-4 w-4" />
									<span>{quest.reward.gems} gems</span>
								</div>
							{/if}
						</div>

						{#if quest.claimed}
							<Button class="w-full" variant="outline" disabled>
								<HugeiconsIcon icon={Tick01Icon} class="mr-2 h-4 w-4" /> Claimed
							</Button>
						{:else if quest.completed}
							<Button class="w-full" onclick={() => claim(quest.slot)} disabled={claimingSlot !== null}>
								{#if claimingSlot === quest.slot}
									<HugeiconsIcon icon={Loading03Icon} class="mr-2 h-4 w-4 animate-spin" /> Claiming...
								{:else}
									<HugeiconsIcon icon={GiftIcon} class="mr-2 h-4 w-4" /> Claim Reward
								{/if}
							</Button>
						{:else}
							<Button class="w-full" variant="secondary" disabled>
								In Progress
							</Button>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
