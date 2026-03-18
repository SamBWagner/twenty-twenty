export const SESSION_PHASES = ["review", "ideation", "action", "closed"] as const;
export type SessionPhase = (typeof SESSION_PHASES)[number];

export const ITEM_TYPES = ["good", "bad"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const VOTE_VALUES = [1, -1] as const;
export type VoteValue = (typeof VOTE_VALUES)[number];

export const REVIEW_STATUSES = ["did_nothing", "actioned", "disagree"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const MEMBER_ROLES = ["owner", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const PARTICIPANT_ROLES = ["member", "guest"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
