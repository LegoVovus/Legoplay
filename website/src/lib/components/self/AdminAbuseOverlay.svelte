<script lang="ts">
	import {
		ADMIN_ABUSE_QUEUE,
		ADMIN_ABUSE_REACTIONS,
		ABUSE_REACTION_EMOJIS,
		dismissAdminAbuse,
		formatAbuseMoney,
		reactToAdminAbuse,
		type AbuseEffect,
		type AbuseReactionEmoji,
		type AdminAbuseEvent
	} from '$lib/stores/admin-abuse';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Megaphone01Icon,
		Cancel01Icon,
		Coins01Icon,
		GemIcon,
		GiftIcon,
		PartyIcon
	} from '@hugeicons/core-free-icons';

	type Particle = {
		key: number;
		left: number;
		delay: number;
		duration: number;
		rotate: number;
		drift: number;
		color: string;
		size: number;
		emoji: string;
	};

	const CONFETTI_COLORS = [
		'#f43f5e',
		'#f59e0b',
		'#22c55e',
		'#3b82f6',
		'#a855f7',
		'#ec4899',
		'#eab308',
		'#06b6d4'
	];
	const MONEY_EMOJIS = ['💰', '💎', '🪙', '💵', '🤑'];

	let current: AdminAbuseEvent | null = $derived($ADMIN_ABUSE_QUEUE[0] ?? null);
	let particles = $state<Particle[]>([]);
	let progress = $state(1);
	let currentReactions = $derived(
		current ? $ADMIN_ABUSE_REACTIONS[current.id] ?? { counts: { '?': 0, '?': 0, '??': 0 }, mine: null } : null
	);

	async function react(emoji: AbuseReactionEmoji) {
		if (!current || current.preview) return;
		await reactToAdminAbuse(current.id, emoji);
	}

	function makeParticles(effect: AbuseEffect): Particle[] {
		if (effect !== 'confetti' && effect !== 'rain') return [];
		const amount = effect === 'rain' ? 28 : 70;
		return Array.from({ length: amount }, (_, index) => ({
			key: index,
			left: Math.random() * 100,
			delay: Math.random() * 1.1,
			duration: 2.6 + Math.random() * 2.2,
			rotate: Math.random() * 720 - 360,
			drift: Math.random() * 180 - 90,
			color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
			size: 5 + Math.random() * 7,
			emoji: MONEY_EMOJIS[index % MONEY_EMOJIS.length]
		}));
	}

	$effect(() => {
		const event = current;
		if (!event) {
			particles = [];
			return;
		}

		particles = makeParticles(event.effect);
		progress = 1;

		const startedAt = Date.now();
		const duration = Math.max(2500, event.duration || 8000);

		const tick = setInterval(() => {
			progress = Math.max(0, 1 - (Date.now() - startedAt) / duration);
		}, 80);

		const timer = setTimeout(() => dismissAdminAbuse(event.id), duration);

		const onKey = (keyboardEvent: KeyboardEvent) => {
			if (keyboardEvent.key === 'Escape') dismissAdminAbuse(event.id);
		};
		window.addEventListener('keydown', onKey);

		return () => {
			clearInterval(tick);
			clearTimeout(timer);
			window.removeEventListener('keydown', onKey);
		};
	});

	function effectLabel(effect: AbuseEffect): string | null {
		if (effect === 'confetti') return 'Confetti party';
		if (effect === 'rain') return 'Money rain';
		if (effect === 'shake') return 'Screenquake';
		return null;
	}
</script>

