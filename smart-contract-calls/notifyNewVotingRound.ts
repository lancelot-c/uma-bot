import { postOnDiscord } from "../test/utils";
import { createPublicEthClient, getPendingRequests, logInfo } from "./common";
import { createOctokit, createPullRequest } from "./github";
import 'dotenv/config'


// TODO: get votingRound directly from process.env.GITHUB_OUTPUT in order to minimize RPC calls
// const publicClient = createPublicEthClient()
// const requests = await getPendingRequests(publicClient)
// const nbRequests = requests.length
// const pluralString = nbRequests > 1 ? 's' : ''
// const votingRound = requests[0].lastVotingRound



// 1. Create Pull Request
const octokit = createOctokit(process.env.VOTING_COMMITTEE_BOT_TOKEN as string)
const prTitle = 'test title'//`Answers for voting round ${votingRound}`
const prBody = 'test body'//`The UMA.rocks voting committee have until 11AM UTC to come to a consensus on this pull request and merge it.`
const pullRequestUrl = await createPullRequest(octokit, prTitle, prBody)


// // 2. Post notification in #voting-committee channel
// const infoTitle = `${nbRequests} answer${pluralString} to find today`
// const infoMessage = `[See pull request](<${pullRequestUrl}/files>)`
// await logInfo(infoTitle, infoMessage, process.env.DISCORD_CHANNEL_VOTING_COMMITTEE_WEBHOOK_URL as string)


// // 3. Post notification in #history channel
// let content = `📥 *** NEW VOTING ROUND (${nbRequests} dispute${pluralString})***\n`
// content += `The UMA.rocks voting committee have until 11AM UTC to come to a consensus on [this pull request](<${pullRequestUrl}/files>) and merge it.`
// await postOnDiscord('', 0, '', [], content)