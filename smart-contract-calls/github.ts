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

// Returns true if successful, false otherwise
export async function updateGithubSecret(newValue: string, octokit: Octokit): Promise<boolean> {

    console.log('Update Github Secret')

    // Encrypt Secret
    await _sodium.ready;
    const sodium = _sodium;

    const secret = newValue
    let [key_id, key] = ['', '']

    try {
        [key_id, key] = await getGithubPublicKey(octokit)
    } catch (error: any) {
        logError(error);
        return false
    }

    //Check if libsodium is ready and then proceed.
    const encrypted_value = await sodium.ready.then(() => {
        // Convert the secret and key to a Uint8Array.
        let binkey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL)
        let binsec = sodium.from_string(secret)

        // Encrypt the secret using libsodium
        let encBytes = sodium.crypto_box_seal(binsec, binkey)

        // Convert the encrypted Uint8Array to Base64
        const encryptedSecret = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL)

        // Print the output
        // console.log(`Encrypted secret: ${encryptedSecret}`)
        return encryptedSecret
    });


    // Update Github Secret
    const gsKey = 'PRIVATE_KEYS'

    try {
        await octokit.request('PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}', {
            owner: 'lancelot-c',
            repo: 'uma-bot',
            secret_name: gsKey,
            encrypted_value,
            key_id,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        })
    } catch (error: any) {
        logError(error);
        return false
    }

    return true
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