{#if current}
	<div
		class="fixed inset-0 z-[300] flex items-center justify-center overflow-hidden p-4"
		role="alertdialog"
		aria-live="assertive"
		aria-label="Admin announcement"
	>
		<button
			type="button"
			class="absolute inset-0 z-0 h-full w-full cursor-default bg-black/75 backdrop-blur-sm"
			onclick={() => dismissAdminAbuse(current?.id)}
			aria-label="Dismiss announcement"
		></button>

		{#if current.effect === 'confetti'}
			{#each particles as particle (particle.key)}
				<span
					class="pointer-events-none absolute top-0 z-[1] block rounded-[1px]"
					style="left:{particle.left}%;width:{particle.size}px;height:{particle.size * 1.7}px;background:{particle.color};animation:aa-fall {particle.duration}s linear {particle.delay}s forwards;--aa-x:{particle.drift}px;--aa-rot:{particle.rotate}deg;"
				></span>
			{/each}
		{:else if current.effect === 'rain'}
			{#each particles as particle (particle.key)}
				<span
					class="pointer-events-none absolute top-0 z-[1] select-none"
					style="left:{particle.left}%;font-size:{particle.size * 2.4}px;animation:aa-fall {particle.duration}s linear {particle.delay}s forwards;--aa-x:{particle.drift}px;--aa-rot:{particle.rotate}deg;"
				>
					{particle.emoji}
				</span>
			{/each}
		{/if}

		<div
			class="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-primary/40 bg-card text-card-foreground shadow-2xl"
			style="animation:{current.effect === 'shake'
				? 'aa-shake 0.65s ease-in-out 2'
				: 'aa-in 0.35s ease-out both'}"
		>
			<div class="h-1.5 w-full bg-gradient-to-r from-primary via-fuchsia-500 to-amber-400"></div>

			<div class="relative p-6 sm:p-8">
				<button
					type="button"
					class="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
					onclick={() => dismissAdminAbuse(current?.id)}
					aria-label="Close"
				>
					<HugeiconsIcon icon={Cancel01Icon} class="h-4 w-4" />
				</button>

				<div class="flex items-center gap-4">
					<div class="relative shrink-0">
						<div class="absolute inset-0 animate-pulse rounded-full bg-primary/40 blur-md"></div>
						{#if current.avatarUrl}
							<img
								src={current.avatarUrl}
								alt={current.adminUsername}
								class="relative h-16 w-16 rounded-full border-2 border-primary/60 object-cover sm:h-20 sm:w-20"
							/>
						{:else}
							<div
								class="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/60 bg-muted text-xl font-black uppercase sm:h-20 sm:w-20"
							>
								{current.adminUsername?.slice(0, 2) || 'AD'}
							</div>
						{/if}
					</div>

					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<span
								class="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary-foreground"
							>
								<HugeiconsIcon icon={Megaphone01Icon} class="h-3 w-3" />
								Admin Abuse
							</span>
							{#if effectLabel(current.effect)}
								<span
									class="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
								>
									<HugeiconsIcon icon={PartyIcon} class="h-3 w-3" />
									{effectLabel(current.effect)}
								</span>
							{/if}
						</div>
						<p class="mt-1 truncate text-sm text-muted-foreground">@{current.adminUsername}</p>
					</div>
				</div>

				<div class="mt-5 flex items-start gap-3">
					<HugeiconsIcon
						icon={current.kind === 'grant' ? GiftIcon : Megaphone01Icon}
						class="mt-1 h-5 w-5 shrink-0 text-primary"
					/>
					<div class="min-w-0">
						<h2 class="text-2xl font-black leading-tight sm:text-3xl">{current.title}</h2>
						<p class="mt-2 whitespace-pre-line text-base text-muted-foreground sm:text-lg">
							{current.message}
						</p>
					</div>
				</div>

				{#if current.kind === 'grant' && (current.cash > 0 || current.gems > 0)}
					<div class="mt-5 flex flex-wrap gap-2">
						{#if current.cash > 0}
							<div
								class="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-bold text-emerald-500"
							>
								<HugeiconsIcon icon={Coins01Icon} class="h-4 w-4" />
								+{formatAbuseMoney(current.cash)}
							</div>
						{/if}
						{#if current.gems > 0}
							<div
								class="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-sm font-bold text-violet-400"
							>
								<HugeiconsIcon icon={GemIcon} class="h-4 w-4" />
								+{current.gems.toLocaleString('en-US')} gems
							</div>
						{/if}
						{#if current.recipients && current.recipients > 1}
							<div
								class="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-1.5 text-sm font-semibold text-muted-foreground"
							>
								{current.recipients.toLocaleString('en-US')} players
							</div>
						{/if}
					</div>
				{/if}

				{#if !current.preview}
					<div class="mt-5 flex flex-wrap gap-2">
						{#each ABUSE_REACTION_EMOJIS as emoji}
							<button
								type="button"
								class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition {currentReactions?.mine === emoji
									? 'border-primary bg-primary/15 text-primary'
									: 'border-border bg-muted/60 text-foreground hover:border-primary/40 hover:bg-muted'} disabled:cursor-not-allowed disabled:opacity-60"
								onclick={() => react(emoji)}
								disabled={!!currentReactions?.mine}
								aria-label={`React with ${emoji}`}
							>
								<span class="leading-none">{emoji}</span>
								<span class="tabular-nums text-muted-foreground">{currentReactions?.counts[emoji] ?? 0}</span>
							</button>
						{/each}
					</div>
				{/if}

				<div class="mt-6 flex items-center justify-between gap-3 text-xs text-muted-foreground">
					<span>{current.scope === 'all' ? 'Broadcast to every player' : 'Personal delivery'}</span>
					<span>closing in {Math.max(1, Math.ceil((current.duration * progress) / 1000))}s</span>
				</div>
				<div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="h-full rounded-full bg-primary transition-[width] duration-100 ease-linear"
						style="width:{(progress * 100).toFixed(1)}%"
					></div>
				</div>
			</div>
		</div>
	</div>
{/if}
