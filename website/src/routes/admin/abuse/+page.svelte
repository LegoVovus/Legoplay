<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Megaphone01Icon,
		GiftIcon,
		PartyIcon,
		Coins01Icon,
		Alert02Icon,
		Refresh01Icon,
		UserGroupIcon,
		SparklesIcon,
		CrownIcon,
		FlashIcon,
		Cancel01Icon,
		ArrowRight01Icon
	} from '@hugeicons/core-free-icons';
	import { USER_DATA } from '$lib/stores/user-data';
	import { hasFlag } from '$lib/data/flags';
	import { getPublicUrl } from '$lib/utils';
	import {
		pushAdminAbuseEvent,
		formatAbuseMoney,
		type AbuseEffect
	} from '$lib/stores/admin-abuse';

	type Player = {
		id: number;
		username: string;
		avatarUrl: string | null;
		cash: number;
		gems: number;
	};

	type AbuseEventRow = {
		id: number;
		action: 'ABUSE_BROADCAST' | 'ABUSE_GRANT';
		details: Record<string, unknown>;
		createdAt: number;
		targetUserId: number | null;
		adminId: number;
		adminUsername: string;
		avatarUrl: string | null;
	};

	const MAX_CASH = 50_000;
	const MAX_GEMS = 1_000;

	let playerCount = $state(0);
	let players = $state<Player[]>([]);
	let events = $state<AbuseEventRow[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let sending = $state<'broadcast' | 'grant' | null>(null);

	// Broadcast form
	let bcTitle = $state('');
	let bcMessage = $state('');
	let bcEffect = $state<AbuseEffect>('confetti');

	// Grant form
	let grantTarget = $state('all');
	let grantCash = $state(1000);
	let grantGems = $state(0);
	let grantEffect = $state<AbuseEffect>('rain');
	let grantMessage = $state('');

	const effects = [
		{ value: 'none' as AbuseEffect, label: 'Plain', icon: Cancel01Icon },
		{ value: 'confetti' as AbuseEffect, label: 'Confetti', icon: PartyIcon },
		{ value: 'rain' as AbuseEffect, label: 'Money rain', icon: Coins01Icon },
		{ value: 'shake' as AbuseEffect, label: 'Screenquake', icon: FlashIcon }
	];

	async function refresh() {
		try {
			const response = await fetch('/api/admin/abuse');
			if (!response.ok) throw new Error('Failed to load Admin Abuse data');
			const data = await response.json();
			playerCount = data.playerCount ?? 0;
			players = data.players ?? [];
			events = data.events ?? [];
			loadError = '';
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to load data';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (hasFlag($USER_DATA?.flags, 'IS_HEAD_ADMIN')) {
			refresh();
		} else {
			loading = false;
		}
	});

	function adminAvatar(): string | null {
		return getPublicUrl($USER_DATA?.image ?? null);
	}

	function preview() {
		pushAdminAbuseEvent({
			id: -Date.now(),
			kind: 'broadcast',
			adminId: Number($USER_DATA?.id ?? 0),
			adminUsername: $USER_DATA?.username ?? 'head_admin',
			avatarUrl: adminAvatar(),
			title: bcTitle.trim() || 'Admin Abuse preview',
			message: bcMessage.trim() || 'This is exactly how your message will hit every screen.',
			effect: bcEffect,
			duration: 7000,
			scope: 'all',
			targetUserId: null,
			targetUsername: null,
			cash: 0,
			gems: 0,
			sentAt: Date.now(),
			preview: true
		});
	}

	async function sendBroadcast() {
		if (!bcTitle.trim() || !bcMessage.trim()) {
			toast.error('Add a title and a message first');
			return;
		}
		sending = 'broadcast';
		try {
			const response = await fetch('/api/admin/abuse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					kind: 'broadcast',
					title: bcTitle,
					message: bcMessage,
					effect: bcEffect
				})
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error || 'Failed to send announcement');
			toast.success('Announcement is on every screen');
			await refresh();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to send announcement');
		} finally {
			sending = null;
		}
	}

	function grantPayload() {
		const cash = Math.floor(Number(grantCash) || 0);
		const gems = Math.floor(Number(grantGems) || 0);
		if (cash < 0 || gems < 0) {
			toast.error('Amounts cannot be negative');
			return null;
		}
		if (cash === 0 && gems === 0) {
			toast.error('Give at least some cash or gems');
			return null;
		}
		if (cash > MAX_CASH) {
			toast.error(`Cash is capped at ${formatAbuseMoney(MAX_CASH)} per grant`);
			return null;
		}
		if (gems > MAX_GEMS) {
			toast.error(`Gems are capped at ${MAX_GEMS} per grant`);
			return null;
		}
		return { cash, gems };
	}

	async function sendGrant() {
		const amounts = grantPayload();
		if (!amounts) return;

		sending = 'grant';
		try {
			const response = await fetch('/api/admin/abuse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					kind: 'grant',
					target: grantTarget,
					cash: amounts.cash,
					gems: amounts.gems,
					effect: grantEffect,
					message: grantMessage
				})
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error || 'Failed to give loot');
			const count = Number(data.recipients ?? 0);
			toast.success(`Loot delivered to ${count.toLocaleString('en-US')} player${count === 1 ? '' : 's'}`);
			await refresh();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to give loot');
		} finally {
			sending = null;
		}
	}

	function setCash(value: number) {
		grantCash = value;
	}

	function setGems(value: number) {
		grantGems = value;
	}

	function eventSummary(event: AbuseEventRow): string {
		const details = event.details ?? {};
		const parts: string[] = [];
		if (details.cash) parts.push(formatAbuseMoney(Number(details.cash)));
		if (details.gems) parts.push(`${Number(details.gems).toLocaleString('en-US')} gems`);
		if (details.target) parts.push(`→ ${String(details.target)}`);
		if (details.recipients) parts.push(`${Number(details.recipients).toLocaleString('en-US')} players`);
		if (details.title) parts.push(String(details.title));
		else if (details.message) parts.push(String(details.message));
		return parts.join(' · ') || '—';
	}

	function timeAgo(timestamp: number): string {
		const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.floor(hours / 24)}d ago`;
	}
</script>

<svelte:head>
	<title>Admin Abuse | LegoPlay</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if !$USER_DATA || !hasFlag($USER_DATA?.flags, 'IS_HEAD_ADMIN')}
	<div class="flex h-[80vh] items-center justify-center">
		<div class="text-center">
			<h1 class="text-2xl font-bold">Access Denied</h1>
			<p class="text-muted-foreground">This toy is reserved for head admins.</p>
		</div>
	</div>
{:else}
	<div class="container mx-auto space-y-6 p-4 md:p-6">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-destructive/10 p-2">
					<HugeiconsIcon icon={Megaphone01Icon} class="h-6 w-6 text-destructive" />
				</div>
				<div>
					<h1 class="text-3xl font-bold tracking-tight">Admin Abuse</h1>
					<p class="text-muted-foreground text-sm">
						Full-screen chaos for every player. Everything here is logged and rate-limited.
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<div class="rounded-lg border bg-muted/40 px-3 py-1.5 text-sm">
					<span class="text-muted-foreground">Players: </span>
					<span class="font-semibold">{playerCount.toLocaleString('en-US')}</span>
				</div>
				<Button variant="outline" size="sm" onclick={refresh} disabled={loading}>
					<HugeiconsIcon icon={Refresh01Icon} class="mr-1 h-4 w-4" />
					Refresh
				</Button>
			</div>
		</div>

		<div class="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
			<div class="flex items-start gap-3">
				<HugeiconsIcon icon={Alert02Icon} class="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
				<div class="text-sm">
					<p class="font-semibold text-destructive">Use your power responsibly</p>
					<p class="text-muted-foreground">
						Messages appear instantly for everyone who is online, with your avatar. Cash grants are
						capped at {formatAbuseMoney(MAX_CASH)} and gems at {MAX_GEMS} per action. Announcements: 30 /
						10 min. Grants: 30 / 10 min.
					</p>
				</div>
			</div>
		</div>

		{#if loadError}
			<div class="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
				{loadError}
			</div>
		{/if}

		<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
			<div class="space-y-6">
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<HugeiconsIcon icon={Megaphone01Icon} class="h-5 w-5 text-primary" />
							On-screen announcement
						</Card.Title>
						<Card.Description>
							A giant message with your avatar, dropped on top of whatever everyone is doing.
						</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<label class="text-sm font-medium" for="abuse-title">Title</label>
								<span class="text-muted-foreground text-xs">{bcTitle.length}/60</span>
							</div>
							<Input
								id="abuse-title"
								bind:value={bcTitle}
								maxlength={60}
								placeholder="THE SERVER IS NOW A CASINO"
							/>
						</div>

						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<label class="text-sm font-medium" for="abuse-message">Message</label>
								<span class="text-muted-foreground text-xs">{bcMessage.length}/280</span>
							</div>
							<Textarea
								id="abuse-message"
								bind:value={bcMessage}
								maxlength={280}
								rows={3}
								placeholder="Head admin is feeling generous. Go spend it all."
							/>
						</div>

						<div class="space-y-2">
							<p class="text-sm font-medium">Effect</p>
							<div class="flex flex-wrap gap-2">
								{#each effects as effect}
									<Button
										type="button"
										size="sm"
										variant={bcEffect === effect.value ? 'default' : 'outline'}
										onclick={() => (bcEffect = effect.value)}
									>
										<HugeiconsIcon icon={effect.icon} class="mr-1 h-4 w-4" />
										{effect.label}
									</Button>
								{/each}
							</div>
						</div>

						<div class="flex flex-wrap gap-2 pt-2">
							<Button type="button" variant="outline" onclick={preview}>
								<HugeiconsIcon icon={SparklesIcon} class="mr-1 h-4 w-4" />
								Preview locally
							</Button>
							<Button
								type="button"
								onclick={sendBroadcast}
								disabled={sending !== null || !bcTitle.trim() || !bcMessage.trim()}
							>
								<HugeiconsIcon icon={ArrowRight01Icon} class="mr-1 h-4 w-4" />
								{sending === 'broadcast' ? 'Sending...' : 'Send to everyone'}
							</Button>
						</div>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<HugeiconsIcon icon={GiftIcon} class="h-5 w-5 text-emerald-500" />
							Money &amp; gem cannon
						</Card.Title>
						<Card.Description>
							Hand out cash and gems to everyone, to one specific player, or to a random victim.
						</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div class="space-y-2">
							<label class="text-sm font-medium" for="grant-target">Recipients</label>
							<select
								id="grant-target"
								bind:value={grantTarget}
								class="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm"
							>
								<option value="all">Everyone ({playerCount})</option>
								<option value="random">Random player</option>
								{#each players as player (player.id)}
									<option value={player.username}>@{player.username}</option>
								{/each}
							</select>
							{#if grantTarget !== 'all' && grantTarget !== 'random'}
								{@const selected = players.find((player) => player.username === grantTarget)}
								{#if selected}
									<p class="text-muted-foreground text-xs">
										Current: {formatAbuseMoney(selected.cash)} · {selected.gems.toLocaleString('en-US')} gems
									</p>
								{/if}
							{/if}
						</div>

						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<label class="text-sm font-medium" for="grant-cash">Cash</label>
								<Input
									id="grant-cash"
									type="number"
									min="0"
									max={MAX_CASH}
									step="1"
									bind:value={grantCash}
								/>
								<div class="flex flex-wrap gap-1.5">
									{#each [100, 500, 1000, 5000, 10000] as amount}
										<Button
											type="button"
											size="sm"
											variant="outline"
											class="h-7 px-2 text-xs"
											onclick={() => setCash(amount)}
										>
											{formatAbuseMoney(amount)}
										</Button>
									{/each}
								</div>
							</div>

							<div class="space-y-2">
								<label class="text-sm font-medium" for="grant-gems">Gems</label>
								<Input
									id="grant-gems"
									type="number"
									min="0"
									max={MAX_GEMS}
									step="1"
									bind:value={grantGems}
								/>
								<div class="flex flex-wrap gap-1.5">
									{#each [10, 50, 100, 250, 500] as amount}
										<Button
											type="button"
											size="sm"
											variant="outline"
											class="h-7 px-2 text-xs"
											onclick={() => setGems(amount)}
										>
											{amount} gems
										</Button>
									{/each}
								</div>
							</div>
						</div>

						<div class="space-y-2">
							<label class="text-sm font-medium" for="grant-message">Custom message (optional)</label>
							<Input
								id="grant-message"
								bind:value={grantMessage}
								maxlength={280}
								placeholder="Go buy something stupid with it."
							/>
						</div>

						<div class="space-y-2">
							<p class="text-sm font-medium">Effect</p>
							<div class="flex flex-wrap gap-2">
								{#each effects as effect}
									<Button
										type="button"
										size="sm"
										variant={grantEffect === effect.value ? 'default' : 'outline'}
										onclick={() => (grantEffect = effect.value)}
									>
										<HugeiconsIcon icon={effect.icon} class="mr-1 h-4 w-4" />
										{effect.label}
									</Button>
								{/each}
							</div>
						</div>

						<div class="flex flex-wrap gap-2 pt-2">
							<Button type="button" onclick={sendGrant} disabled={sending !== null}>
								<HugeiconsIcon icon={grantTarget === 'all' ? CrownIcon : GiftIcon} class="mr-1 h-4 w-4" />
								{sending === 'grant'
									? 'Dropping loot...'
									: grantTarget === 'all'
										? 'Give everyone loot'
										: grantTarget === 'random'
											? 'Prank a random player'
											: `Give @${grantTarget} loot`}
							</Button>
						</div>
					</Card.Content>
				</Card.Root>
			</div>

			<div class="space-y-6">
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<HugeiconsIcon icon={UserGroupIcon} class="h-5 w-5 text-blue-500" />
							Recent abuse
						</Card.Title>
						<Card.Description>Last 25 actions from the audit log.</Card.Description>
					</Card.Header>
					<Card.Content>
						{#if loading}
							<p class="text-muted-foreground text-sm">Loading...</p>
						{:else if events.length === 0}
							<p class="text-muted-foreground text-sm">
								No abuse yet. The server is suspiciously peaceful.
							</p>
						{:else}
							<div class="space-y-2">
								{#each events as event (event.id)}
									<div class="flex items-start gap-3 rounded-lg border bg-muted/30 p-2.5">
										{#if event.avatarUrl}
											<img
												src={event.avatarUrl}
												alt={event.adminUsername}
												class="h-8 w-8 shrink-0 rounded-full object-cover"
											/>
										{:else}
											<div
												class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold uppercase"
											>
												{event.adminUsername.slice(0, 2)}
											</div>
										{/if}
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-1.5">
												<HugeiconsIcon
													icon={event.action === 'ABUSE_GRANT' ? GiftIcon : Megaphone01Icon}
													class="h-3.5 w-3.5 shrink-0 text-primary"
												/>
												<p class="truncate text-sm font-medium">
													{event.action === 'ABUSE_GRANT' ? 'Loot grant' : 'Announcement'}
												</p>
											</div>
											<p class="text-muted-foreground line-clamp-2 text-xs">
												{eventSummary(event)}
											</p>
											<p class="text-muted-foreground text-[11px]">
												@{event.adminUsername} · {timeAgo(event.createdAt)}
											</p>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<HugeiconsIcon icon={Coins01Icon} class="h-5 w-5 text-amber-500" />
							Economy snapshot
						</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-2 text-sm">
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Registered players</span>
							<span class="font-semibold">{playerCount.toLocaleString('en-US')}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Richest wallet</span>
							<span class="font-semibold">
								{formatAbuseMoney(Math.max(0, ...players.map((player) => player.cash))) }
							</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Most gems</span>
							<span class="font-semibold">
								{Math.max(0, ...players.map((player) => player.gems)).toLocaleString('en-US')}
							</span>
						</div>
					</Card.Content>
				</Card.Root>
			</div>
		</div>
	</div>
{/if}
