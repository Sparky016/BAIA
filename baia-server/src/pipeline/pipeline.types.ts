export interface StartPipelineBody {
  instructions: string;
  repoUrl?: string;
  repoProvider?: 'github' | 'azure';
  credentialsRef?: string;
  confluenceCredentialsRef?: string;
}

export interface StartPipelineResult {
  accepted: boolean;
  runId: string;
}
