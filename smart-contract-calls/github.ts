import { Octokit } from "@octokit/core";
import _sodium from 'libsodium-wrappers';
import { logError } from "./common";
import { readFileSync } from 'fs'
import 'dotenv/config'

export function createOctokit(githubToken?: string): Octokit {
    // Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
    if (!githubToken) {
        githubToken = process.env.GH_ACCESS_TOKEN as string
    }
    
    return new Octokit({
        auth: githubToken
    })
}


export async function getGithubPublicKey(octokit: Octokit): Promise<[string, string]> {
    const res = await octokit.request('GET /repos/{owner}/{repo}/actions/secrets/public-key', {
        owner: 'lancelot-c',
        repo: 'uma-bot',
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })

    return [res.data.key_id, res.data.key]
}

// Provide either body or template but not both
export async function createPullRequest(octokit: Octokit, title: string, body?: string, templatePath?: string): Promise<string> {
    
    let parameters: any = {
        owner: 'lancelot-c',
        repo: 'uma-answers',
        title,
        head: 'answers',
        base: 'main',
        draft: false,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
    }

    if (body) {
        
        parameters.body = body

    } else if (templatePath) {

        parameters.body = readFileSync(templatePath, { encoding: 'utf8' })

    }

    const res = await octokit.request('POST /repos/{owner}/{repo}/pulls', parameters)

    // console.log(res)

    const prUrl = res.data.html_url
    return prUrl
}