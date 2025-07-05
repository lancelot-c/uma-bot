import { postOnDiscord } from "../test/utils";
import { createPublicEthClient, getPendingRequests, logInfo } from "./common";
import { createOctokit, createPullRequest } from "./github";
import 'dotenv/config'


// TODO: get votingRound directly from process.env.GITHUB_OUTPUT in order to minimize RPC calls
const publicClient = createPublicEthClient()
const requests = await getPendingRequests(publicClient)
const nbRequests = requests.length
const pluralString = nbRequests > 1 ? 's' : ''
const votingRound = requests[0].lastVotingRound



// 1. Post notification in #dev channel
await logInfo(`${nbRequests} answer${pluralString} to find today`)


// 2. Create Pull Request
const octokit = createOctokit()
const title = `Answers for voting round ${votingRound}`
const body = `The UMA.rocks voting committee have until 11AM UTC to come to a consensus on this pull request and merge it.`
const pullRequestUrl = await createPullRequest(octokit, title, body)


// 3. Post link to PR in #history channel
let content = `📥 *** NEW VOTING ROUND (${nbRequests} dispute${pluralString})***\n`
content += `The UMA.rocks voting committee have until 11AM UTC to come to a consensus on [this pull request](<${pullRequestUrl}/files>) and merge it.`
await postOnDiscord('', 0, '', [], content)