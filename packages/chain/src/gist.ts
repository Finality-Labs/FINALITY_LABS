/**
 * GitHub Gist Upload Utility for ERC-8004 Agent Registration
 * Uploads registration.json to a public GitHub Gist and returns the raw URL
 * 
 * Requires GITHUB_TOKEN environment variable with 'gist' scope
 * Create token at: https://github.com/settings/tokens
 */

interface GitHubErrorResponse {
  message: string;
  documentation_url?: string;
}

export interface GistUploadResult {
  /** Raw URL to the gist file (e.g., https://gist.githubusercontent.com/user/gist-id/raw/registration.json) */
  rawUrl: string;
  /** Gist HTML URL for viewing */
  htmlUrl: string;
  /** Gist ID */
  id: string;
  /** Created timestamp */
  createdAt: string;
}

export interface GistError extends Error {
  status?: number;
  response?: GitHubErrorResponse;
}

/**
 * Upload agent registration JSON to a public GitHub Gist
 * @param registrationJson The agent registration JSON object
 * @param githubToken GitHub Personal Access Token with 'gist' scope
 * @param filename Optional filename (default: 'registration.json')
 * @returns Gist upload result with raw URL
 */
export async function uploadRegistrationToGist(
  registrationJson: object,
  githubToken: string,
  filename: string = 'registration.json'
): Promise<GistUploadResult> {
  const content = JSON.stringify(registrationJson, null, 2);
  
  const response = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Finality-Agent-Registration',
    },
    body: JSON.stringify({
      description: 'ERC-8004 Agent Registration - Finality Labs',
      public: true,
      files: {
        [filename]: {
          content,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as GitHubErrorResponse;
    const error: GistError = new Error(
      `GitHub Gist upload failed: ${response.status} ${response.statusText} - ${errorData.message || 'Unknown error'}`
    );
    error.status = response.status;
    error.response = errorData;
    throw error;
  }

  const data = await response.json() as {
    id: string;
    html_url: string;
    created_at: string;
    files: Record<string, { raw_url: string }>;
  };

  const rawUrl = data.files[filename]?.raw_url;
  if (!rawUrl) {
    throw new Error('Gist created but raw URL not found');
  }

  return {
    rawUrl,
    htmlUrl: data.html_url,
    id: data.id,
    createdAt: data.created_at,
  };
}

/**
 * Update an existing Gist with new registration data
 * @param gistId The Gist ID to update
 * @param registrationJson The new registration JSON
 * @param githubToken GitHub Personal Access Token with 'gist' scope
 * @param filename The filename in the gist
 * @returns Updated Gist result
 */
export async function updateRegistrationGist(
  gistId: string,
  registrationJson: object,
  githubToken: string,
  filename: string = 'registration.json'
): Promise<GistUploadResult> {
  const content = JSON.stringify(registrationJson, null, 2);
  
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Finality-Agent-Registration',
    },
    body: JSON.stringify({
      files: {
        [filename]: {
          content,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as GitHubErrorResponse;
    const error: GistError = new Error(
      `GitHub Gist update failed: ${response.status} ${response.statusText} - ${errorData.message || 'Unknown error'}`
    );
    error.status = response.status;
    error.response = errorData;
    throw error;
  }

  const data = await response.json() as {
    id: string;
    html_url: string;
    created_at: string;
    files: Record<string, { raw_url: string }>;
  };

  const rawUrl = data.files[filename]?.raw_url;
  if (!rawUrl) {
    throw new Error('Gist updated but raw URL not found');
  }

  return {
    rawUrl,
    htmlUrl: data.html_url,
    id: data.id,
    createdAt: data.created_at,
  };
}

/**
 * Fetch registration from a Gist raw URL
 * @param rawUrl The raw Gist URL (e.g., https://gist.githubusercontent.com/user/gist-id/raw/registration.json)
 * @returns Parsed registration JSON
 */
export async function fetchRegistrationFromGist(rawUrl: string): Promise<object> {
  const response = await fetch(rawUrl, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Finality-Agent-Registration',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch registration from Gist: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data as object;
}

/**
 * Validate GitHub token has gist scope
 * @param githubToken GitHub Personal Access Token
 * @returns true if token is valid and has gist scope
 */
export async function validateGithubToken(githubToken: string): Promise<{ valid: boolean; scopes?: string[] }> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Finality-Agent-Registration',
      },
    });

    if (!response.ok) {
      return { valid: false };
    }

    const scopes = response.headers.get('x-oauth-scopes')?.split(', ').map(s => s.trim()) || [];
    return { valid: true, scopes };
  } catch {
    return { valid: false };
  }
}

/**
 * Check if Gist upload is configured
 */
export function isGistConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.length > 10;
}