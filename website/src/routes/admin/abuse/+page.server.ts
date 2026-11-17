import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { ServerLoad } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { hasFlag } from '$lib/data/flags';

export const load: ServerLoad = async ({ request }) => {
	const authSession = await auth.api.getSession({ headers: request.headers });

	if (!authSession?.user) {
		throw redirect(302, '/');
	}

	const [currentUser] = await db
		.select({ flags: user.flags })
		.from(user)
		.where(eq(user.id, Number(authSession.user.id)))
		.limit(1);

	// This whole page is head-admin only.
	if (!hasFlag(currentUser?.flags, 'IS_HEAD_ADMIN')) {
		throw redirect(302, '/');
	}

	return {};
};
