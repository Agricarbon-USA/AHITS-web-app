/**
 * One definition per population. Every count, filter and picker reads its
 * population from here rather than re-spelling the rule — "available" meaning
 * three different things on three screens is RC-3 in the 2026-10-05 screening.
 *
 * **This file is a stub on purpose.** PR-2 ("One vocabulary for numbers") fills it
 * out with the full set of Prisma `where` fragments and their SQL twins
 * (`ACTIVE_UNIT`, `PICKABLE_UNIT`, `LIVE_KIT_ITEM`, `OPEN_TASK`, `LIVE_VEHICLE`,
 * `ACTIVE_HUB`, `ACTIVE_USER`, `OPEN_ALERT`). PR-1b adds only what it needs, here
 * rather than inline in the route, because decision **D-n** names this file as the
 * single home for `PICKABLE_STATUSES` — and the whole point of D-n is that one
 * edit widens pickability everywhere at once.
 */

/**
 * The unit statuses a picker may offer — i.e. the ones the server will accept on
 * a kit/reservation write.
 *
 * **AVAILABLE only, deliberately (D-n).** The schema's comment on `IN_TRANSIT`
 * says a returned-but-unconfirmed unit "can still be re-deployed", and D-e makes
 * that the intended behaviour — but no write path implements it yet. Widening
 * this list before `pickUnit` exists would make every picker offer units the
 * server then refuses, which is worse than not offering them: the operator picks
 * gear, gets an error, and learns not to trust the list.
 *
 * **PR-3a widens this to `['AVAILABLE', 'IN_TRANSIT']` in the same commit that
 * makes the server accept an IN_TRANSIT pick and complete its HUB_RETURN link.**
 * Not before, and not in a commit of its own.
 */
export const PICKABLE_STATUSES = ['AVAILABLE'] as const

export type PickableStatus = (typeof PICKABLE_STATUSES)[number]
