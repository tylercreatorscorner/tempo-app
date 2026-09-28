export type CreatorHubItemKind = 'video' | 'reading' | 'link' | 'acknowledgement';

export type CreatorHubEnrollmentItem = {
  item_id: string;
  item_version_id: string;
  kind: CreatorHubItemKind;
  required: boolean;
  completed_at: string | null;
  accepted_at: string | null;
};

export type CreatorHubEnrollmentStatus = 'pending' | 'in_progress' | 'complete';

export type CreatorHubCompletion = {
  requiredTotal: number;
  requiredComplete: number;
  optionalTotal: number;
  optionalComplete: number;
  requirementsComplete: boolean;
  canUnlock: boolean;
};

/** The enrollment snapshot, not the current brand configuration, controls unlock. */
export function getCreatorHubCompletion(
  status: CreatorHubEnrollmentStatus,
  snapshotFinalizedAt: string | null,
  items: readonly CreatorHubEnrollmentItem[],
): CreatorHubCompletion {
  const isDone = (item: CreatorHubEnrollmentItem) =>
    item.kind === 'acknowledgement' ? item.accepted_at !== null : item.completed_at !== null;
  const required = items.filter((item) => item.required);
  const optional = items.filter((item) => !item.required);
  const requiredComplete = required.filter(isDone).length;
  const requirementsComplete = snapshotFinalizedAt !== null
    && required.length > 0
    && requiredComplete === required.length;

  return {
    requiredTotal: required.length,
    requiredComplete,
    optionalTotal: optional.length,
    optionalComplete: optional.filter(isDone).length,
    requirementsComplete,
    canUnlock: status === 'complete' && requirementsComplete,
  };
}
