// What the door of the app on the hub and a page with a key agree on: the questions, the errors and the shape of the shared
// documents. Both are built from this file, so a page and an app of other versions can tell that they differ.

/** The shape of the shared documents. Goes up when a page of before could lose something of a page of now. */
export const SHARED_FORMAT = 1;

/** Every question the door answers; anything else is refused. */
export const DOOR_CALLS = ['pair', 'measure', 'session', 'layouts', 'put-layouts', 'looks', 'looks-ops', 'widgets', 'widgets-ops', 'unpair'] as const;
export type DoorCall = (typeof DOOR_CALLS)[number];

/** Why the door said no. Always in an answer with status 200: what the cloud does with other statuses is not known. */
export const DOOR_ERRORS = ['not-paired', 'role', 'conflict', 'too-big', 'bad', 'busy', 'not-running', 'format', 'code', 'locked', 'full'] as const;
export type DoorError = (typeof DOOR_ERRORS)[number];

/** The largest change the door takes, as JSON: the same as at home. */
export const DOOR_LIMITS = { layouts: 4 * 1024 * 1024, looks: 512 * 1024, small: 4 * 1024, measure: 8 * 1024 * 1024 } as const;
