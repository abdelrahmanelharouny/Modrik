export interface RequirementApprovalCandidate {
  refId: string;
  verifyStatus: string;
  links: { id: string }[];
}
export declare function validateElicitationApproval(questions: unknown[]): string | null;
export declare function validateRequirementApproval(requirements: RequirementApprovalCandidate[]): string | null;
export declare function validateConflictApproval(conflicts: { status: string }[]): string | null;
export declare function validateStoryApproval(storyCount: number): string | null;
